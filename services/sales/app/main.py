import base64
import hashlib
import json
import os
import uuid
from datetime import datetime, timezone
from decimal import Decimal

import psycopg
from fastapi import FastAPI, Header, HTTPException, Response, status
from pydantic import BaseModel, ConfigDict, Field
from psycopg.types.json import Jsonb

app = FastAPI(title="Jupiter Sales Ledger", version="1.0.0")
DATABASE_URL = os.environ["DATABASE_URL"]
ANNUAL_APR = Decimal("0.145")


class CheckoutRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    vehicleId: uuid.UUID
    financingTermMonths: int | None = Field(default=None, ge=1, le=120)
    acceptTerms: bool


class CheckoutResponse(BaseModel):
    saleId: uuid.UUID
    contractNumber: str
    invoiceId: uuid.UUID
    invoiceNumber: str
    amount: Decimal
    currency: str
    monthlyPayment: Decimal | None
    status: str


def authenticated_subject(encoded_payload: str | None) -> str:
    if not encoded_payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    try:
        payload = json.loads(base64.urlsafe_b64decode(encoded_payload + "=" * (-len(encoded_payload) % 4)))
        subject = payload.get("sub")
        if not isinstance(subject, str) or not subject or len(subject) > 255:
            raise ValueError("invalid subject")
        return subject
    except (ValueError, json.JSONDecodeError, UnicodeDecodeError, AttributeError, TypeError):
        raise HTTPException(status_code=401, detail="Invalid authentication identity") from None


def require_admin(encoded_payload: str | None) -> None:
    authenticated_subject(encoded_payload)
    try:
        payload = json.loads(base64.urlsafe_b64decode(encoded_payload + "=" * (-len(encoded_payload) % 4)))
        roles = payload.get("realm_access", {}).get("roles", [])
    except (ValueError, TypeError, AttributeError):
        raise HTTPException(status_code=401, detail="Invalid authentication identity") from None
    if "admin" not in roles:
        raise HTTPException(status_code=403, detail="Administrator role required")


def calculate_monthly_payment(principal: Decimal, months: int) -> Decimal:
    monthly_rate = ANNUAL_APR / Decimal(12)
    factor = (Decimal(1) + monthly_rate) ** months
    return (principal * monthly_rate * factor / (factor - Decimal(1))).quantize(Decimal("0.01"))


@app.get("/health")
def health() -> dict[str, str]:
    try:
        with psycopg.connect(DATABASE_URL) as connection:
            connection.execute("SELECT 1")
    except psycopg.Error:
        raise HTTPException(status_code=503, detail="database unavailable") from None
    return {"status": "ok"}


@app.get("/api/v1/admin/summary")
def admin_summary(jwt_payload: str | None = Header(default=None, alias="x-jwt-payload")) -> dict[str, int | str]:
    require_admin(jwt_payload)
    try:
        with psycopg.connect(DATABASE_URL) as connection:
            row = connection.execute(
                """SELECT
                     (SELECT count(*) FROM vehicles) AS vehicles,
                     (SELECT count(*) FROM vehicles WHERE status = 'available') AS available,
                     (SELECT count(*) FROM rental_reservations WHERE status = 'confirmed') AS reservations,
                     (SELECT count(*) FROM sales) AS sales,
                     (SELECT COALESCE(sum(sale_price), 0)::text FROM sales) AS sales_revenue"""
            ).fetchone()
        return {"vehicles": row[0], "available": row[1], "reservations": row[2], "sales": row[3], "salesRevenue": row[4]}
    except psycopg.Error:
        raise HTTPException(status_code=503, detail="dashboard temporarily unavailable") from None


@app.post("/api/v1/sales/checkout", response_model=CheckoutResponse)
def checkout(
    body: CheckoutRequest,
    response: Response,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    jwt_payload: str | None = Header(default=None, alias="x-jwt-payload"),
) -> CheckoutResponse:
    if not idempotency_key or not 16 <= len(idempotency_key) <= 128 or not idempotency_key.isprintable():
        raise HTTPException(status_code=400, detail="A valid Idempotency-Key header is required")
    if not body.acceptTerms:
        raise HTTPException(status_code=400, detail="Purchase agreement acceptance is required")
    user_id = authenticated_subject(jwt_payload)
    request_hash = hashlib.sha256(f"{user_id}:{body.vehicleId}:{body.financingTermMonths}:{body.acceptTerms}".encode()).hexdigest()

    try:
        with psycopg.connect(DATABASE_URL) as connection:
            with connection.transaction():
                connection.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))", (idempotency_key,))
                existing = connection.execute(
                          """SELECT s.id, i.id, i.invoice_number, i.amount, i.currency, s.monthly_payment, s.request_hash, c.contract_number
                              FROM sales s JOIN invoices i ON i.sale_id = s.id
                              JOIN sales_contracts c ON c.sale_id = s.id
                       WHERE s.idempotency_key = %s FOR UPDATE""",
                    (idempotency_key,),
                ).fetchone()
                if existing:
                    if existing[6] != request_hash:
                        raise HTTPException(status_code=409, detail="Idempotency key was already used for a different request")
                    response.status_code = status.HTTP_200_OK
                    return CheckoutResponse(saleId=existing[0], contractNumber=existing[7], invoiceId=existing[1], invoiceNumber=existing[2], amount=existing[3], currency=existing[4].strip(), monthlyPayment=existing[5], status="completed")

                vehicle = connection.execute(
                    "SELECT sale_price, status, vin, make, model, model_year FROM vehicles WHERE id = %s FOR UPDATE",
                    (body.vehicleId,),
                ).fetchone()
                if not vehicle:
                    raise HTTPException(status_code=404, detail="Vehicle not found")
                if vehicle[1] != "available" or vehicle[0] is None:
                    raise HTTPException(status_code=409, detail="Vehicle is not available for sale")
                has_future_rental = connection.execute(
                    """SELECT EXISTS (
                         SELECT 1 FROM rental_reservations
                         WHERE vehicle_id = %s AND status IN ('pending', 'confirmed')
                           AND upper(booking_period) > CURRENT_DATE
                       )""",
                    (body.vehicleId,),
                ).fetchone()[0]
                if has_future_rental:
                    raise HTTPException(status_code=409, detail="Vehicle has an upcoming rental and cannot be sold")

                amount = Decimal(vehicle[0]).quantize(Decimal("0.01"))
                monthly_payment = calculate_monthly_payment(amount, body.financingTermMonths) if body.financingTermMonths else None
                sale_id = uuid.uuid4()
                invoice_id = uuid.uuid4()
                contract_number = f"JUP-CON-{datetime.now(timezone.utc):%Y%m%d}-{sale_id.hex[:8].upper()}"
                invoice_number = f"JUP-{datetime.now(timezone.utc):%Y%m%d}-{sale_id.hex[:8].upper()}"
                connection.execute(
                    """INSERT INTO sales (id, vehicle_id, user_id, sale_price, financing_term_months, financing_apr, monthly_payment, idempotency_key, request_hash)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                    (sale_id, body.vehicleId, user_id, amount, body.financingTermMonths, ANNUAL_APR * 100 if body.financingTermMonths else None, monthly_payment, idempotency_key, request_hash),
                )
                connection.execute(
                    """INSERT INTO sales_contracts (sale_id, contract_number, status, terms)
                       VALUES (%s, %s, 'accepted', %s)""",
                    (sale_id, contract_number, Jsonb({"vehicleId": str(body.vehicleId), "vin": vehicle[2], "make": vehicle[3], "model": vehicle[4], "modelYear": vehicle[5], "buyerId": user_id, "purchasePrice": str(amount), "currency": "KES", "financingTermMonths": body.financingTermMonths, "apr": str(ANNUAL_APR * 100) if body.financingTermMonths else None, "monthlyPayment": str(monthly_payment) if monthly_payment is not None else None, "accepted": body.acceptTerms})),
                )
                connection.execute(
                    "UPDATE vehicles SET status = 'sold', updated_at = now() WHERE id = %s",
                    (body.vehicleId,),
                )
                connection.execute(
                    "INSERT INTO invoices (id, sale_id, invoice_number, amount) VALUES (%s, %s, %s, %s)",
                    (invoice_id, sale_id, invoice_number, amount),
                )
                connection.execute(
                    "INSERT INTO event_outbox (event_type, aggregate_id, payload) VALUES (%s, %s, %s)",
                    ("sale.completed", sale_id, Jsonb({"saleId": str(sale_id), "contractNumber": contract_number, "vehicleId": str(body.vehicleId), "invoiceId": str(invoice_id), "userId": user_id, "amount": str(amount), "currency": "KES"})),
                )
                return CheckoutResponse(saleId=sale_id, contractNumber=contract_number, invoiceId=invoice_id, invoiceNumber=invoice_number, amount=amount, currency="KES", monthlyPayment=monthly_payment, status="completed")
    except HTTPException:
        raise
    except psycopg.Error:
        raise HTTPException(status_code=503, detail="sales ledger temporarily unavailable") from None