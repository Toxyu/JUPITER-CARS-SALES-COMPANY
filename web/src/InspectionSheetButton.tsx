import { FileDown } from 'lucide-react';
import { formatKES, type Purpose, type Vehicle } from './api';

interface InspectionSheetButtonProps {
  vehicle: Vehicle;
  purpose: Purpose;
}

function escapeHTML(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
}

export function InspectionSheetButton({ vehicle, purpose }: InspectionSheetButtonProps) {
  function openSheet(): void {
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) return;
    printWindow.opener = null;
    const imageURL = vehicle.imageUrl && vehicle.imageUrl.startsWith('https://') ? escapeHTML(vehicle.imageUrl) : '';
    const price = purpose === 'rental' ? vehicle.dailyRate : vehicle.salePrice;
    const priceLabel = purpose === 'rental' ? `${formatKES(Number(price ?? 0))} / day` : formatKES(Number(price ?? 0));
    printWindow.document.write(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHTML(vehicle.make)} ${escapeHTML(vehicle.model)} | Jupiter Cars</title><style>body{font:16px/1.6 Arial,sans-serif;color:#17212f;max-width:800px;margin:40px auto;padding:0 24px}header{display:flex;justify-content:space-between;border-bottom:2px solid #2563eb;padding-bottom:18px}h1{font-size:28px;margin:24px 0 4px}.eyebrow{color:#2563eb;font-size:12px;font-weight:700;text-transform:uppercase}img{width:100%;max-height:380px;object-fit:cover;margin:18px 0}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.field{padding:12px;border:1px solid #dbe2ea}.field span{display:block;color:#64748b;font-size:11px;text-transform:uppercase}.description{white-space:pre-wrap}footer{margin-top:32px;color:#64748b;font-size:11px}@media print{body{margin:0}}</style><body><header><strong>JUPITER CARS · KENYA</strong><span>Vehicle specification sheet</span></header><h1>${escapeHTML(vehicle.year.toString())} ${escapeHTML(vehicle.make)} ${escapeHTML(vehicle.model)}</h1><p class="eyebrow">${purpose === 'rental' ? 'Rental listing' : 'For sale'} · ${escapeHTML(vehicle.type)}</p>${imageURL ? `<img src="${imageURL}" alt="${escapeHTML(vehicle.make)} ${escapeHTML(vehicle.model)}">` : ''}<div class="grid"><div class="field"><span>VIN</span>${escapeHTML(vehicle.vin)}</div><div class="field"><span>Price · KES</span>${escapeHTML(priceLabel)}</div><div class="field"><span>Year</span>${vehicle.year}</div><div class="field"><span>Market</span>Kenya · Right-hand drive</div></div><h2>Vehicle notes</h2><p class="description">${escapeHTML(vehicle.description)}</p><footer>Listing information supplied for reference. Confirm vehicle condition, import status, taxes and fees with the seller before purchase.</footer><script>window.addEventListener('load',()=>window.print())</script></body></html>`);
    printWindow.document.close();
  }

  return <button className="text-action" onClick={openSheet}><FileDown size={15} /> Spec sheet</button>;
}