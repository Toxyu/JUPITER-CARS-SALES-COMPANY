import { ArrowUpRight, CalendarDays, CarFront } from 'lucide-react';
import type { Purpose, Vehicle } from './api';

interface VehicleCardProps {
  vehicle: Vehicle;
  purpose: Purpose;
  selected: boolean;
  onSelect: (vehicle: Vehicle) => void;
}

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export function VehicleCard({ vehicle, purpose, selected, onSelect }: VehicleCardProps) {
  const price = purpose === 'rental' ? vehicle.dailyRate : vehicle.salePrice;
  return (
    <article className={`vehicle-card${selected ? ' vehicle-card--selected' : ''}`}>
      <button className="vehicle-card__image" onClick={() => onSelect(vehicle)} aria-label={`View ${vehicle.year} ${vehicle.make} ${vehicle.model}`}>
        {vehicle.imageUrl ? <img src={vehicle.imageUrl} alt={`${vehicle.year} ${vehicle.make} ${vehicle.model}`} loading="lazy" /> : <CarFront aria-hidden="true" />}
        <span className="vehicle-card__type">{vehicle.type}</span>
        <span className="vehicle-card__arrow"><ArrowUpRight size={17} aria-hidden="true" /></span>
      </button>
      <div className="vehicle-card__body">
        <div className="vehicle-card__eyebrow"><span>{vehicle.year}</span><span className="dot-separator" />{purpose === 'rental' ? <><CalendarDays size={13} /> Flexible dates</> : 'Available now'}</div>
        <h3>{vehicle.make} <span>{vehicle.model}</span></h3>
        <p className="vehicle-card__description">{vehicle.description}</p>
        <div className="vehicle-card__footer">
          <p className="vehicle-card__price">{money.format(Number(price ?? 0))}<span>{purpose === 'rental' ? ' / day' : ' starting'}</span></p>
          <button className="text-action" onClick={() => onSelect(vehicle)}>{purpose === 'rental' ? 'Reserve' : 'Explore'} <ArrowUpRight size={15} /></button>
        </div>
      </div>
    </article>
  );
}