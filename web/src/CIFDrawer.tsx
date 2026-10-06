import { useEffect, useState } from 'react';
import { Anchor, Ship, X } from 'lucide-react';
import { formatKES, type Vehicle } from './api';

interface CIFDrawerProps {
  vehicles: Vehicle[];
  selectedVehicle?: Vehicle | null;
}

const ports = ['Port of Mombasa', 'Nairobi Inland Container Depot', 'Kisumu'];

export function CIFDrawer({ vehicles, selectedVehicle }: CIFDrawerProps) {
  const saleVehicles = vehicles.filter((vehicle) => vehicle.salePrice !== null);
  const [open, setOpen] = useState(false);
  const [vehicleId, setVehicleId] = useState(selectedVehicle?.salePrice ? selectedVehicle.id : saleVehicles[0]?.id ?? '');
  const [port, setPort] = useState(ports[0]);
  const [freight, setFreight] = useState('');
  const [insurance, setInsurance] = useState('');
  const vehicle = saleVehicles.find((item) => item.id === vehicleId) ?? saleVehicles[0];
  const vehicleCost = Number(vehicle?.salePrice ?? 0);
  const landedEstimate = vehicleCost + Math.max(0, Number(freight) || 0) + Math.max(0, Number(insurance) || 0);

  useEffect(() => {
    if (selectedVehicle?.salePrice) setVehicleId(selectedVehicle.id);
  }, [selectedVehicle?.id, selectedVehicle?.salePrice]);

  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  return (
    <>
      <button className="button button--outline cif-launch" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label="Open landed cost calculator">
        <Ship size={16} /><span>Landed cost</span>
      </button>
      {open && <div className="cif-layer">
        <button className="cif-scrim" aria-label="Close landed cost calculator" onClick={() => setOpen(false)} />
        <aside className="cif-drawer" role="dialog" aria-modal="true" aria-labelledby="cif-title">
          <div className="cif-drawer__header">
            <div><span className="section-kicker"><Anchor size={14} /> KENYA IMPORT ESTIMATE</span><h2 id="cif-title">Landed cost.</h2></div>
            <button className="icon-button" onClick={() => setOpen(false)} aria-label="Close calculator"><X size={18} /></button>
          </div>
          <label className="cif-field">Vehicle
            <select value={vehicle?.id ?? ''} onChange={(event) => setVehicleId(event.target.value)}>
              {saleVehicles.map((item) => <option value={item.id} key={item.id}>{item.year} {item.make} {item.model}</option>)}
            </select>
          </label>
          <label className="cif-field">Destination
            <select value={port} onChange={(event) => setPort(event.target.value)}>
              {ports.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <div className="cif-drawer__values">
            <div><span>Vehicle price</span><strong>{formatKES(vehicleCost)}</strong></div>
            <label>Freight (KES)<input type="number" min="0" step="100" inputMode="numeric" value={freight} onChange={(event) => setFreight(event.target.value)} placeholder="Enter quote" /></label>
            <label>Insurance (KES)<input type="number" min="0" step="100" inputMode="numeric" value={insurance} onChange={(event) => setInsurance(event.target.value)} placeholder="Enter quote" /></label>
          </div>
          <div className="cif-drawer__result"><span>Estimated CIF to {port}</span><strong>{formatKES(landedEstimate)}</strong><small>Cost + entered freight + entered insurance</small></div>
          <p className="cif-disclaimer">Indicative estimate only. Freight and insurance must be quoted for the selected vehicle and destination. Excludes import duty, VAT, IDF, RDL, port charges and inland delivery. Nothing is charged or reserved here.</p>
        </aside>
      </div>}
    </>
  );
}