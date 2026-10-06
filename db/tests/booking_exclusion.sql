DO $$
DECLARE
    test_vehicle UUID;
    test_vin TEXT := '2' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16));
BEGIN
    INSERT INTO vehicles (vin, make, model, model_year, vehicle_type, daily_rate)
    VALUES (test_vin, 'Test', 'Exclusion', 2026, 'sedan', 1)
    RETURNING id INTO test_vehicle;

    INSERT INTO rental_reservations (vehicle_id, user_id, booking_period, total_amount, status)
    VALUES (test_vehicle, 'integration-test', daterange('2030-01-01', '2030-01-04', '[)'), 3, 'confirmed');

    INSERT INTO rental_reservations (vehicle_id, user_id, booking_period, total_amount, status)
    VALUES (test_vehicle, 'integration-test', daterange('2030-01-04', '2030-01-06', '[)'), 2, 'confirmed');

    BEGIN
        INSERT INTO rental_reservations (vehicle_id, user_id, booking_period, total_amount, status)
        VALUES (test_vehicle, 'integration-test', daterange('2030-01-03', '2030-01-05', '[)'), 2, 'confirmed');
        RAISE EXCEPTION 'overlapping active booking was accepted';
    EXCEPTION WHEN exclusion_violation THEN
        NULL;
    END;

    INSERT INTO rental_reservations (vehicle_id, user_id, booking_period, total_amount, status)
    VALUES (test_vehicle, 'integration-test', daterange('2030-01-02', '2030-01-05', '[)'), 0, 'cancelled');

    DELETE FROM rental_reservations WHERE vehicle_id = test_vehicle;
    DELETE FROM vehicles WHERE id = test_vehicle;
END;
$$;