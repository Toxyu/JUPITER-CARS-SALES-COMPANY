export type Purpose = 'sale' | 'rental';

export interface Vehicle {
  id: string;
  vin: string;
  make: string;
  model: string;
  year: number;
  type: string;
  salePrice: string | null;
  dailyRate: string | null;
  status: string;
  imageUrl: string | null;
  images?: string[];
  videoUrl?: string | null;
  description: string;
  mileageKm?: number | null;
  fuelType?: string;
  transmission?: string;
  engineCc?: number | null;
  seats?: number | null;
  color?: string;
  location?: string;
  isFeatured?: boolean;
}

export interface VehicleLocation { slug: string; name: string; county: string }
export interface SearchResult { items: Vehicle[]; limit: number; offset: number; hasMore: boolean }

export interface ReservationResult {
  reservationId: string;
  totalAmount: string;
  currency: string;
  status: string;
}

export const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
export const demoMode = import.meta.env.VITE_DEMO_MODE === 'true';
const kesFormatter = new Intl.NumberFormat('en-KE', { maximumFractionDigits: 0 });

export function formatKES(amount: number): string {
  return `KSh ${kesFormatter.format(amount)}`;
}

const demoVehicles: Vehicle[] = [
  { id: 'demo-toyota-fielder', vin: 'JTDBR32E502123456', make: 'Toyota', model: 'Corolla Fielder Hybrid', year: 2019, type: 'sedan', salePrice: '1850000', dailyRate: '5500', status: 'available', imageUrl: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=1200&q=85', images: ['https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=1200&q=85', 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1200&q=85', 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1200&q=85'], mileageKm: 62000, fuelType: 'hybrid', transmission: 'automatic', engineCc: 1500, seats: 5, color: 'Silver', location: 'Nairobi', isFeatured: true, description: 'Right-hand drive hybrid wagon, economical on Nairobi commutes and ready for a weekend upcountry.' },
  { id: 'demo-toyota-harrier', vin: 'JTEBU3FJ8LK123456', make: 'Toyota', model: 'Harrier Elegance', year: 2020, type: 'suv', salePrice: '3850000', dailyRate: '14000', status: 'available', imageUrl: 'https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?auto=format&fit=crop&w=1200&q=85', images: ['https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?auto=format&fit=crop&w=1200&q=85', 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1200&q=85', 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1200&q=85'], mileageKm: 48000, fuelType: 'petrol', transmission: 'automatic', engineCc: 2000, seats: 5, color: 'Black', location: 'Nairobi', isFeatured: true, description: 'Locally popular luxury SUV import with right-hand drive, elevated ground clearance and a refined cabin.' },
  { id: 'demo-toyota-probox', vin: 'NCP16001234567890', make: 'Toyota', model: 'Probox DX', year: 2018, type: 'van', salePrice: '1120000', dailyRate: '4500', status: 'available', imageUrl: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=1200&q=85', images: ['https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=1200&q=85', 'https://images.unsplash.com/photo-1551830820-330a71b99659?auto=format&fit=crop&w=1200&q=85', 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1200&q=85'], mileageKm: 78000, fuelType: 'petrol', transmission: 'automatic', engineCc: 1500, seats: 5, color: 'White', location: 'Mombasa', description: 'Practical right-hand drive workhorse with a spacious load area and accessible running costs.' },
  { id: 'demo-subaru-forester', vin: 'JF2SJABC5KH123456', make: 'Subaru', model: 'Forester X-Break', year: 2019, type: 'suv', salePrice: '2750000', dailyRate: '10500', status: 'available', imageUrl: 'https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?auto=format&fit=crop&w=1200&q=85', images: ['https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?auto=format&fit=crop&w=1200&q=85', 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1200&q=85', 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=1200&q=85'], mileageKm: 54000, fuelType: 'petrol', transmission: 'automatic', engineCc: 2000, seats: 5, color: 'Blue', location: 'Nakuru', description: 'All-wheel-drive family SUV, right-hand drive, suited to mixed city and rural roads.' },
  { id: 'demo-nissan-xtrail', vin: 'NT32ABC1234567890', make: 'Nissan', model: 'X-Trail 20X', year: 2019, type: 'suv', salePrice: '2450000', dailyRate: '9000', status: 'available', imageUrl: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=1200&q=85', images: ['https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=1200&q=85', 'https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?auto=format&fit=crop&w=1200&q=85', 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1200&q=85'], mileageKm: 69000, fuelType: 'petrol', transmission: 'automatic', engineCc: 2000, seats: 7, color: 'Grey', location: 'Kisumu', description: 'Versatile seven-seat crossover with generous luggage space for family trips.' },
];

const demoLocations: VehicleLocation[] = [
  { slug: 'nairobi', name: 'Nairobi', county: 'Nairobi' }, { slug: 'mombasa', name: 'Mombasa', county: 'Mombasa' },
  { slug: 'kisumu', name: 'Kisumu', county: 'Kisumu' }, { slug: 'nakuru', name: 'Nakuru', county: 'Nakuru' },
  { slug: 'nyeri', name: 'Nyeri', county: 'Nyeri' }, { slug: 'thika', name: 'Thika', county: 'Kiambu' },
  { slug: 'eldoret', name: 'Eldoret', county: 'Uasin Gishu' },
];

export async function fetchLocations(signal?: AbortSignal): Promise<VehicleLocation[]> {
  if (demoMode) return demoLocations;
  const response = await fetch(`${apiBase}/api/v1/locations`, { signal });
  if (!response.ok) throw new Error('Locations could not be loaded.');
  const body = await response.json() as { items: VehicleLocation[] };
  return body.items;
}

export async function searchVehicles(params: URLSearchParams, signal?: AbortSignal): Promise<SearchResult> {
  const limit = Number(params.get('limit') ?? 24);
  const offset = Number(params.get('offset') ?? 0);
  if (demoMode) {
    if (signal?.aborted) throw new DOMException('Request aborted', 'AbortError');
    const query = (params.get('q') ?? '').trim().toLowerCase();
    const type = params.get('type') ?? '';
    const purpose = params.get('purpose') ?? 'sale';
    const minPrice = Number(params.get('minPrice') ?? 0);
    const maxPrice = Number(params.get('maxPrice') ?? Number.POSITIVE_INFINITY);
    const minYear = Number(params.get('yearFrom') ?? 0);
    const maxYear = Number(params.get('yearTo') ?? Number.POSITIVE_INFINITY);
    const fuel = params.get('fuel') ?? '';
    const transmission = params.get('transmission') ?? '';
    const minMileage = Number(params.get('mileageFrom') ?? 0);
    const maxMileage = Number(params.get('mileageTo') ?? Number.POSITIVE_INFINITY);
    const location = params.get('location') ?? '';
    const minSeats = Number(params.get('seats') ?? 0);
    const minEngine = Number(params.get('engineFrom') ?? 0);
    const maxEngine = Number(params.get('engineTo') ?? Number.POSITIVE_INFINITY);
    const sort = params.get('sort') ?? 'featured';
    const filtered = demoVehicles.filter((vehicle) => {
      const haystack = `${vehicle.make} ${vehicle.model} ${vehicle.vin}`.toLowerCase();
      const price = Number(purpose === 'rental' ? vehicle.dailyRate : vehicle.salePrice);
      return haystack.includes(query) && (!type || vehicle.type === type) && price >= minPrice && price <= maxPrice && vehicle.year >= minYear && vehicle.year <= maxYear && (!fuel || vehicle.fuelType === fuel) && (!transmission || vehicle.transmission === transmission) && Number(vehicle.mileageKm ?? 0) >= minMileage && Number(vehicle.mileageKm ?? 0) <= maxMileage && (!location || vehicle.location?.toLowerCase() === location) && Number(vehicle.seats ?? 0) >= minSeats && Number(vehicle.engineCc ?? 0) >= minEngine && Number(vehicle.engineCc ?? 0) <= maxEngine;
    });
    const price = (vehicle: Vehicle) => Number(purpose === 'rental' ? vehicle.dailyRate : vehicle.salePrice);
    if (sort === 'price_low') filtered.sort((left, right) => price(left) - price(right));
    if (sort === 'price_high') filtered.sort((left, right) => price(right) - price(left));
    if (sort === 'year_new') filtered.sort((left, right) => right.year - left.year);
    if (sort === 'mileage_low') filtered.sort((left, right) => Number(left.mileageKm) - Number(right.mileageKm));
    if (sort === 'newest') filtered.reverse();
    return { items: filtered.slice(offset, offset + limit), offset, limit, hasMore: offset + limit < filtered.length };
  }
  const response = await fetch(`${apiBase}/api/v1/vehicles/search?${params.toString()}`, { signal });
  if (!response.ok) throw new Error('Inventory could not be loaded. Please retry.');
  const body = await response.json() as SearchResult;
  return body;
}

export async function checkAvailability(vehicleId: string, startDate: string, endDate: string, signal: AbortSignal): Promise<boolean> {
  if (demoMode) throw new Error('Live availability requires the reservation service.');
  const params = new URLSearchParams({ vehicleId, startDate, endDate });
  const response = await fetch(`${apiBase}/api/v1/rentals/availability?${params.toString()}`, { signal });
  if (!response.ok) throw new Error('Availability could not be checked.');
  const body = await response.json() as { available: boolean };
  return body.available;
}