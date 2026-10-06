import { useState } from 'react';
import { ArrowRight, BadgeCheck, LoaderCircle, ShieldCheck } from 'lucide-react';
import type Keycloak from 'keycloak-js';
import { apiBase, demoMode, formatKES, type Vehicle } from './api';

interface CheckoutProps {
  vehicle: Vehicle;
  auth: Keycloak;
  onLogin: () => void;
}

interface CheckoutResult {
  contractNumber: string;
  invoiceNumber: string;
  amount: string;
  monthlyPayment: string | null;
  status: string;
}

export function Checkout({ vehicle, auth, onLogin }: CheckoutProps) {
  const [term, setTerm] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [result, setResult] = useState<CheckoutResult | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const price = Number(vehicle.salePrice ?? 0);

  async function purchase(): Promise<void> {
    if (!auth.authenticated) {
      onLogin();
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      await auth.updateToken(30);
      const response = await fetch(`${apiBase}/api/v1/sales/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token ?? ''}`, 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ vehicleId: vehicle.id, financingTermMonths: term ? Number(term) : null, acceptTerms: acceptedTerms }),
      });
      const body = await response.json() as CheckoutResult & { detail?: string };
      if (!response.ok) throw new Error(body.detail ?? 'Checkout could not be completed.');
      setResult(body);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Checkout could not be completed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="booking-panel checkout-panel" aria-labelledby="checkout-title">
      <div className="booking-panel__heading"><div><span className="section-kicker">JUPITER KENYA</span><h2 id="checkout-title">Make it yours.</h2></div><span className="checkout-price">{formatKES(price)}</span></div>
      <div className="booking-panel__vehicle"><img src={vehicle.imageUrl ?? ''} alt="" /><div><strong>{vehicle.year} {vehicle.make} {vehicle.model}</strong><span>Vehicle purchase · KES</span></div></div>
      <label className="finance-select">Financing option
        <select value={term} onChange={(event) => { setTerm(event.target.value); setResult(null); setIdempotencyKey(crypto.randomUUID()); }}>
          <option value="">Pay in full</option>
          <option value="36">36 months · 14.5% APR estimate</option>
          <option value="48">48 months · 14.5% APR estimate</option>
          <option value="60">60 months · 14.5% APR estimate</option>
          <option value="72">72 months · 14.5% APR estimate</option>
        </select>
      </label>
      {term && <p className="finance-estimate">Illustrative payment about {formatKES((price * (0.145 / 12) * (1 + 0.145 / 12) ** Number(term)) / ((1 + 0.145 / 12) ** Number(term) - 1))} / month</p>}
      <label className="terms-acceptance"><input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} /><span>I agree to the generated purchase agreement and financing disclosures.</span></label>
      {message && <p className="inline-message inline-message--error" role="alert">{message}</p>}
        {result ? <div className="purchase-confirmation" role="status"><BadgeCheck size={22} /><div><strong>Purchase recorded</strong><span>Contract {result.contractNumber} · Invoice {result.invoiceNumber} · {formatKES(Number(result.amount))}</span></div></div> : <button className="button button--primary button--wide" onClick={() => void purchase()} disabled={demoMode || busy || !acceptedTerms}>
          {busy ? <LoaderCircle className="spin" size={17} /> : demoMode ? 'Purchases unavailable in preview' : auth.authenticated ? <>Confirm vehicle purchase <ArrowRight size={17} /></> : <>Sign in to continue <ArrowRight size={17} /> </>}
      </button>}
      <p className="secure-note"><ShieldCheck size={14} /> Purchase, invoice, and ledger entry are committed together.</p>
    </section>
  );
}