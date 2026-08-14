import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Icon from '../components/Icon';
import ListingCard, { rupees } from '../components/ListingCard';
import { CATEGORIES_LIST, LISTINGS } from '../data/listings';

/* ══ Listing detail ═══════════════════════════════════════════════════════
   Reached from a card at /explore/:id, where :id is the property's Mongo
   _id. This replaced a modal sheet: a room someone wants to send to a
   flatmate needs a URL, and a dialog that traps scroll is the wrong shape for
   a page's worth of specification on a phone.

   Layout is one column by default and splits into content + a sticky booking
   rail from 900px up — the same breakpoint the rest of the site uses.
   ════════════════════════════════════════════════════════════════════════ */

const iconFor = category =>
  CATEGORIES_LIST.find(c => c.id === category)?.icon || 'stay';

/* `categoryDetails` is a different object per category — a hostel has a
   warden and a dormitory has bed counts. Rather than hardcode four shapes,
   the keys are humanised and the values formatted by type, so a field the
   panel adds tomorrow shows up here without a code change. */
const labelise = key => key
  // Split camelCase, but keep runs of capitals together — a naive split on
  // every capital turned `securityCCTV` into "Security C C T V".
  .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
  .replace(/^./, c => c.toUpperCase())
  .trim();

const formatValue = v => {
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
};

/* The icon set is built for 24×24 stroked outlines but has no chevron, and
   one is not worth adding to a file every page loads. */
const Chevron = ({ back }) => (
  <svg className="lst-nav__ico" viewBox="0 0 24 24" aria-hidden="true">
    <path d={back ? 'M15 4 L7 12 L15 20' : 'M9 4 L17 12 L9 20'} />
  </svg>
);

export default function Listing() {
  const { id } = useParams();
  const item = useMemo(() => LISTINGS.find(l => l.id === id), [id]);
  const [shot, setShot] = useState(0);
  const [toast, setToast] = useState('');

  // One timer, replaced whenever the message changes.
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // A different listing means a different gallery; without this the index
  // would carry over and land past the end of a shorter one.
  useEffect(() => { setShot(0); }, [id]);

  const shots = item?.images.length ?? 0;
  // Wraps, so the arrows never dead-end and there is no disabled state to
  // explain on a gallery of three photos.
  const go = step => setShot(i => (i + step + shots) % shots);

  /* Swipe. One pointer position in, one out — enough for a gallery, and it
     costs nothing on desktop where the arrows do the work. */
  const swipe = useMemo(() => {
    let x0 = null;
    return {
      onTouchStart: e => { x0 = e.changedTouches[0].clientX; },
      onTouchEnd: e => {
        if (x0 === null) return;
        const dx = e.changedTouches[0].clientX - x0;
        x0 = null;
        if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
      },
    };
    // `shots` is what `go` closes over, so the handlers are rebuilt with it.
  }, [shots]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Same city first, then the same kind of property. */
  const related = useMemo(() => {
    if (!item) return [];
    const score = l => (l.city === item.city ? 2 : 0) + (l.category === item.category ? 1 : 0);
    return LISTINGS
      .filter(l => l.id !== item.id && score(l) > 0)
      .sort((a, b) => score(b) - score(a))
      .slice(0, 3);
  }, [item]);

  if (!item) {
    return (
      <section id="listing">
        <div className="sec-inner">
          <div className="exp-empty">
            <Icon name="search" className="exp-empty__ico" />
            <h3>That listing is not on Lampose</h3>
            <p>It may have been taken down, or the link may be mistyped.</p>
            <Link className="exp-more" to="/explore">Back to Explore</Link>
          </div>
        </div>
      </section>
    );
  }

  /* Only facts the panel actually holds for this row. A null is a field the
     owner left blank, and a blank row on screen is worse than no row.

     Rent, deposit and the owner's contact used to sit in a card of their own
     beside this table. They read as one set of facts about the property, so
     they are rows here now — the rent flagged `big`, since it is the number
     people came for. */
  const facts = [
    ['Rent', `${rupees(item.rent)} ${item.pricePeriod}`, 'big'],
    ['Deposit', item.deposit ? rupees(item.deposit) : null],
    ['Owner / manager', item.ownerName],
    ['Contact', (
      <a className="lst-tel" href={`tel:${item.ownerMobile.replace(/\s/g, '')}`}>
        <Icon name="megaphone" className="exp-ico" />
        {item.ownerMobile}
      </a>
    )],
    ['Category', item.category],
    ['Stay type', item.stayType],
    ['Minimum term', item.longStayDuration],
    ['Short stay', item.shortStayDuration],
    ['City', item.city],
    ['Locality', item.locality],
    ['Address', item.address],
    ['Monthly rent', item.monthlyPrice && rupees(item.monthlyPrice)],
    ['Daily rate', item.dailyPrice && rupees(item.dailyPrice)],
    ['Listed', item.listedAt && new Date(item.listedAt).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
    })],
    ...Object.entries(item.details || {}).map(([k, v]) => [labelise(k), formatValue(v)]),
  ].filter(([, v]) => v !== null && v !== undefined && v !== '');

  return (
    <section id="listing" className={`exp-card--${item.categorySlug}`}>
      <div className="sec-inner">
        <Link className="lst-back" to="/explore">
          <span aria-hidden="true">←</span> All listings
        </Link>

        {/* ── Hero carousel ────────────────────────────────────────────
            Owners upload several photos through the panel and the collection
            keeps them in order. The track slides rather than cross-fading, so
            it is obvious there is more than one and which way you are moving.
            Arrows on desktop, swipe on touch, arrow keys once focused, and a
            thumbnail strip to jump straight to one. */}
        <header className="lst-hero reveal">
          <div
            className="lst-hero__art"
            role={shots > 1 ? 'group' : undefined}
            aria-roledescription={shots > 1 ? 'carousel' : undefined}
            aria-label={shots > 1 ? `${item.name} photos` : undefined}
            tabIndex={shots > 1 ? 0 : undefined}
            onKeyDown={e => {
              if (shots < 2) return;
              // Scoped to the gallery, so arrow keys still scroll the page.
              if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
              if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
            }}
            {...(shots > 1 ? swipe : {})}
          >
            {shots > 0 && (
              <div
                className="lst-track"
                style={{ transform: `translateX(-${shot * 100}%)` }}
              >
                {item.images.map((src, i) => (
                  <img
                    key={src}
                    src={src}
                    alt={i === 0 ? item.name : ''}
                    loading={i === 0 ? 'eager' : 'lazy'}
                    decoding="async"
                    aria-hidden={i !== shot}
                    onError={e => { e.currentTarget.style.visibility = 'hidden'; }}
                  />
                ))}
              </div>
            )}

            <span className="exp-chip exp-chip--light">{item.category}</span>
            {item.stayType && <span className="exp-chip exp-chip--dark">{item.stayType}</span>}

            {shots > 1 && (
              <>
                <button
                  className="lst-nav lst-nav--back"
                  onClick={() => go(-1)}
                  aria-label="Previous photo"
                >
                  <Chevron back />
                </button>
                <button
                  className="lst-nav lst-nav--next"
                  onClick={() => go(1)}
                  aria-label="Next photo"
                >
                  <Chevron />
                </button>

                <span className="lst-count" aria-live="polite">
                  {shot + 1} / {shots}
                </span>
              </>
            )}
          </div>

          {shots > 1 && (
            <div className="lst-shots">
              {item.images.map((src, i) => (
                <button
                  key={src}
                  className={`lst-shot${i === shot ? ' is-active' : ''}`}
                  onClick={() => setShot(i)}
                  aria-label={`Photo ${i + 1} of ${shots}`}
                  aria-pressed={i === shot}
                >
                  <img src={src} alt="" loading="lazy" decoding="async" />
                </button>
              ))}
            </div>
          )}

          <div className="lst-hero__head">
            <h1 className="lst-title">{item.name}</h1>

            <p className="lst-where">
              <Icon name="pin" className="exp-ico" />
              {item.place}
            </p>

            <div className="lst-scores">
              <span className="lst-kind">
                <Icon name={iconFor(item.category)} className="exp-ico" />
                {item.category}
              </span>
              {item.amenities.length > 0 && (
                <span className="lst-kind">
                  <Icon name="verified" className="exp-ico" />
                  {item.amenities.length} facilities listed
                </span>
              )}
            </div>
          </div>
        </header>

        {/* ── Body ─────────────────────────────────────────────────────
            One column. The booking rail that used to sit on the right held
            rent, deposit and the owner's number — all facts about the
            property, so they are rows in the table below rather than a second
            card repeating them. */}
        <div className="lst-main">
          {item.amenities.length > 0 && (
            <section className="lst-block reveal">
              <h2 className="lst-h2">What is included</h2>
              <ul className="lst-amenities">
                {item.amenities.map(a => (
                  <li key={a}>
                    <Icon name="verified" className="exp-ico" />
                    {a}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="lst-block reveal">
            <h2 className="lst-h2">Property details</h2>
            <dl className="lst-facts">
              {facts.map(([k, v, big]) => (
                <div key={k} className={big ? 'is-big' : undefined}>
                  <dt className="exp-lbl">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>

            <div className="lst-actions">
              <button
                className="exp-book"
                onClick={() => setToast(`Request sent for ${item.name}. The owner will call you back.`)}
              >
                Request a visit
              </button>
              <p className="lst-note">
                Listed through the Lampose onboarding panel. Nothing is paid through
                this site — arrange the visit with the owner directly.
              </p>
            </div>
          </section>
        </div>

        {/* The heading has to describe what actually came back: a listing in a
            city of its own falls through to same-category matches elsewhere,
            and "More in Guntur" over three Bangalore rooms would be a lie. */}
        {related.length > 0 && (
          <section className="lst-related">
            <h2 className="lst-h2">
              {related.every(l => l.city === item.city)
                ? `More in ${item.city}`
                : 'More like this'}
            </h2>
            <div className="exp-grid">
              {related.map((l, i) => <ListingCard key={l.id} item={l} index={i} />)}
            </div>
          </section>
        )}
      </div>

      {toast && (
        <div className="exp-toast" role="status">
          <Icon name="verified" className="exp-ico" />
          {toast}
        </div>
      )}
    </section>
  );
}
