import { useState } from 'react';
import { ArrowRight, BadgeCheck, LoaderCircle, ShieldCheck } from 'lucide-react';
import type Keycloak from 'keycloak-js';
import { apiBase, type Vehicle } from './api';

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
  const [freight, setFreight] = useState('');
  const [insurance, setInsurance] = useState('');
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
      <div className="booking-panel__heading"><div><span className="section-kicker">JUPITER SALES</span><h2 id="checkout-title">Make it yours.</h2></div><span className="checkout-price">${price.toLocaleString('en-US')}</span></div>
      <div className="booking-panel__vehicle"><img src={vehicle.imageUrl ?? ''} alt="" /><div><strong>{vehicle.year} {vehicle.make} {vehicle.model}</strong><span>Vehicle purchase · USD</span></div></div>
      <details className="cif-calculator">
        <summary>Estimate CIF to a destination port</summary>
        <div className="cif-calculator__fields">
          <label>Freight (USD)<input type="number" min="0" step="0.01" inputMode="decimal" value={freight} onChange={(event) => setFreight(event.target.value)} placeholder="0.00" /></label>
          <label>Insurance (USD)<input type="number" min="0" step="0.01" inputMode="decimal" value={insurance} onChange={(event) => setInsurance(event.target.value)} placeholder="0.00" /></label>
        </div>
        <div className="cif-calculator__total"><span>Indicative CIF</span><strong>${(price + Math.max(0, Number(freight) || 0) + Math.max(0, Number(insurance) || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
        <p>Vehicle price + entered freight + entered insurance. Excludes customs, duties, and inland delivery; this estimate does not alter checkout pricing.</p>
      </details>
      <label className="finance-select">Financing option
        <select value={term} onChange={(event) => { setTerm(event.target.value); setResult(null); setIdempotencyKey(crypto.randomUUID()); }}>
          <option value="">Pay in full</option>
          <option value="36">36 months · 7.9% APR</option>
          <option value="48">48 months · 7.9% APR</option>
          <option value="60">60 months · 7.9% APR</option>
          <option value="72">72 months · 7.9% APR</option>
        </select>
      </label>
      {term && <p className="finance-estimate">Estimated payment about ${((price * (0.079 / 12) * (1 + 0.079 / 12) ** Number(term)) / ((1 + 0.079 / 12) ** Number(term) - 1)).toLocaleString('en-US', { maximumFractionDigits: 2 })} / month</p>}
      <label className="terms-acceptance"><input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} /><span>I agree to the generated purchase agreement and financing disclosures.</span></label>
      {message && <p className="inline-message inline-message--error" role="alert">{message}</p>}
      {result ? <div className="purchase-confirmation" role="status"><BadgeCheck size={22} /><div><strong>Purchase recorded</strong><span>Contract {result.contractNumber} · Invoice {result.invoiceNumber} · ${Number(result.amount).toLocaleString('en-US')}</span></div></div> : <button className="button button--primary button--wide" onClick={() => void purchase()} disabled={busy || !acceptedTerms}>
          {busy ? <LoaderCircle className="spin" size={17} /> : auth.authenticated ? <>Confirm vehicle purchase <ArrowRight size={17} /></> : <>Sign in to continue <ArrowRight size={17} /> </>}
      </button>}
      <p className="secure-note"><ShieldCheck size={14} /> Purchase, invoice, and ledger entry are committed together.</p>
    </section>
  );
}