import { Link } from 'react-router-dom';
import Icon from './Icon';

export const rupees = n => `₹${Number(n).toLocaleString('en-IN')}`;

/* ══ Listing card ═════════════════════════════════════════════════════════
   Shared by the Explore grid and the "more like this" row on a detail page.

   Everything here comes from the onboarding panel's `properties` collection.
   The card used to carry a star rating, a review count and a "Verified"
   badge; the collection has no such columns, so they are gone rather than
   invented. What is shown instead is what the owner actually filled in.
   ════════════════════════════════════════════════════════════════════════ */
export default function ListingCard({ item, index = 0 }) {
  const cover = item.images[0];

  return (
    <article
      className={`exp-card exp-card--${item.categorySlug}`}
      style={{ '--i': String(index) }}
    >
      <Link className="exp-banner" to={`/explore/${item.id}`} aria-label={item.name}>
        {cover && (
          <img
            className="exp-banner__img"
            src={cover}
            alt=""
            loading="lazy"
            decoding="async"
            /* The category gradient underneath is the fallback, so a dead
               CDN link costs the photo rather than the card. */
            onError={e => { e.currentTarget.style.display = 'none'; }}
          />
        )}

        <span className="exp-chip exp-chip--light">{item.category}</span>
        {item.stayType && <span className="exp-chip exp-chip--dark">{item.stayType}</span>}

        {item.images.length > 1 && (
          <span className="exp-shots">
            <Icon name="grid" className="exp-ico" />
            {item.images.length}
          </span>
        )}

        <span className="exp-price">
          <strong>{rupees(item.rent)}</strong>
          <span>{item.pricePeriod}</span>
        </span>
      </Link>

      <div className="exp-body">
        <h3 className="exp-title">
          <Link to={`/explore/${item.id}`}>{item.name}</Link>
        </h3>

        {/* Locality and owner share one clipped line — two stacked blocks with
            their own labels is what made the body taller than the picture. */}
        <p className="exp-where">
          <Icon name="pin" className="exp-ico" />
          <span>{item.place} · {item.ownerName}</span>
        </p>

        <ul className="exp-tags">
          {item.amenities.slice(0, 3).map(a => <li key={a}>{a}</li>)}
          {item.amenities.length > 3 && (
            <li className="exp-tags__more">+{item.amenities.length - 3}</li>
          )}
        </ul>

        <div className="exp-actions">
          <a
            className="exp-call"
            href={`tel:${item.ownerMobile.replace(/\s/g, '')}`}
            aria-label={`Call ${item.ownerName}`}
          >
            Call
          </a>
          <Link className="exp-more" to={`/explore/${item.id}`}>
            Details <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </article>
  );
}
