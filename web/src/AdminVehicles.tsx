import { useEffect, useState } from 'react';
import { Archive, Check, ChevronLeft, ChevronRight, Eye, LoaderCircle, Pencil, Plus, RefreshCw, Search, X } from 'lucide-react';
import type Keycloak from 'keycloak-js';
import { apiBase, formatKES } from './api';

interface VehicleRecord {
  id: string;
  vin: string;
  make: string;
  model: string;
  variant: string;
  year: number;
  type: string;
  salePrice: string | null;
  dailyRate: string | null;
  weeklyRate: string | null;
  monthlyRate: string | null;
  deposit: string | null;
  mileageKm: number | null;
  fuelType: string;
  transmission: string;
  engineCc: number | null;
  seats: number | null;
  color: string;
  locationId: string;
  location: string;
  status: string;
  imageUrl: string | null;
  images: string[];
  videoUrl?: string | null;
  description: string;
  features: string[];
  isFeatured: boolean;
  isPublished: boolean;
}

interface Location { id: string; name: string; county: string }

interface VehicleDraft {
  vin: string;
  make: string;
  model: string;
  variant: string;
  year: string;
  type: string;
  salePrice: string;
  dailyRate: string;
  weeklyRate: string;
  monthlyRate: string;
  deposit: string;
  mileageKm: string;
  fuelType: string;
  transmission: string;
  engineCc: string;
  seats: string;
  color: string;
  locationId: string;
  status: string;
  description: string;
  imagesText: string;
  videoUrl: string;
  featuresText: string;
  isFeatured: boolean;
  isPublished: boolean;
}

const pageSize = 25;

const emptyDraft: VehicleDraft = {
  vin: '', make: '', model: '', variant: '', year: '', type: 'suv', salePrice: '', dailyRate: '', weeklyRate: '', monthlyRate: '',
  deposit: '', mileageKm: '', fuelType: 'petrol', transmission: 'automatic', engineCc: '', seats: '5', color: '', locationId: '',
  status: 'available', description: '', imagesText: '', videoUrl: '', featuresText: '', isFeatured: false, isPublished: false,
};

const contentRoles = ['SUPER_ADMIN', 'ADMIN', 'CONTENT_MANAGER'];

interface AdminVehiclesProps { auth: Keycloak }

export function AdminVehicles({ auth }: AdminVehiclesProps) {
  const roles = auth.tokenParsed?.realm_access?.roles ?? [];
  const canEdit = roles.some((role) => contentRoles.includes(role) || role === 'admin');
  const [vehicles, setVehicles] = useState<VehicleRecord[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [draft, setDraft] = useState<VehicleDraft | null>(null);
  const [editingId, setEditingId] = useState('');
  const [saving, setSaving] = useState(false);

  async function request(path: string, init: RequestInit = {}): Promise<Response> {
    await auth.updateToken(30);
    return fetch(`${apiBase}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${auth.token ?? ''}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
    });
  }

  async function loadVehicles(): Promise<void> {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({ limit: String(pageSize), offset: String(offset) });
      if (search.trim()) query.set('q', search.trim());
      const response = await request(`/api/v1/admin/vehicles?${query}`);
      const body = await response.json() as { items?: VehicleRecord[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Vehicle inventory could not be loaded.');
      const items = body.items ?? [];
      setVehicles(items);
      setHasMore(items.length === pageSize);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Vehicle inventory could not be loaded.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadVehicles(); }, [offset, search]);

  useEffect(() => {
    let mounted = true;
    void request('/api/v1/admin/locations').then(async (response) => {
      const body = await response.json() as { items?: Location[] };
      if (mounted && response.ok) setLocations(body.items ?? []);
    }).catch(() => undefined);
    return () => { mounted = false; };
  }, []);

  function beginEdit(vehicle: VehicleRecord): void {
    setEditingId(vehicle.id);
    setDraft({
      vin: vehicle.vin, make: vehicle.make, model: vehicle.model, variant: vehicle.variant ?? '', year: String(vehicle.year), type: vehicle.type,
      salePrice: vehicle.salePrice ?? '', dailyRate: vehicle.dailyRate ?? '', weeklyRate: vehicle.weeklyRate ?? '', monthlyRate: vehicle.monthlyRate ?? '',
      deposit: vehicle.deposit ?? '', mileageKm: vehicle.mileageKm === null ? '' : String(vehicle.mileageKm), fuelType: vehicle.fuelType,
      transmission: vehicle.transmission, engineCc: vehicle.engineCc === null ? '' : String(vehicle.engineCc), seats: vehicle.seats === null ? '' : String(vehicle.seats),
      color: vehicle.color, locationId: vehicle.locationId, status: vehicle.status, description: vehicle.description,
      imagesText: vehicle.images.join('\n'), videoUrl: vehicle.videoUrl ?? '', featuresText: vehicle.features.join(', '),
      isFeatured: vehicle.isFeatured, isPublished: vehicle.isPublished,
    });
  }

  function closeForm(): void {
    setDraft(null);
    setEditingId('');
  }

  async function saveVehicle(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!draft) return;
    setSaving(true);
    setError('');
    setNotice('');
    const numeric = (value: string): number | null => value.trim() === '' ? null : Number(value);
    const body = {
      vin: draft.vin, make: draft.make, model: draft.model, variant: draft.variant, year: Number(draft.year), type: draft.type,
      salePrice: numeric(draft.salePrice), dailyRate: numeric(draft.dailyRate), weeklyRate: numeric(draft.weeklyRate), monthlyRate: numeric(draft.monthlyRate),
      deposit: numeric(draft.deposit), mileageKm: numeric(draft.mileageKm), fuelType: draft.fuelType, transmission: draft.transmission,
      engineCc: numeric(draft.engineCc), seats: numeric(draft.seats), color: draft.color, locationId: draft.locationId, status: draft.status,
      description: draft.description, images: draft.imagesText.split('\n').map((item) => item.trim()).filter(Boolean), videoUrl: draft.videoUrl,
      features: draft.featuresText.split(',').map((item) => item.trim()).filter(Boolean), isFeatured: draft.isFeatured, isPublished: draft.isPublished,
    };
    try {
      const response = await request(editingId ? `/api/v1/admin/vehicles/${editingId}` : '/api/v1/admin/vehicles', {
        method: editingId ? 'PUT' : 'POST', body: JSON.stringify(body),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Vehicle could not be saved.');
      closeForm();
      setNotice(editingId ? 'Vehicle updated.' : 'Vehicle created.');
      await loadVehicles();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Vehicle could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  async function togglePublish(vehicle: VehicleRecord): Promise<void> {
    setError('');
    try {
      const response = await request(`/api/v1/admin/vehicles/${vehicle.id}/publish`, {
        method: 'PATCH', body: JSON.stringify({ isPublished: !vehicle.isPublished }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Publish state could not be updated.');
      await loadVehicles();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Publish state could not be updated.');
    }
  }

  async function archive(vehicle: VehicleRecord): Promise<void> {
    if (!window.confirm(`Archive ${vehicle.year} ${vehicle.make} ${vehicle.model}?`)) return;
    setError('');
    try {
      const response = await request(`/api/v1/admin/vehicles/${vehicle.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Vehicle could not be archived.');
      await loadVehicles();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Vehicle could not be archived.');
    }
  }

  function change<K extends keyof VehicleDraft>(key: K, value: VehicleDraft[K]): void {
    setDraft((current) => current ? { ...current, [key]: value } : current);
  }

  return (
    <section className="admin-vehicles">
      <header className="admin-vehicles__header">
        <div><span className="section-kicker">CATALOG MANAGEMENT · KES</span><h2>Vehicles</h2><p>{vehicles.length} shown · {canEdit ? 'Catalog editor' : 'Read-only access'}</p></div>
        {canEdit && <button className="button button--primary" onClick={() => { setEditingId(''); setDraft({ ...emptyDraft }); }}><Plus size={16} /> Add vehicle</button>}
      </header>

      <label className="admin-search"><Search size={17} /><input value={search} onChange={(event) => { setOffset(0); setSearch(event.target.value); }} placeholder="Search make, model or VIN" /></label>
      {error && <p className="inline-message inline-message--error" role="alert">{error}</p>}
      {notice && <p className="inline-message" role="status">{notice}</p>}

      <div className="admin-table-wrap">
        <table className="admin-vehicle-table">
          <thead><tr><th>Vehicle</th><th>Asking · KES</th><th>Hire · KES/day</th><th>Location</th><th>State</th><th>Publishing</th><th>Actions</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={7} className="admin-table-empty"><LoaderCircle className="spin" size={18} /> Loading inventory</td></tr> : vehicles.length === 0 ? <tr><td colSpan={7} className="admin-table-empty">No vehicles found.</td></tr> : vehicles.map((vehicle) => <tr key={vehicle.id}>
              <td><strong>{vehicle.year} {vehicle.make} {vehicle.model}</strong><small>{vehicle.vin}</small></td>
              <td>{vehicle.salePrice ? formatKES(Number(vehicle.salePrice)) : '—'}</td>
              <td>{vehicle.dailyRate ? formatKES(Number(vehicle.dailyRate)) : '—'}</td>
              <td>{vehicle.location || 'Not set'}</td>
              <td><span className={`admin-state admin-state--${vehicle.status}`}>{vehicle.status}</span></td>
              <td>{vehicle.isPublished ? 'Published' : 'Draft'}{vehicle.isFeatured ? ' · Featured' : ''}</td>
              <td><div className="admin-row-actions">
                {canEdit && <><button className="icon-button" title="Edit vehicle" aria-label={`Edit ${vehicle.make} ${vehicle.model}`} onClick={() => beginEdit(vehicle)}><Pencil size={15} /></button><button className="icon-button" title={vehicle.isPublished ? 'Unpublish' : 'Publish'} aria-label={vehicle.isPublished ? 'Unpublish vehicle' : 'Publish vehicle'} onClick={() => void togglePublish(vehicle)}>{vehicle.isPublished ? <Eye size={15} /> : <Check size={15} />}</button><button className="icon-button" title="Archive vehicle" aria-label={`Archive ${vehicle.make} ${vehicle.model}`} onClick={() => void archive(vehicle)}><Archive size={15} /></button></>}
              </div></td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <div className="admin-pagination"><button className="icon-button" aria-label="Previous page" disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - pageSize))}><ChevronLeft size={17} /></button><span>{offset + 1}–{offset + vehicles.length}</span><button className="icon-button" aria-label="Next page" disabled={!hasMore || loading} onClick={() => setOffset(offset + pageSize)}><ChevronRight size={17} /></button><button className="icon-button" aria-label="Refresh inventory" onClick={() => void loadVehicles()}><RefreshCw size={15} /></button></div>

      {draft && <div className="admin-form-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeForm(); }}>
        <form className="admin-vehicle-form" onSubmit={(event) => void saveVehicle(event)} aria-label={editingId ? 'Edit vehicle' : 'Create vehicle'}>
          <header className="admin-vehicle-form__header"><div><span className="section-kicker">VEHICLE CMS</span><h3>{editingId ? 'Edit listing' : 'New listing'}</h3></div><button type="button" className="icon-button" aria-label="Close vehicle form" onClick={closeForm}><X size={17} /></button></header>
          {draft.make && draft.model && <div className="admin-listing-preview">
            <span className="section-kicker">LISTING PREVIEW</span>
            {draft.imagesText.split('\n').map((url) => url.trim()).find((url) => url.startsWith('https://')) && <img src={draft.imagesText.split('\n').map((url) => url.trim()).find((url) => url.startsWith('https://'))} alt="Vehicle listing preview" />}
            <div><strong>{draft.year || 'Year'} {draft.make} {draft.model} {draft.variant}</strong><span>{draft.salePrice ? formatKES(Number(draft.salePrice)) : 'Hire only'} · {locations.find((location) => location.id === draft.locationId)?.name ?? 'Location not set'}</span></div>
          </div>}
          <div className="admin-form-grid">
            <label>VIN<input required maxLength={17} value={draft.vin} onChange={(event) => change('vin', event.target.value.toUpperCase())} /></label>
            <label>Make<input required maxLength={60} value={draft.make} onChange={(event) => change('make', event.target.value)} /></label>
            <label>Model<input required maxLength={80} value={draft.model} onChange={(event) => change('model', event.target.value)} /></label>
            <label>Variant<input maxLength={100} value={draft.variant} onChange={(event) => change('variant', event.target.value)} /></label>
            <label>Year<input required type="number" min="1886" max="2100" value={draft.year} onChange={(event) => change('year', event.target.value)} /></label>
            <label>Body type<select value={draft.type} onChange={(event) => change('type', event.target.value)}>{['sedan', 'suv', 'truck', 'coupe', 'van', 'other'].map((type) => <option key={type}>{type}</option>)}</select></label>
            <label>Sale price · KES<input type="number" min="1" step="1" value={draft.salePrice} onChange={(event) => change('salePrice', event.target.value)} /></label>
            <label>Daily hire · KES<input type="number" min="1" step="1" value={draft.dailyRate} onChange={(event) => change('dailyRate', event.target.value)} /></label>
            <label>Weekly hire · KES<input type="number" min="1" step="1" value={draft.weeklyRate} onChange={(event) => change('weeklyRate', event.target.value)} /></label>
            <label>Monthly hire · KES<input type="number" min="1" step="1" value={draft.monthlyRate} onChange={(event) => change('monthlyRate', event.target.value)} /></label>
            <label>Hire deposit · KES<input type="number" min="1" step="1" value={draft.deposit} onChange={(event) => change('deposit', event.target.value)} /></label>
            <label>Mileage · km<input type="number" min="0" value={draft.mileageKm} onChange={(event) => change('mileageKm', event.target.value)} /></label>
            <label>Fuel<select value={draft.fuelType} onChange={(event) => change('fuelType', event.target.value)}>{['petrol', 'diesel', 'hybrid', 'electric', 'unknown'].map((fuel) => <option key={fuel}>{fuel}</option>)}</select></label>
            <label>Transmission<select value={draft.transmission} onChange={(event) => change('transmission', event.target.value)}>{['automatic', 'manual', 'unknown'].map((transmission) => <option key={transmission}>{transmission}</option>)}</select></label>
            <label>Engine · cc<input type="number" min="0" value={draft.engineCc} onChange={(event) => change('engineCc', event.target.value)} /></label>
            <label>Seats<input type="number" min="1" max="80" value={draft.seats} onChange={(event) => change('seats', event.target.value)} /></label>
            <label>Color<input maxLength={40} value={draft.color} onChange={(event) => change('color', event.target.value)} /></label>
            <label>Location<select value={draft.locationId} onChange={(event) => change('locationId', event.target.value)}><option value="">Select location</option>{locations.map((location) => <option value={location.id} key={location.id}>{location.name} · {location.county}</option>)}</select></label>
            <label>Status<select value={draft.status} onChange={(event) => change('status', event.target.value)}>{['available', 'reserved', 'sold', 'maintenance'].map((state) => <option key={state}>{state}</option>)}</select></label>
            <label className="admin-form-wide">Exterior image URLs · one per line<textarea rows={3} value={draft.imagesText} onChange={(event) => change('imagesText', event.target.value)} /></label>
            <label className="admin-form-wide">Walkaround video URL<input type="url" value={draft.videoUrl} onChange={(event) => change('videoUrl', event.target.value)} placeholder="https://…" /></label>
            <label className="admin-form-wide">Features · comma separated<input value={draft.featuresText} onChange={(event) => change('featuresText', event.target.value)} /></label>
            <label className="admin-form-wide">Description<textarea rows={4} maxLength={10000} value={draft.description} onChange={(event) => change('description', event.target.value)} /></label>
          </div>
          <div className="admin-form-toggles"><label><input type="checkbox" checked={draft.isFeatured} onChange={(event) => change('isFeatured', event.target.checked)} /> Featured</label><label><input type="checkbox" checked={draft.isPublished} onChange={(event) => change('isPublished', event.target.checked)} /> Published</label></div>
          {error && <p className="inline-message inline-message--error" role="alert">{error}</p>}
          <footer className="admin-vehicle-form__footer"><button type="button" className="button button--outline" onClick={closeForm}>Cancel</button><button className="button button--primary" disabled={saving}>{saving ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />} {editingId ? 'Save changes' : 'Create listing'}</button></footer>
        </form>
      </div>}
    </section>
  );
}