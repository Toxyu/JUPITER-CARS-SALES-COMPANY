import base64
import json
import os
import unittest
from decimal import Decimal

os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost/test")

from app.main import authenticated_subject, calculate_monthly_payment


class SalesHelpersTest(unittest.TestCase):
    def test_financing_payment_is_positive_and_rounded(self):
        payment = calculate_monthly_payment(Decimal("30000.00"), 60)
        self.assertGreater(payment, Decimal("0"))
        self.assertEqual(payment, payment.quantize(Decimal("0.01")))

    def test_subject_is_read_from_signed_gateway_payload(self):
        payload = base64.urlsafe_b64encode(json.dumps({"sub": "customer-123"}).encode()).decode().rstrip("=")
        self.assertEqual(authenticated_subject(payload), "customer-123")

    def test_missing_subject_is_rejected(self):
        with self.assertRaises(Exception):
            authenticated_subject(None)