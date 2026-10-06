import { useEffect, useState } from 'react';
import { ArrowDown, ArrowRight, CarFront, Check, ChevronDown, CircleUserRound, Menu, Search, SlidersHorizontal, X } from 'lucide-react';
import type { Purpose, Vehicle } from './api';
import { searchVehicles } from './api';
import { AdminDashboard } from './AdminDashboard';
import { Checkout } from './Checkout';
import { keycloak, authInitialization } from './auth';
import { RentalBooking } from './RentalBooking';
import { VehicleCard } from './VehicleCard';

type View = 'inventory' | 'admin';

const vehicleTypes = ['All vehicles', 'sedan', 'suv', 'truck', 'coupe', 'van', 'other'];

export default function App() {
  const [purpose, setPurpose] = useState<Purpose>('sale');
  const [vehicleType, setVehicleType] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [search, setSearch] = useState('');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selected, setSelected] = useState<Vehicle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<View>('inventory');
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const isAdmin = Boolean(keycloak.tokenParsed?.realm_access?.roles?.includes('admin'));

  useEffect(() => {
    let mounted = true;
    void authInitialization.then(() => {
      if (mounted) setAuthReady(true);
    }).catch(() => {
      if (mounted) {
        setAuthReady(true);
        setAuthError(true);
      }
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (view !== 'inventory') return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ purpose });
      if (search.trim()) params.set('q', search.trim());
      if (vehicleType) params.set('type', vehicleType);
      if (minPrice) params.set('minPrice', minPrice);
      if (maxPrice) params.set('maxPrice', maxPrice);
      setLoading(true);
      setError('');
      void searchVehicles(params, controller.signal).then((items) => {
        setVehicles(items);
        if (selected && !items.some((vehicle) => vehicle.id === selected.id)) setSelected(null);
      }).catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setError(reason instanceof Error ? reason.message : 'Inventory could not be loaded.');
      }).finally(() => setLoading(false));
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [purpose, vehicleType, minPrice, maxPrice, search, view]);

  function signIn(): void {
    void keycloak.login({ redirectUri: window.location.href });
  }

  function signOut(): void {
    void keycloak.logout({ redirectUri: window.location.origin });
  }

  function selectPurpose(nextPurpose: Purpose): void {
    setPurpose(nextPurpose);
    setSelected(null);
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="#top" onClick={() => setView('inventory')} aria-label="Jupiter Cars home">
          <span className="brand__mark"><CarFront size={21} strokeWidth={2.2} /></span>
          <span className="brand__name">JUPITER<span>CARS</span></span>
        </a>
        <nav className="main-nav" aria-label="Main navigation">
          <button className={view === 'inventory' ? 'nav-link nav-link--active' : 'nav-link'} onClick={() => setView('inventory')}>Inventory</button>
          {isAdmin && <button className={view === 'admin' ? 'nav-link nav-link--active' : 'nav-link'} onClick={() => setView('admin')}>Operations</button>}
        </nav>
        <div className="header-actions">
          {authReady && (keycloak.authenticated ? <button className="button button--quiet" onClick={signOut}><CircleUserRound size={17} /><span>Sign out</span></button> : <button className="button button--outline" onClick={signIn}><CircleUserRound size={17} /><span>Sign in</span></button>)}
          <button className="mobile-menu" aria-label="Open navigation" onClick={() => setView('inventory')}><Menu /></button>
        </div>
      </header>

      {view === 'admin' && isAdmin ? <main className="page-content"><AdminDashboard auth={keycloak} /></main> : <>
        <main id="top">
          <section className="hero">
            <div className="hero__copy">
              <span className="section-kicker"><span className="kicker-line" /> YOUR NEXT CHAPTER STARTS HERE</span>
              <h1>Find the car<br />that <em>moves</em> you.</h1>
              <p>Thoughtful picks, straightforward pricing, and a better way to get behind the wheel.</p>
              <button className="hero__link" onClick={() => document.getElementById('inventory')?.scrollIntoView({ behavior: 'smooth' })}>Explore the collection <ArrowDown size={16} /></button>
              <div className="hero__stats"><div><strong>04</strong><span>handpicked vehicles</span></div><span className="hero__stat-rule" /><div><strong>01</strong><span>easy place to start</span></div></div>
            </div>
            <div className="hero__image-wrap">
              <img src="https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1800&q=90" alt="Dark sports coupe on a mountain road" />
              <div className="hero__image-label"><span>THE JUPITER EDIT</span><strong>Good things<br />are in motion.</strong></div>
              <span className="hero__image-index">01 <span>/</span> 04</span>
            </div>
            <span className="hero__side-label">SALES · RENTALS · YOUR CALL</span>
          </section>

          <section className="inventory-section" id="inventory">
            <div className="inventory-heading">
              <div><span className="section-kicker">CURATED FOR THE ROAD AHEAD</span><h2>Find your <em>fit.</em></h2></div>
              <div className="purpose-switch" role="group" aria-label="Browse sales or rentals">
                <button className={purpose === 'sale' ? 'purpose-switch__item is-active' : 'purpose-switch__item'} onClick={() => selectPurpose('sale')}>Buy a car</button>
                <button className={purpose === 'rental' ? 'purpose-switch__item is-active' : 'purpose-switch__item'} onClick={() => selectPurpose('rental')}>Rent a car</button>
                <span className="purpose-switch__indicator" data-purpose={purpose} />
              </div>
            </div>

            <div className="filter-bar">
              <label className="search-field"><Search size={18} /><input aria-label="Search make or model" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search make or model" /></label>
              <div className="filter-select-wrap"><SlidersHorizontal size={16} /><select aria-label="Vehicle type" value={vehicleType} onChange={(event) => setVehicleType(event.target.value)}>{vehicleTypes.map((type) => <option key={type} value={type === 'All vehicles' ? '' : type}>{type === 'All vehicles' ? type : type[0].toUpperCase() + type.slice(1)}</option>)}</select><ChevronDown size={15} /></div>
              <button className={`filter-toggle${filterOpen ? ' filter-toggle--active' : ''}`} onClick={() => setFilterOpen((open) => !open)}><SlidersHorizontal size={16} /><span>Price range</span></button>
              <span className="result-count">{loading ? 'Loading…' : `${vehicles.length} vehicles`}</span>
            </div>
            {filterOpen && <div className="price-filter"><span>Price per {purpose === 'rental' ? 'day' : 'vehicle'}</span><label><span>Min</span><input inputMode="decimal" type="number" min="0" value={minPrice} onChange={(event) => setMinPrice(event.target.value)} placeholder="$0" /></label><span className="price-filter__dash">to</span><label><span>Max</span><input inputMode="decimal" type="number" min="0" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} placeholder="No max" /></label><button className="clear-filter" onClick={() => { setMinPrice(''); setMaxPrice(''); }}>Clear</button></div>}

            {error && <div className="state-message state-message--error" role="alert">{error}</div>}
            <div className="vehicle-grid">
              {loading && vehicles.length === 0 && <div className="loading-state"><span className="loader-dot" /> Loading the collection</div>}
              {!loading && !error && vehicles.length === 0 && <div className="state-message">No vehicles match those filters. Try widening your search.</div>}
              {vehicles.map((vehicle, index) => <div className="vehicle-grid__item" style={{ animationDelay: `${index * 70}ms` }} key={vehicle.id}><VehicleCard vehicle={vehicle} purpose={purpose} selected={selected?.id === vehicle.id} onSelect={setSelected} /></div>)}
            </div>

            {selected && <div className="vehicle-action" id="vehicle-action">
              <div className="vehicle-action__intro"><button className="icon-button" aria-label="Close vehicle details" onClick={() => setSelected(null)}><X size={18} /></button><span className="section-kicker">A CLOSER LOOK</span><h3>{selected.make} <em>{selected.model}</em></h3><p>{selected.description}</p></div>
              {purpose === 'rental' ? <RentalBooking vehicle={selected} auth={keycloak} onLogin={signIn} /> : <Checkout vehicle={selected} auth={keycloak} onLogin={signIn} />}
            </div>}
          </section>
        </main>
        <footer className="site-footer"><a className="brand brand--footer" href="#top"><span className="brand__mark"><CarFront size={19} /></span><span className="brand__name">JUPITER<span>CARS</span></span></a><span>Made for wherever you're headed.</span><button onClick={() => document.getElementById('top')?.scrollIntoView({ behavior: 'smooth' })}>Back to top <ArrowRight size={14} /></button></footer>
      </>}
      {authError && <div className="auth-notice" role="status"><span><Check size={14} /> You can browse without an account.</span><button aria-label="Dismiss" onClick={() => setAuthError(false)}><X size={14} /></button></div>}
    </div>
  );
}