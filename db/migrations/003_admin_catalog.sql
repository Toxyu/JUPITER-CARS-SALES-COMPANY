CREATE TABLE IF NOT EXISTS locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(80) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    county VARCHAR(100) NOT NULL,
    country CHAR(2) NOT NULL DEFAULT 'KE',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO locations (slug, name, county) VALUES
 ('nairobi', 'Nairobi', 'Nairobi'),
 ('mombasa', 'Mombasa', 'Mombasa'),
 ('kisumu', 'Kisumu', 'Kisumu'),
 ('nakuru', 'Nakuru', 'Nakuru'),
 ('nyeri', 'Nyeri', 'Nyeri'),
 ('thika', 'Thika', 'Kiambu'),
 ('eldoret', 'Eldoret', 'Uasin Gishu')
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS variant VARCHAR(100) NOT NULL DEFAULT '';
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS mileage_km INTEGER CHECK (mileage_km IS NULL OR mileage_km >= 0);
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS fuel_type VARCHAR(24) NOT NULL DEFAULT 'unknown';
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS transmission VARCHAR(24) NOT NULL DEFAULT 'unknown';
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS engine_cc INTEGER CHECK (engine_cc IS NULL OR engine_cc BETWEEN 0 AND 20000);
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS seats SMALLINT CHECK (seats IS NULL OR seats BETWEEN 1 AND 80);
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS color VARCHAR(40) NOT NULL DEFAULT '';
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES locations(id) ON DELETE RESTRICT;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS weekly_rate NUMERIC(12, 2) CHECK (weekly_rate IS NULL OR weekly_rate >= 0);
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS monthly_rate NUMERIC(12, 2) CHECK (monthly_rate IS NULL OR monthly_rate >= 0);
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS deposit NUMERIC(12, 2) CHECK (deposit IS NULL OR deposit >= 0);
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS currency CHAR(3) NOT NULL DEFAULT 'KES';

UPDATE vehicles
SET location_id = (SELECT id FROM locations WHERE slug = 'nairobi')
WHERE location_id IS NULL AND status <> 'maintenance';

UPDATE vehicles SET mileage_km=62000, fuel_type='hybrid', transmission='automatic', engine_cc=1500, seats=5, color='Silver', location_id=(SELECT id FROM locations WHERE slug='nairobi') WHERE vin='JTDBR32E502123456';
UPDATE vehicles SET mileage_km=48000, fuel_type='petrol', transmission='automatic', engine_cc=2000, seats=5, color='Black', location_id=(SELECT id FROM locations WHERE slug='nairobi') WHERE vin='JTEBU3FJ8LK123456';
UPDATE vehicles SET mileage_km=78000, fuel_type='petrol', transmission='automatic', engine_cc=1500, seats=5, color='White', location_id=(SELECT id FROM locations WHERE slug='mombasa') WHERE vin='NCP16001234567890';
UPDATE vehicles SET mileage_km=54000, fuel_type='petrol', transmission='automatic', engine_cc=2000, seats=5, color='Blue', location_id=(SELECT id FROM locations WHERE slug='nakuru') WHERE vin='JF2SJABC5KH123456';
UPDATE vehicles SET mileage_km=69000, fuel_type='petrol', transmission='automatic', engine_cc=2000, seats=7, color='Grey', location_id=(SELECT id FROM locations WHERE slug='kisumu') WHERE vin='NT32ABC1234567890';

UPDATE vehicles SET image_urls=jsonb_build_array(image_url)
WHERE status <> 'maintenance' AND image_url IS NOT NULL AND image_urls='[]'::jsonb;

INSERT INTO vehicle_images (vehicle_id, image_url, alt_text, sort_order, is_primary)
SELECT id, image_url, model_year || ' ' || make || ' ' || model || ' exterior', 0, TRUE
FROM vehicles v
WHERE v.status <> 'maintenance' AND v.image_url IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM vehicle_images images WHERE images.vehicle_id=v.id);

CREATE INDEX IF NOT EXISTS idx_vehicles_public_catalog
  ON vehicles (is_published, status, is_featured DESC, created_at DESC)
  WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_vehicles_location ON vehicles (location_id, status);

CREATE TABLE IF NOT EXISTS vehicle_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL CHECK (image_url ~ '^https://'),
    object_key TEXT,
    alt_text VARCHAR(240) NOT NULL,
    sort_order SMALLINT NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    mime_type VARCHAR(80),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (vehicle_id, sort_order)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_primary_vehicle_image
  ON vehicle_images (vehicle_id) WHERE is_primary;

CREATE TABLE IF NOT EXISTS vehicle_features (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    category VARCHAR(32) NOT NULL DEFAULT 'general',
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (vehicle_id, category, name)
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    actor_id VARCHAR(255) NOT NULL,
    actor_roles JSONB NOT NULL DEFAULT '[]'::jsonb,
    action VARCHAR(80) NOT NULL,
    entity_type VARCHAR(80) NOT NULL,
    entity_id UUID NOT NULL,
    before_state JSONB,
    after_state JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs (entity_type, entity_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL,
    role VARCHAR(32) NOT NULL CHECK (role IN ('SUPER_ADMIN', 'ADMIN', 'SALES_MANAGER', 'RENTAL_MANAGER', 'CONTENT_MANAGER', 'SUPPORT')),
    granted_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
);

CREATE TABLE IF NOT EXISTS site_settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_by VARCHAR(255) NOT NULL DEFAULT 'system',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO site_settings (key, value) VALUES
 ('currency', '"KES"'::jsonb),
 ('company', '{"name":"Jupiter Cars","country":"KE"}'::jsonb)
ON CONFLICT (key) DO NOTHING;