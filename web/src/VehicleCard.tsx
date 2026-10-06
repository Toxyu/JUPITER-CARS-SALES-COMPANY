import { ArrowLeft, ArrowRight, ArrowUpRight, CalendarDays, CarFront, Rotate3D, Video, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { formatKES, type Purpose, type Vehicle } from './api';
import { InspectionSheetButton } from './InspectionSheetButton';

interface VehicleCardProps {
  vehicle: Vehicle;
  purpose: Purpose;
  selected: boolean;
  onSelect: (vehicle: Vehicle) => void;
}

export function VehicleCard({ vehicle, purpose, selected, onSelect }: VehicleCardProps) {
  const images = vehicle.images?.length ? vehicle.images : vehicle.imageUrl ? [vehicle.imageUrl] : [];
  const [imageIndex, setImageIndex] = useState(0);
  const [walkaroundOpen, setWalkaroundOpen] = useState(false);
  const pointerStart = useRef<number | null>(null);
  const price = purpose === 'rental' ? vehicle.dailyRate : vehicle.salePrice;
  const walkaroundURL = vehicle.videoUrl?.startsWith('https://') ? vehicle.videoUrl : null;

  useEffect(() => {
    if (!walkaroundOpen) return;
    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape') setWalkaroundOpen(false);
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [walkaroundOpen]);

  function moveImage(direction: -1 | 1): void {
    setImageIndex((current) => (current + direction + images.length) % images.length);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLElement>): void {
    if (event.pointerType === 'touch') return;
    const rect = event.currentTarget.getBoundingClientRect();
    const offsetX = (event.clientX - rect.left) / rect.width - 0.5;
    const offsetY = (event.clientY - rect.top) / rect.height - 0.5;
    event.currentTarget.style.setProperty('--tilt-x', `${offsetY * -3}deg`);
    event.currentTarget.style.setProperty('--tilt-y', `${offsetX * 3}deg`);
  }

  function finishSwipe(event: React.PointerEvent<HTMLElement>): void {
    if (pointerStart.current === null) return;
    const distance = event.clientX - pointerStart.current;
    if (Math.abs(distance) > 36 && images.length > 1) moveImage(distance < 0 ? 1 : -1);
    pointerStart.current = null;
  }

  return (
    <>
    <article className={`vehicle-card${selected ? ' vehicle-card--selected' : ''}`} onPointerMove={handlePointerMove} onPointerLeave={(event) => { event.currentTarget.style.setProperty('--tilt-x', '0deg'); event.currentTarget.style.setProperty('--tilt-y', '0deg'); }}>
      <div className="vehicle-card__image" onPointerDown={(event) => { pointerStart.current = event.clientX; }} onPointerUp={finishSwipe} onPointerCancel={() => { pointerStart.current = null; }}>
        {images.length ? <img src={images[imageIndex]} alt={`${vehicle.year} ${vehicle.make} ${vehicle.model}, exterior view ${imageIndex + 1}`} loading="lazy" draggable="false" /> : <CarFront aria-hidden="true" />}
        <span className="vehicle-card__type">{vehicle.type}</span>
        <button className="vehicle-card__arrow" onClick={() => onSelect(vehicle)} aria-label={`View ${vehicle.make} ${vehicle.model} details`}><ArrowUpRight size={17} aria-hidden="true" /></button>
        {images.length > 1 && <>
          <button className="gallery-control gallery-control--previous" onClick={() => moveImage(-1)} aria-label="Previous exterior photo"><ArrowLeft size={15} /></button>
          <button className="gallery-control gallery-control--next" onClick={() => moveImage(1)} aria-label="Next exterior photo"><ArrowRight size={15} /></button>
          <span className="gallery-count"><Rotate3D size={13} /> Exterior {String(imageIndex + 1).padStart(2, '0')} / {String(images.length).padStart(2, '0')}</span>
        </>}
      </div>
      <div className="vehicle-card__body">
        <div className="vehicle-card__eyebrow"><span>{vehicle.year}</span><span className="dot-separator" />{purpose === 'rental' ? <><CalendarDays size={13} /> Flexible dates</> : 'Available now'}</div>
        <h3>{vehicle.make} <span>{vehicle.model}</span></h3>
        <p className="vehicle-card__description">{vehicle.description}</p>
        <div className="vehicle-card__footer">
          <p className="vehicle-card__price">{formatKES(Number(price ?? 0))}<span>{purpose === 'rental' ? ' / day' : ' asking'}</span></p>
          <div className="vehicle-card__actions">
            {walkaroundURL && <button className="text-action" onClick={() => setWalkaroundOpen(true)}><Video size={15} /> Walkaround</button>}
            <InspectionSheetButton vehicle={vehicle} purpose={purpose} />
            <button className="text-action" onClick={() => onSelect(vehicle)}>{purpose === 'rental' ? 'Reserve' : 'Details'} <ArrowUpRight size={15} /></button>
          </div>
        </div>
      </div>
    </article>
    {walkaroundOpen && walkaroundURL && <div className="media-modal" onMouseDown={(event) => { if (event.target === event.currentTarget) setWalkaroundOpen(false); }}>
      <section className="media-modal__dialog" role="dialog" aria-modal="true" aria-labelledby={`walkaround-${vehicle.id}`}>
        <div className="media-modal__header"><div><span className="section-kicker">SELLER-SUPPLIED MEDIA</span><h2 id={`walkaround-${vehicle.id}`}>{vehicle.make} {vehicle.model} walkaround</h2></div><button className="icon-button" onClick={() => setWalkaroundOpen(false)} aria-label="Close walkaround"><X size={18} /></button></div>
        <video src={walkaroundURL} autoPlay muted controls playsInline />
        <p>Check listing notes and seller details before making a purchase decision.</p>
      </section>
    </div>}
    </>
  );
}