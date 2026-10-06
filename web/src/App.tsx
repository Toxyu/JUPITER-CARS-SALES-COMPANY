import { useEffect, useState } from 'react';
import { ArrowDown, ArrowRight, CarFront, Check, ChevronDown, CircleUserRound, Menu, Search, SlidersHorizontal, X } from 'lucide-react';
import type { Purpose, Vehicle, VehicleLocation } from './api';
import { demoMode, fetchLocations, searchVehicles } from './api';
import { AdminDashboard } from './AdminDashboard';
import { Checkout } from './Checkout';
import { CIFDrawer } from './CIFDrawer';
import { keycloak, authInitialization } from './auth';
import { RentalBooking } from './RentalBooking';
import { VehicleCard } from './VehicleCard';

type View = 'inventory' | 'admin';

const vehicleTypes = ['All cars', 'sedan', 'suv', 'truck', 'coupe', 'van', 'other'];
const pageSize = 24;

export default function App() {
  const [purpose, setPurpose] = useState<Purpose>('sale');
  const [vehicleType, setVehicleType] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [yearFrom, setYearFrom] = useState('');
  const [yearTo, setYearTo] = useState('');
  const [fuel, setFuel] = useState('');
  const [transmission, setTransmission] = useState('');
  const [mileageTo, setMileageTo] = useState('');
  const [location, setLocation] = useState('');
  const [seats, setSeats] = useState('');
  const [engineFrom, setEngineFrom] = useState('');
  const [sort, setSort] = useState('featured');
  const [locations, setLocations] = useState<VehicleLocation[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState('');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selected, setSelected] = useState<Vehicle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<View>('inventory');
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const staffRoles = keycloak.tokenParsed?.realm_access?.roles ?? [];
  const isAdmin = !demoMode && staffRoles.some((role) => ['SUPER_ADMIN', 'ADMIN', 'CONTENT_MANAGER', 'SALES_MANAGER', 'RENTAL_MANAGER', 'SUPPORT', 'admin'].includes(role));

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
    const controller = new AbortController();
    void fetchLocations(controller.signal).then(setLocations).catch(() => undefined);
    return () => controller.abort();
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
      if (yearFrom) params.set('yearFrom', yearFrom);
      if (yearTo) params.set('yearTo', yearTo);
      if (fuel) params.set('fuel', fuel);
      if (transmission) params.set('transmission', transmission);
      if (mileageTo) params.set('mileageTo', mileageTo);
      if (location) params.set('location', location);
      if (seats) params.set('seats', seats);
      if (engineFrom) params.set('engineFrom', engineFrom);
      params.set('sort', sort);
      params.set('limit', String(pageSize));
      params.set('offset', String(offset));
      setLoading(true);
      setError('');
      void searchVehicles(params, controller.signal).then((result) => {
        setVehicles((current) => offset === 0 ? result.items : [...current, ...result.items]);
        setHasMore(result.hasMore);
        if (selected && !result.items.some((vehicle) => vehicle.id === selected.id) && offset === 0) setSelected(null);
      }).catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setError(reason instanceof Error ? reason.message : 'Inventory could not be loaded.');
      }).finally(() => setLoading(false));
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [purpose, vehicleType, minPrice, maxPrice, yearFrom, yearTo, fuel, transmission, mileageTo, location, seats, engineFrom, sort, offset, search, view]);

  function signIn(): void {
    void keycloak.login({ redirectUri: window.location.href });
  }

  function signOut(): void {
    void keycloak.logout({ redirectUri: window.location.origin });
  }

  function selectPurpose(nextPurpose: Purpose): void {
    setPurpose(nextPurpose);
    setSelected(null);
    setOffset(0);
  }

  function clearFilters(): void {
    setVehicleType(''); setMinPrice(''); setMaxPrice(''); setYearFrom(''); setYearTo(''); setFuel('');
    setTransmission(''); setMileageTo(''); setLocation(''); setSeats(''); setEngineFrom(''); setOffset(0);
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
          <CIFDrawer vehicles={vehicles} selectedVehicle={selected} />
          {demoMode ? <span className="preview-badge">SHOWROOM PREVIEW</span> : authReady && (keycloak.authenticated ? <button className="button button--quiet" onClick={signOut}><CircleUserRound size={17} /><span>Sign out</span></button> : <button className="button button--outline" onClick={signIn}><CircleUserRound size={17} /><span>Sign in</span></button>)}
          <button className="mobile-menu" aria-label="Open navigation" onClick={() => setView('inventory')}><Menu /></button>
        </div>
      </header>
      {demoMode && <aside className="preview-banner" role="status">Sample inventory preview. Sign-in, live availability, reservations, and purchases are disabled until backend services are connected.</aside>}

      {view === 'admin' && isAdmin ? <main className="page-content"><AdminDashboard auth={keycloak} /></main> : <>
        <main id="top">
          <section className="hero">
            <div className="hero__copy">
              <span className="section-kicker"><span className="kicker-line" /> NAIROBI, KENYA · PRICES IN KES</span>
              <h1>Built for the<br /><em>Kenyan</em> road.</h1>
              <p>Right-hand-drive favourites, transparent KSh pricing, and cars ready for city streets or the road upcountry.</p>
              <button className="hero__link" onClick={() => document.getElementById('inventory')?.scrollIntoView({ behavior: 'smooth' })}>Explore the collection <ArrowDown size={16} /></button>
              <div className="hero__stats"><div><strong>05</strong><span>Kenya-ready listings</span></div><span className="hero__stat-rule" /><div><strong>KES</strong><span>local market pricing</span></div></div>
            </div>
            <div className="hero__image-wrap">
              <img src="https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1800&q=90" alt="Dark sports coupe on a mountain road" />
              <div className="hero__image-label"><span>THE JUPITER EDIT</span><strong>Good things<br />are in motion.</strong></div>
              <span className="hero__image-index">KE <span>/</span> 01</span>
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
              <label className="search-field"><Search size={18} /><input aria-label="Search make, model, or VIN" value={search} onChange={(event) => { setOffset(0); setSearch(event.target.value); }} placeholder="Search make, model, or VIN" /></label>
              <div className="filter-select-wrap"><SlidersHorizontal size={16} /><select aria-label="Vehicle type" value={vehicleType} onChange={(event) => { setOffset(0); setVehicleType(event.target.value); }}>{vehicleTypes.map((type) => <option key={type} value={type === 'All cars' ? '' : type}>{type === 'All cars' ? type : type[0].toUpperCase() + type.slice(1)}</option>)}</select><ChevronDown size={15} /></div>
              <div className="filter-select-wrap"><select aria-label="Sort vehicles" value={sort} onChange={(event) => { setOffset(0); setSort(event.target.value); }}><option value="featured">Featured</option><option value="newest">Newest</option><option value="price_low">Price: low to high</option><option value="price_high">Price: high to low</option><option value="year_new">Year: newest</option><option value="mileage_low">Mileage: lowest</option></select><ChevronDown size={15} /></div>
              <button className={`filter-toggle${filterOpen ? ' filter-toggle--active' : ''}`} onClick={() => setFilterOpen((open) => !open)}><SlidersHorizontal size={16} /><span>Filters</span></button>
              <span className="result-count">{loading ? 'Loading…' : `${vehicles.length}${hasMore ? '+' : ''} vehicles`}</span>
            </div>
            {filterOpen && <div className="market-filter-panel">
              <div className="market-filter-panel__heading"><span>Refine the search</span><button className="clear-filter" onClick={clearFilters}>Clear all</button></div>
              <div className="market-filter-grid">
                <label>Minimum · KES<input inputMode="numeric" type="number" min="0" value={minPrice} onChange={(event) => { setOffset(0); setMinPrice(event.target.value); }} placeholder="0" /></label>
                <label>Maximum · KES<input inputMode="numeric" type="number" min="0" value={maxPrice} onChange={(event) => { setOffset(0); setMaxPrice(event.target.value); }} placeholder="No limit" /></label>
                <label>Year from<input type="number" min="1886" max="2100" value={yearFrom} onChange={(event) => { setOffset(0); setYearFrom(event.target.value); }} placeholder="Any" /></label>
                <label>Year to<input type="number" min="1886" max="2100" value={yearTo} onChange={(event) => { setOffset(0); setYearTo(event.target.value); }} placeholder="Any" /></label>
                <label>Fuel<select value={fuel} onChange={(event) => { setOffset(0); setFuel(event.target.value); }}><option value="">Any fuel</option>{['petrol', 'diesel', 'hybrid', 'electric'].map((item) => <option key={item}>{item}</option>)}</select></label>
                <label>Transmission<select value={transmission} onChange={(event) => { setOffset(0); setTransmission(event.target.value); }}><option value="">Any transmission</option><option value="automatic">Automatic</option><option value="manual">Manual</option></select></label>
                <label>Location<select value={location} onChange={(event) => { setOffset(0); setLocation(event.target.value); }}><option value="">All locations</option>{locations.map((item) => <option value={item.slug} key={item.slug}>{item.name} · {item.county}</option>)}</select></label>
                <label>Minimum seats<input type="number" min="1" max="80" value={seats} onChange={(event) => { setOffset(0); setSeats(event.target.value); }} placeholder="Any" /></label>
                <label>Maximum mileage · km<input type="number" min="0" value={mileageTo} onChange={(event) => { setOffset(0); setMileageTo(event.target.value); }} placeholder="Any" /></label>
                <label>Engine from · cc<input type="number" min="0" value={engineFrom} onChange={(event) => { setOffset(0); setEngineFrom(event.target.value); }} placeholder="Any" /></label>
              </div>
            </div>}

            {error && <div className="state-message state-message--error" role="alert">{error}</div>}
            <div className="vehicle-grid">
              {loading && vehicles.length === 0 && <div className="loading-state"><span className="loader-dot" /> Loading the collection</div>}
              {!loading && !error && vehicles.length === 0 && <div className="state-message">No vehicles match those filters. Try widening your search.</div>}
              {vehicles.map((vehicle, index) => <div className="vehicle-grid__item" style={{ animationDelay: `${index * 70}ms` }} key={vehicle.id}><VehicleCard vehicle={vehicle} purpose={purpose} selected={selected?.id === vehicle.id} onSelect={setSelected} /></div>)}
            </div>
            {hasMore && <div className="load-more-row"><button className="button button--outline" disabled={loading} onClick={() => setOffset((current) => current + pageSize)}>{loading ? 'Loading…' : 'Load more vehicles'}</button></div>}

            {selected && <div className="vehicle-action" id="vehicle-action">
              <div className="vehicle-action__intro"><button className="icon-button" aria-label="Close vehicle details" onClick={() => setSelected(null)}><X size={18} /></button><span className="section-kicker">A CLOSER LOOK</span><h3>{selected.make} <em>{selected.model}</em></h3><p>{selected.description}</p></div>
              {purpose === 'rental' ? <RentalBooking vehicle={selected} auth={keycloak} onLogin={signIn} /> : <Checkout vehicle={selected} auth={keycloak} onLogin={signIn} />}
            </div>}
          </section>
        </main>
        <footer className="site-footer"><a className="brand brand--footer" href="#top"><span className="brand__mark"><CarFront size={19} /></span><span className="brand__name">JUPITER<span>CARS</span></span></a><span>Kenyan roads. Kenyan shillings.</span><button onClick={() => document.getElementById('top')?.scrollIntoView({ behavior: 'smooth' })}>Back to top <ArrowRight size={14} /></button></footer>
      </>}
      {authError && <div className="auth-notice" role="status"><span><Check size={14} /> You can browse without an account.</span><button aria-label="Dismiss" onClick={() => setAuthError(false)}><X size={14} /></button></div>}
    </div>
  );
}