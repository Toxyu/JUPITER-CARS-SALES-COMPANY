import { useEffect, useState } from 'react';
import { ArrowRight, CalendarDays, Check, LoaderCircle, ShieldCheck } from 'lucide-react';
import type Keycloak from 'keycloak-js';
import { apiBase, checkAvailability, demoMode, formatKES, type Vehicle } from './api';

interface RentalBookingProps {
  vehicle: Vehicle;
  auth: Keycloak;
  onLogin: () => void;
}

function dateString(date: Date): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function dayCount(startDate: string, endDate: string): number {
  return Math.max(0, Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000));
}

export function RentalBooking({ vehicle, auth, onLogin }: RentalBookingProps) {
  const today = dateString(new Date());
  const tomorrow = dateString(new Date(Date.now() + 86_400_000));
  const afterFourDays = dateString(new Date(Date.now() + 4 * 86_400_000));
  const [startDate, setStartDate] = useState(tomorrow);
  const [endDate, setEndDate] = useState(afterFourDays);
  const [availability, setAvailability] = useState<'checking' | 'available' | 'reserved' | 'confirmed' | 'error' | 'preview'>('checking');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const days = dayCount(startDate, endDate);
  const estimate = days * Number(vehicle.dailyRate ?? 0);

  useEffect(() => {
    const controller = new AbortController();
    setAvailability('checking');
    setMessage('');
    if (demoMode) {
      setAvailability('preview');
      return () => controller.abort();
    }
    if (!startDate || !endDate || endDate <= startDate || days > 90) {
      setAvailability('error');
      return () => controller.abort();
    }
    const timer = window.setTimeout(() => {
      void checkAvailability(vehicle.id, startDate, endDate, controller.signal)
        .then((available) => setAvailability(available ? 'available' : 'reserved'))
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError') return;
          setAvailability('error');
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [vehicle.id, startDate, endDate, days]);

  async function reserve(): Promise<void> {
    if (!auth.authenticated) {
      onLogin();
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      await auth.updateToken(30);
      const response = await fetch(`${apiBase}/api/v1/rentals/reserve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token ?? ''}` },
        body: JSON.stringify({ vehicleId: vehicle.id, startDate, endDate }),
      });
      const result = await response.json() as { reservationId?: string; totalAmount?: string; error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Reservation could not be completed.');
      setMessage(`Reservation confirmed. Reference ${result.reservationId?.slice(0, 8).toUpperCase()} · ${formatKES(Number(result.totalAmount))}`);
      setAvailability('confirmed');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Reservation could not be completed.');
      if (error instanceof Error && error.message.toLowerCase().includes('unavailable')) setAvailability('reserved');
    } finally {
      setBusy(false);
    }
  }

  const statusText = availability === 'preview' ? 'Live availability unavailable' : availability === 'checking' ? 'Checking dates…' : availability === 'available' ? 'Dates available' : availability === 'confirmed' ? 'Reservation confirmed' : availability === 'reserved' ? 'Already reserved for these dates' : 'Choose a valid date range';
  return (
    <section className="booking-panel" aria-labelledby="booking-title">
      <div className="booking-panel__heading">
        <div><span className="section-kicker"><CalendarDays size={14} /> YOUR RENTAL</span><h2 id="booking-title">Plan the drive.</h2></div>
        <div className={`availability availability--${availability}`} role="status"><span />{statusText}</div>
      </div>
      <div className="booking-panel__vehicle"><img src={vehicle.imageUrl ?? ''} alt="" /><div><strong>{vehicle.year} {vehicle.make} {vehicle.model}</strong><span>{formatKES(Number(vehicle.dailyRate ?? 0))} per day</span></div></div>
      <div className="date-fields">
        <label>Pickup date<input type="date" min={today} value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
        <label>Return date<input type="date" min={startDate || today} value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
      </div>
      <div className="booking-total"><div><span>Estimated total · KES</span><small>{days} {days === 1 ? 'day' : 'days'} · before applicable taxes and fees</small></div><strong>{formatKES(estimate)}</strong></div>
      {message && <p className={`inline-message${availability === 'reserved' ? ' inline-message--error' : ''}`} role="status">{message}</p>}
        <button className="button button--primary button--wide" onClick={() => void reserve()} disabled={demoMode || busy || availability !== 'available'}>
          {busy ? <LoaderCircle className="spin" size={17} /> : demoMode ? 'Reservations unavailable in preview' : auth.authenticated ? <><Check size={17} /> Confirm reservation</> : <>Sign in to reserve <ArrowRight size={17} /> </>}
        </button>
      <p className="secure-note"><ShieldCheck size={14} /> Your dates are protected against double-booking.</p>
    </section>
  );
}