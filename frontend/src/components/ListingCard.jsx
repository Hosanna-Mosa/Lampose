import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon';

export const rupees = n => `₹${Number(n).toLocaleString('en-IN')}`;

/* ══ Listing card ═════════════════════════════════════════════════════════
   Shared by the Explore results and the "more like this" row on a detail
   page, in two shapes: `grid` (portrait, photo-led) and `list` (wide, photo
   left, everything readable without a click).

   Everything here comes from the onboarding panel's `properties` collection.
   The card carries no rating, review count or "Verified" badge, because the
   collection has no such columns — what is shown is what the owner filled in.
   ════════════════════════════════════════════════════════════════════════ */

/* Up to three facts, picked by category, from the free-form `categoryDetails`
   the panel writes. A category with nothing filled in simply shows fewer. */
const factsFor = item => {
  const d = item.details || {};
  const facts = [];
  const push = (label, value) => {
    if (value === undefined || value === null || value === '' ) return;
    if (Array.isArray(value) && !value.length) return;
    facts.push({ label, value: Array.isArray(value) ? value.join(' · ') : String(value) });
  };

  switch (item.category) {
    case 'PG':
      push('Sharing', d.sharingTypes);
      push('Food', d.foodIncluded ? (d.foodType || 'Included') : null);
      push('Curfew', d.curfewTime);
      break;
    case 'Hostel':
      push('Type', d.hostelType);
      push('Rooms', d.roomTypes);
      push('Mess', d.canteenFacility ? 'Canteen' : null);
      break;
    case 'Dormitory':
      push('Beds', d.totalBeds ? `${d.totalBeds} beds` : null);
      push('Bed', d.bedType);
      push('Check-in', d.checkInTime);
      break;
    case 'Bachelor Room':
      push('Room', d.roomType);
      push('Furnishing', d.furnishing);
      push('Tenants', d.allowedTenants);
      break;
    default:
      break;
  }

  if (facts.length < 3 && item.deposit) facts.push({ label: 'Deposit', value: rupees(item.deposit) });
  return facts.slice(0, 3);
};

export default function ListingCard({ item, index = 0, view = 'grid' }) {
  const images = item.images || [];
  const amenities = item.amenities || [];
  const facts = factsFor(item);
  const [shot, setShot] = useState(0);

  /* The gallery lives inside a card that is itself one big link, so the
     arrows have to stop the click before it reaches the overlay. */
  const go = (step, e) => {
    e.preventDefault();
    e.stopPropagation();
    setShot(i => (i + step + images.length) % images.length);
  };

  const cover = images[shot];
  const tel = String(item.ownerMobile || '').replace(/[^\d+]/g, '');

  return (
    <article
      className={`exp-card xp-card xp-card--${view} exp-card--${item.categorySlug}`}
      style={{ '--i': String(index) }}
    >
      <div className="xp-card__media">
        {cover && (
          <img
            className="xp-card__img"
            key={cover}
            src={cover}
            alt=""
            loading="lazy"
            decoding="async"
            /* The category gradient underneath is the fallback, so a dead CDN
               link costs the photo rather than the card. */
            onError={e => { e.currentTarget.style.visibility = 'hidden'; }}
          />
        )}

        <div className="xp-card__top">
          <span className="exp-chip exp-chip--light">{item.category}</span>
          {item.stayType && <span className="exp-chip exp-chip--dark">{item.stayType}</span>}
        </div>

        {images.length > 1 && (
          <>
            <button
              className="xp-card__nav xp-card__nav--back"
              onClick={e => go(-1, e)}
              aria-label="Previous photo"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 4 L7 12 L15 20" /></svg>
            </button>
            <button
              className="xp-card__nav xp-card__nav--next"
              onClick={e => go(1, e)}
              aria-label="Next photo"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4 L17 12 L9 20" /></svg>
            </button>
            <span className="xp-card__dots" aria-hidden="true">
              {images.slice(0, 6).map((src, i) => (
                <i key={src} className={i === shot ? 'is-on' : ''} />
              ))}
            </span>
          </>
        )}

        <span className="xp-card__price">
          <strong>{rupees(item.rent)}</strong>
          <span>{item.pricePeriod}</span>
        </span>
      </div>

      <div className="xp-card__body">
        <h3 className="xp-card__title">
          {/* The pseudo-element on this link covers the whole card, so the
              card is one big target and the controls above it still work. */}
          <Link className="xp-card__link" to={`/explore/${item.id}`}>{item.name}</Link>
        </h3>

        <p className="xp-card__where">
          <Icon name="pin" className="exp-ico" />
          <span>{item.place}</span>
        </p>

        {facts.length > 0 && (
          <dl className="xp-card__facts">
            {facts.map(f => (
              <div key={f.label}>
                <dt>{f.label}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {amenities.length > 0 && (
          <ul className="xp-card__tags">
            {amenities.slice(0, view === 'list' ? 6 : 3).map(a => <li key={a}>{a}</li>)}
            {amenities.length > (view === 'list' ? 6 : 3) && (
              <li className="is-more">+{amenities.length - (view === 'list' ? 6 : 3)}</li>
            )}
          </ul>
        )}

        <div className="xp-card__foot">
          <span className="xp-card__owner">
            <Icon name="users" className="exp-ico" />
            {item.ownerName}
          </span>

          <div className="xp-card__actions">
            {tel && (
              <a className="exp-call" href={`tel:${tel}`} aria-label={`Call ${item.ownerName}`}>
                Call
              </a>
            )}
            <Link className="xp-card__details" to={`/explore/${item.id}`}>
              Details <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
