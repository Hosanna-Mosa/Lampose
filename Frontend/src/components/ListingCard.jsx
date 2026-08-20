import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon';
import { labelForCategory } from '../data/categories';


/**
 * What is actually free, as a badge.
 *
 * This replaced the stay-type chip, which said "Long Stay" on nearly every
 * listing — the backend defaults that field, so it was near-constant, and a
 * badge that reads the same on every card carries no information.
 *
 * Beds are the live figure: `availableBeds` is decremented when an owner
 * accepts a request and given back if it is cancelled, so a listing showing
 * "2 beds free" has two. Zero is shown as "Full" rather than hidden, because
 * a listing that cannot be requested should say so before the visitor picks a
 * room and finds the button dead.
 *
 * Silent where nobody counted. An older property carries no bed figures at
 * all, and "0 beds free" would be a lie about a place that simply has not
 * been measured.
 */
export const availability = (item) => {
  const options = Array.isArray(item.sharingOptions) ? item.sharingOptions : [];
  const counted = options.filter(o => typeof o.availableBeds === 'number');
  if (!counted.length) return null;

  const free = counted.reduce((sum, o) => sum + o.availableBeds, 0);
  if (free <= 0) return { label: 'Full', full: true };
  return { label: `${free} bed${free === 1 ? '' : 's'} free`, full: false };
};

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
    /* PG and hostel are one category, and a row may have been onboarded as
       either — so the facts are pushed in preference order and `push` skips
       whatever is absent. A former PG shows sharing and meals; a former
       hostel shows its room types and warden, from the same branch. */
    case 'PG_HOSTEL':
      push('Sharing', d.sharingTypes || d.roomTypes);
      push('Food', d.foodIncluded ? (d.foodType || 'Included') : null);
      push('Type', d.hostelType);
      push('Mess', d.canteenFacility ? 'Canteen' : null);
      push('Curfew', d.curfewTime);
      break;
    case 'HOTEL':
      push('Sleeps', d.bedTypes);
      push('Beds', d.totalBeds ? `${d.totalBeds} beds` : null);
      push('Bed', d.bedType);
      push('Check-in', d.checkInTime);
      push('Check-out', d.checkOutTime);
      break;
    case 'BACHELOR':
    case 'COLIVE':
      push('Room', d.roomTypes || d.roomType);
      push('Furnishing', d.furnishing);
      push('Includes', d.furnishingItems);
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
          <span className="exp-chip exp-chip--light">{labelForCategory(item.category)}</span>
          {(() => {
            const free = availability(item);
            return free
              ? <span className={`exp-chip ${free.full ? 'exp-chip--muted' : 'exp-chip--dark'}`}>{free.label}</span>
              : null;
          })()}
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


        <div className="xp-card__foot">
          <span className="xp-card__owner">
            <Icon name="users" className="exp-ico" />
            {item.ownerName}
          </span>

          <div className="xp-card__actions">

            <Link className="xp-card__details" to={`/explore/${item.id}`}>
              Details <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
