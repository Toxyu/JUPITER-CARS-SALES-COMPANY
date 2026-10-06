import { useEffect, useState } from 'react';
import { Activity, CarFront, CircleDollarSign, RefreshCw, TicketCheck } from 'lucide-react';
import type Keycloak from 'keycloak-js';
import { apiBase, formatKES } from './api';
import { AdminVehicles } from './AdminVehicles';

interface Summary {
  vehicles: number;
  available: number;
  reservations: number;
  sales: number;
  salesRevenue: string;
}

interface AdminDashboardProps { auth: Keycloak }

export function AdminDashboard({ auth }: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'vehicles'>('overview');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    void auth.updateToken(30).then(() => fetch(`${apiBase}/api/v1/admin/summary`, {
      headers: { Authorization: `Bearer ${auth.token ?? ''}` }, signal: controller.signal,
    })).then(async (response) => {
      if (!response.ok) throw new Error(response.status === 403 ? 'Your account does not have the administrator role.' : 'Dashboard data is unavailable.');
      setSummary(await response.json() as Summary);
    }).catch((reason: unknown) => {
      if (reason instanceof DOMException && reason.name === 'AbortError') return;
      setError(reason instanceof Error ? reason.message : 'Dashboard data is unavailable.');
    }).finally(() => setLoading(false));
    return () => controller.abort();
  }, [auth]);

  return (
    <section className="admin-view">
      <div className="admin-view__heading"><div><span className="section-kicker">OPERATIONS</span><h1>Dashboard</h1></div><span className="live-indicator"><span /> Live metrics</span></div>
      <nav className="admin-tabs" aria-label="Admin sections"><button className={activeTab === 'overview' ? 'admin-tab is-active' : 'admin-tab'} onClick={() => setActiveTab('overview')}>Overview</button><button className={activeTab === 'vehicles' ? 'admin-tab is-active' : 'admin-tab'} onClick={() => setActiveTab('vehicles')}>Vehicles</button></nav>
      {activeTab === 'vehicles' ? <AdminVehicles auth={auth} /> : loading ? <div className="loading-state"><RefreshCw className="spin" /> Loading operational data</div> : error ? <p className="inline-message inline-message--error" role="alert">{error}</p> : summary && <div className="metrics-grid">
        <article className="metric-card"><span>Fleet vehicles</span><CarFront /><strong>{summary.vehicles}</strong><small>{summary.available} available now</small></article>
        <article className="metric-card"><span>Active reservations</span><TicketCheck /><strong>{summary.reservations}</strong><small>Confirmed bookings</small></article>
        <article className="metric-card"><span>Completed sales</span><Activity /><strong>{summary.sales}</strong><small>Recorded in ledger</small></article>
        <article className="metric-card"><span>Sales revenue · KES</span><CircleDollarSign /><strong>{formatKES(Number(summary.salesRevenue))}</strong><small>Before taxes and fees</small></article>
      </div>}
    </section>
  );
}