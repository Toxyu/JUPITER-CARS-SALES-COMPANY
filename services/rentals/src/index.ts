import { randomUUID } from 'node:crypto';
import express, { ErrorRequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { Pool } from 'pg';
import { z } from 'zod';
import { createReservation, ReservationConflictError, VehicleNotFoundError } from './reservations';

const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 20, connectionTimeoutMillis: 5000 });
const port = Number(process.env.PORT ?? 3001);
const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const reservationSchema = z.object({
  vehicleId: z.string().uuid(),
  startDate: z.string().regex(isoDate),
  endDate: z.string().regex(isoDate),
}).strict();

app.disable('x-powered-by');
app.use(helmet());
app.use(express.json({ limit: '16kb', type: 'application/json' }));
app.use(rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false }));
app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch {
    res.status(503).json({ status: 'unavailable' });
  }
});

app.get('/api/v1/rentals/availability', async (req, res, next) => {
  const query = z.object({ vehicleId: z.string().uuid(), startDate: z.string().regex(isoDate), endDate: z.string().regex(isoDate) }).safeParse(req.query);
  if (!query.success) return res.status(400).json({ error: 'Invalid availability request.' });
  if (query.data.endDate <= query.data.startDate || !isRealDate(query.data.startDate) || !isRealDate(query.data.endDate)) {
    return res.status(400).json({ error: 'Provide a valid date range with endDate after startDate.' });
  }
  try {
    const result = await pool.query(
      `SELECT EXISTS (
         SELECT 1 FROM rental_reservations
         WHERE vehicle_id = $1 AND status IN ('pending', 'confirmed')
           AND booking_period && daterange($2::date, $3::date, '[)')
       ) AS reserved`,
      [query.data.vehicleId, query.data.startDate, query.data.endDate],
    );
    res.json({ available: !result.rows[0].reserved });
  } catch (error) {
    next(error);
  }
});

app.post('/api/v1/rentals/reserve', async (req, res, next) => {
  const parsed = reservationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid reservation request.', details: parsed.error.flatten().fieldErrors });
  if (parsed.data.endDate <= parsed.data.startDate) return res.status(400).json({ error: 'endDate must be after startDate.' });
  if (!isRealDate(parsed.data.startDate) || !isRealDate(parsed.data.endDate)) return res.status(400).json({ error: 'Dates must be valid calendar dates.' });
  const userId = authenticatedSubject(req.get('x-jwt-payload'));
  if (!userId) return res.status(401).json({ error: 'Authentication required.' });

  try {
    const requestId = randomUUID();
    const reservation = await createReservation(pool, { ...parsed.data, userId });
    res.status(201).json({ ...reservation, status: 'confirmed', requestId });
  } catch (error) {
    next(error);
  }
});

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ReservationConflictError) return res.status(409).json({ error: error.message });
  if (error instanceof VehicleNotFoundError) return res.status(404).json({ error: error.message });
  if (error instanceof RangeError) return res.status(400).json({ error: error.message });
  console.error('request failed', { name: error instanceof Error ? error.name : 'UnknownError' });
  return res.status(500).json({ error: 'Internal server error.' });
};
app.use(errorHandler);

function isRealDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function authenticatedSubject(encodedPayload: string | undefined): string | undefined {
  if (!encodedPayload) return undefined;
  try {
    const payload: unknown = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    if (typeof payload !== 'object' || payload === null || !('sub' in payload)) return undefined;
    const subject = (payload as { sub?: unknown }).sub;
    return typeof subject === 'string' && subject.length > 0 && subject.length <= 255 ? subject : undefined;
  } catch {
    return undefined;
  }
}

const server = app.listen(port, '0.0.0.0', () => console.info(`Rental API listening on ${port}`));
async function shutdown(signal: string): Promise<void> {
  console.info(`${signal} received; shutting down`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));