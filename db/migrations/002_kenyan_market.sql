ALTER TABLE rental_reservations ADD COLUMN IF NOT EXISTS currency CHAR(3) NOT NULL DEFAULT 'KES';
ALTER TABLE sales ADD COLUMN IF NOT EXISTS currency CHAR(3) NOT NULL DEFAULT 'KES';
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS image_urls JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS video_url TEXT;
ALTER TABLE invoices ALTER COLUMN currency SET DEFAULT 'KES';

UPDATE rental_reservations SET currency = 'KES' WHERE currency <> 'KES';
UPDATE sales SET currency = 'KES' WHERE currency <> 'KES';
UPDATE invoices SET currency = 'KES' WHERE currency <> 'KES';

UPDATE vehicles
SET status = 'maintenance', updated_at = now()
WHERE vin IN ('1HGBH41JXMN109186', '1FTFW1E50PFA10001', '5YJ3E1EA7PF100002', '1GNSKCKD4PR100003');

INSERT INTO vehicles (vin, make, model, model_year, vehicle_type, sale_price, daily_rate, image_url, description)
VALUES
 ('JTDBR32E502123456', 'Toyota', 'Corolla Fielder Hybrid', 2019, 'sedan', 1850000, 5500, 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=1200&q=85', 'Right-hand drive hybrid wagon, economical on Nairobi commutes and ready for a weekend upcountry.'),
 ('JTEBU3FJ8LK123456', 'Toyota', 'Harrier Elegance', 2020, 'suv', 3850000, 14000, 'https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?auto=format&fit=crop&w=1200&q=85', 'Locally popular luxury SUV import with right-hand drive, elevated ground clearance and a refined cabin.'),
 ('NCP16001234567890', 'Toyota', 'Probox DX', 2018, 'van', 1120000, 4500, 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=1200&q=85', 'Practical right-hand drive workhorse with a spacious load area and accessible running costs.'),
 ('JF2SJABC5KH123456', 'Subaru', 'Forester X-Break', 2019, 'suv', 2750000, 10500, 'https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?auto=format&fit=crop&w=1200&q=85', 'All-wheel-drive family SUV, right-hand drive, suited to mixed city and rural roads.'),
 ('NT32ABC1234567890', 'Nissan', 'X-Trail 20X', 2019, 'suv', 2450000, 9000, 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=1200&q=85', 'Versatile seven-seat crossover with generous luggage space for family trips.')
ON CONFLICT (vin) DO UPDATE SET
    make = EXCLUDED.make,
    model = EXCLUDED.model,
    model_year = EXCLUDED.model_year,
    vehicle_type = EXCLUDED.vehicle_type,
    sale_price = EXCLUDED.sale_price,
    daily_rate = EXCLUDED.daily_rate,
    status = 'available',
    image_url = EXCLUDED.image_url,
    description = EXCLUDED.description,
    updated_at = now();