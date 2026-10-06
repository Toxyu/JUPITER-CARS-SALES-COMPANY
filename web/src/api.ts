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

export async function searchVehicles(params: URLSearchParams, signal?: AbortSignal): Promise<Vehicle[]> {
  const response = await fetch(`${apiBase}/api/v1/vehicles/search?${params.toString()}`, { signal });
  if (!response.ok) throw new Error('Inventory could not be loaded. Please retry.');
  const body = await response.json() as { items: Vehicle[] };
  return body.items;
}

export async function checkAvailability(vehicleId: string, startDate: string, endDate: string, signal: AbortSignal): Promise<boolean> {
  const params = new URLSearchParams({ vehicleId, startDate, endDate });
  const response = await fetch(`${apiBase}/api/v1/rentals/availability?${params.toString()}`, { signal });
  if (!response.ok) throw new Error('Availability could not be checked.');
  const body = await response.json() as { available: boolean };
  return body.available;
}