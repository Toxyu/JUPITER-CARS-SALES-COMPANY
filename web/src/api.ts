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
}

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
  { id: 'demo-toyota-fielder', vin: 'JTDBR32E502123456', make: 'Toyota', model: 'Corolla Fielder Hybrid', year: 2019, type: 'sedan', salePrice: '1850000', dailyRate: '5500', status: 'available', imageUrl: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=1200&q=85', images: ['https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=1200&q=85', 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1200&q=85', 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1200&q=85'], description: 'Right-hand drive hybrid wagon, economical on Nairobi commutes and ready for a weekend upcountry.' },
  { id: 'demo-toyota-harrier', vin: 'JTEBU3FJ8LK123456', make: 'Toyota', model: 'Harrier Elegance', year: 2020, type: 'suv', salePrice: '3850000', dailyRate: '14000', status: 'available', imageUrl: 'https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?auto=format&fit=crop&w=1200&q=85', images: ['https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?auto=format&fit=crop&w=1200&q=85', 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1200&q=85', 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1200&q=85'], description: 'Locally popular luxury SUV import with right-hand drive, elevated ground clearance and a refined cabin.' },
  { id: 'demo-toyota-probox', vin: 'NCP1600123456789', make: 'Toyota', model: 'Probox DX', year: 2018, type: 'van', salePrice: '1120000', dailyRate: '4500', status: 'available', imageUrl: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=1200&q=85', images: ['https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=1200&q=85', 'https://images.unsplash.com/photo-1551830820-330a71b99659?auto=format&fit=crop&w=1200&q=85', 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1200&q=85'], description: 'Practical right-hand drive workhorse with a spacious load area and accessible running costs.' },
  { id: 'demo-subaru-forester', vin: 'JF2SJABC5KH123456', make: 'Subaru', model: 'Forester X-Break', year: 2019, type: 'suv', salePrice: '2750000', dailyRate: '10500', status: 'available', imageUrl: 'https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?auto=format&fit=crop&w=1200&q=85', images: ['https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?auto=format&fit=crop&w=1200&q=85', 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1200&q=85', 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=1200&q=85'], description: 'All-wheel-drive family SUV, right-hand drive, suited to mixed city and rural roads.' },
  { id: 'demo-nissan-xtrail', vin: 'NT32ABC1234567890', make: 'Nissan', model: 'X-Trail 20X', year: 2019, type: 'suv', salePrice: '2450000', dailyRate: '9000', status: 'available', imageUrl: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=1200&q=85', images: ['https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=1200&q=85', 'https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?auto=format&fit=crop&w=1200&q=85', 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1200&q=85'], description: 'Versatile seven-seat crossover with generous luggage space for family trips.' },
];

export async function searchVehicles(params: URLSearchParams, signal?: AbortSignal): Promise<Vehicle[]> {
  if (demoMode) {
    if (signal?.aborted) throw new DOMException('Request aborted', 'AbortError');
    const query = (params.get('q') ?? '').trim().toLowerCase();
    const type = params.get('type') ?? '';
    const purpose = params.get('purpose') ?? 'sale';
    const minPrice = Number(params.get('minPrice') ?? 0);
    const maxPrice = Number(params.get('maxPrice') ?? Number.POSITIVE_INFINITY);
    return demoVehicles.filter((vehicle) => {
      const haystack = `${vehicle.make} ${vehicle.model} ${vehicle.vin}`.toLowerCase();
      const price = Number(purpose === 'rental' ? vehicle.dailyRate : vehicle.salePrice);
      return haystack.includes(query) && (!type || vehicle.type === type) && price >= minPrice && price <= maxPrice;
    });
  }
  const response = await fetch(`${apiBase}/api/v1/vehicles/search?${params.toString()}`, { signal });
  if (!response.ok) throw new Error('Inventory could not be loaded. Please retry.');
  const body = await response.json() as { items: Vehicle[] };
  return body.items;
}

export async function checkAvailability(vehicleId: string, startDate: string, endDate: string, signal: AbortSignal): Promise<boolean> {
  if (demoMode) throw new Error('Live availability requires the reservation service.');
  const params = new URLSearchParams({ vehicleId, startDate, endDate });
  const response = await fetch(`${apiBase}/api/v1/rentals/availability?${params.toString()}`, { signal });
  if (!response.ok) throw new Error('Availability could not be checked.');
  const body = await response.json() as { available: boolean };
  return body.available;
}