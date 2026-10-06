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

const demoVehicles: Vehicle[] = [
  { id: 'demo-honda-accord', vin: '1HGBH41JXMN109186', make: 'Honda', model: 'Accord Touring', year: 2024, type: 'sedan', salePrice: '32900.00', dailyRate: '89.00', status: 'available', imageUrl: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=1200&q=85', description: 'Comfortable long-distance sedan with a quiet cabin and driver assistance.' },
  { id: 'demo-ford-f150', vin: '1FTFW1E50PFA10001', make: 'Ford', model: 'F-150 Lariat', year: 2023, type: 'truck', salePrice: '58900.00', dailyRate: '149.00', status: 'available', imageUrl: 'https://images.unsplash.com/photo-1551830820-330a71b99659?auto=format&fit=crop&w=1200&q=85', description: 'Full-size pickup with a capable bed, all-weather traction, and premium interior.' },
  { id: 'demo-tesla-model3', vin: '5YJ3E1EA7PF100002', make: 'Tesla', model: 'Model 3 Long Range', year: 2024, type: 'sedan', salePrice: '42900.00', dailyRate: '129.00', status: 'available', imageUrl: 'https://images.unsplash.com/photo-1560958089-b8a1929cea89?auto=format&fit=crop&w=1200&q=85', description: 'Electric sedan with long-range driving and a minimal, technology-led cabin.' },
  { id: 'demo-chevy-tahoe', vin: '1GNSKCKD4PR100003', make: 'Chevrolet', model: 'Tahoe Premier', year: 2023, type: 'suv', salePrice: '64900.00', dailyRate: '179.00', status: 'available', imageUrl: 'https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?auto=format&fit=crop&w=1200&q=85', description: 'Three-row SUV with generous cargo room for family trips and airport runs.' },
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