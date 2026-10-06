import { Pool } from 'pg';

export interface ReservationInput {
  vehicleId: string;
  userId: string;
  startDate: string;
  endDate: string;
}

export interface ReservationResult {
  reservationId: string;
  totalAmount: string;
  currency: 'KES';
}

export class ReservationConflictError extends Error {
  constructor(message = 'The vehicle is unavailable for those dates.') {
    super(message);
    this.name = 'ReservationConflictError';
  }
}

export class VehicleNotFoundError extends Error {
  constructor() {
    super('Rental vehicle not found or unavailable.');
    this.name = 'VehicleNotFoundError';
  }
}

export async function createReservation(pool: Pool, input: ReservationInput): Promise<ReservationResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const vehicle = await client.query<{ daily_rate: string }>(
      `SELECT daily_rate FROM vehicles
       WHERE id = $1 AND status = 'available' AND daily_rate IS NOT NULL
       FOR UPDATE`,
      [input.vehicleId],
    );
    if (!vehicle.rowCount || !vehicle.rows[0]) throw new VehicleNotFoundError();

    const dates = await client.query<{ days: number }>(
      'SELECT ($2::date - $1::date)::int AS days',
      [input.startDate, input.endDate],
    );
    const days = dates.rows[0]?.days;
    if (!days || days < 1 || days > 90) throw new RangeError('Rental must be between 1 and 90 days.');

    const totalAmount = (Number(vehicle.rows[0].daily_rate) * days).toFixed(2);
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO rental_reservations (vehicle_id, user_id, booking_period, total_amount, status)
       VALUES ($1, $2, daterange($3::date, $4::date, '[)'), $5, 'confirmed')
       RETURNING id`,
      [input.vehicleId, input.userId, input.startDate, input.endDate, totalAmount],
    );
    const reservationId = inserted.rows[0]?.id;
    if (!reservationId) throw new Error('Reservation insert returned no identifier.');

    await client.query(
      `INSERT INTO event_outbox (event_type, aggregate_id, payload)
       VALUES ('vehicle.booked', $1, $2::jsonb)`,
      [reservationId, JSON.stringify({ reservationId, vehicleId: input.vehicleId, userId: input.userId, startDate: input.startDate, endDate: input.endDate, totalAmount, currency: 'KES' })],
    );
    await client.query('COMMIT');
    return { reservationId, totalAmount, currency: 'KES' };
  } catch (error) {
    await client.query('ROLLBACK');
    if (isPgError(error) && error.code === '23P01') throw new ReservationConflictError();
    throw error;
  } finally {
    client.release();
  }
}

function isPgError(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error;
}