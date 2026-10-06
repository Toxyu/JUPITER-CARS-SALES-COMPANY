CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vin VARCHAR(17) NOT NULL UNIQUE CHECK (vin ~ '^[A-HJ-NPR-Z0-9]{17}$'),
    make VARCHAR(60) NOT NULL,
    model VARCHAR(80) NOT NULL,
    model_year SMALLINT NOT NULL CHECK (model_year BETWEEN 1886 AND 2100),
    vehicle_type VARCHAR(24) NOT NULL CHECK (vehicle_type IN ('sedan', 'suv', 'truck', 'coupe', 'van', 'other')),
    sale_price NUMERIC(12, 2) CHECK (sale_price IS NULL OR sale_price >= 0),
    daily_rate NUMERIC(10, 2) CHECK (daily_rate IS NULL OR daily_rate >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'reserved', 'sold', 'maintenance')),
    image_url TEXT,
    description TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (sale_price IS NOT NULL OR daily_rate IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_vehicles_search ON vehicles (status, vehicle_type, sale_price, daily_rate);

CREATE TABLE IF NOT EXISTS rental_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
    user_id VARCHAR(255) NOT NULL,
    booking_period DATERANGE NOT NULL,
    total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'confirmed' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (NOT isempty(booking_period)),
    CONSTRAINT no_overlapping_active_rentals
      EXCLUDE USING gist (vehicle_id WITH =, booking_period WITH &&)
      WHERE (status IN ('pending', 'confirmed'))
);

CREATE INDEX IF NOT EXISTS idx_reservations_vehicle ON rental_reservations (vehicle_id);

CREATE TABLE IF NOT EXISTS sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID NOT NULL UNIQUE REFERENCES vehicles(id) ON DELETE RESTRICT,
    user_id VARCHAR(255) NOT NULL,
    sale_price NUMERIC(12, 2) NOT NULL CHECK (sale_price >= 0),
    financing_term_months SMALLINT CHECK (financing_term_months IS NULL OR financing_term_months BETWEEN 1 AND 120),
    financing_apr NUMERIC(5, 2),
    monthly_payment NUMERIC(12, 2),
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    request_hash CHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sales_contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID NOT NULL UNIQUE REFERENCES sales(id) ON DELETE RESTRICT,
    contract_number VARCHAR(48) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL CHECK (status IN ('accepted', 'void')),
    terms JSONB NOT NULL,
    accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID NOT NULL UNIQUE REFERENCES sales(id) ON DELETE RESTRICT,
    invoice_number VARCHAR(40) NOT NULL UNIQUE,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS event_outbox (
    id BIGSERIAL PRIMARY KEY,
    event_type VARCHAR(120) NOT NULL,
    aggregate_id UUID NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at TIMESTAMPTZ,
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_outbox_pending ON event_outbox (next_attempt_at, id) WHERE published_at IS NULL;

INSERT INTO vehicles (vin, make, model, model_year, vehicle_type, sale_price, daily_rate, image_url, description)
VALUES
 ('1HGBH41JXMN109186', 'Honda', 'Accord Touring', 2024, 'sedan', 32900, 89, 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=1200&q=85', 'Comfortable long-distance sedan with a quiet cabin and driver assistance.'),
 ('1FTFW1E50PFA10001', 'Ford', 'F-150 Lariat', 2023, 'truck', 58900, 149, 'https://images.unsplash.com/photo-1551830820-330a71b99659?auto=format&fit=crop&w=1200&q=85', 'Full-size pickup with a capable bed, all-weather traction, and premium interior.'),
 ('5YJ3E1EA7PF100002', 'Tesla', 'Model 3 Long Range', 2024, 'sedan', 42900, 129, 'https://images.unsplash.com/photo-1560958089-b8a1929cea89?auto=format&fit=crop&w=1200&q=85', 'Electric sedan with long-range driving and a minimal, technology-led cabin.'),
 ('1GNSKCKD4PR100003', 'Chevrolet', 'Tahoe Premier', 2023, 'suv', 64900, 179, 'https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?auto=format&fit=crop&w=1200&q=85', 'Three-row SUV with generous cargo room for family trips and airport runs.')
ON CONFLICT (vin) DO NOTHING;