import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Icon from '../components/Icon';
import ListingCard, { rupees } from '../components/ListingCard';
import ConnectionError from '../components/ConnectionError';
import VisitRequestDialog from '../components/VisitRequestDialog';
import StayIntentPicker from '../components/StayIntentPicker';
import VisitStatus from '../components/VisitStatus';
import { iconForCategory } from '../data/categories';
import listingsApi from '../api/listingsApi';
import { useReveals } from '../hooks/useSite';
import useVisitRequest from '../hooks/useVisitRequest';

const iconFor = iconForCategory;

const labelise = key => key
  .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
  .replace(/^./, c => c.toUpperCase())
  .trim();

const formatValue = v => {
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) return v.join(', ');
  /* A plain object used to fall through to String(v) and print
     "[object Object]" — which is what `sharingPrices` did the moment the
     panel started writing it. */
  if (v && typeof v === 'object') {
    return Object.entries(v)
      .map(([k, val]) => `${labelise(k)}: ${formatValue(val)}`)
      .join(' · ');
  }
  return String(v);
};

/* Rendered as the occupancy chooser above the button, so they would only be
   repeated as rows in the table below it. Keyed by category because that is
   how the panel writes them — see backend/src/utils/sharing.js. */
const OCCUPANCY_KEY = {
  PG: 'sharingTypes',
  Hostel: 'roomTypes',
  Dormitory: 'bedType',
  'Bachelor Room': 'roomType',
};

const Chevron = ({ back }) => (
  <svg className="lst-nav__ico" viewBox="0 0 24 24" aria-hidden="true">
    <path d={back ? 'M15 4 L7 12 L15 20' : 'M9 4 L17 12 L9 20'} />
  </svg>
);

export default function Listing() {
  const { id } = useParams();
  const [item, setItem] = useState(null);
  const [siblings, setSiblings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [shot, setShot] = useState(0);
  const [toast, setToast] = useState('');
  const [askOpen, setAskOpen] = useState(false);
  const [showAllAmenities, setShowAllAmenities] = useState(false);

  /* One object for every answer the visitor gives. Kept together because they
     depend on each other — changing the stay type invalidates the duration,
     and the rate depends on both plus the room. */
  const [intent, setIntent] = useState({
    sharing: null,
    stayType: null,
    duration: null,
    durationUnit: null,
    joiningDate: null,
    flexibleJoin: null,
    consented: false,
  });

  /* Survives a reload and a return visit — see hooks/useVisitRequest.js. */
  const { request: visit, setRequest: setVisit } = useVisitRequest(id);

  useReveals([loading]);

  /* The detail and the "more like this" row both come from the database —
     there is no bundled copy to read from. The related row needs the whole
     collection to rank against, so both requests go out together and a
     failure of the second only costs the row, not the page. */
  const load = useCallback(async signal => {
    setLoading(true);
    setError(null);
    try {
      const [detail, all] = await Promise.all([
        listingsApi.getListingById(id),
        listingsApi.getListings().catch(() => []),
      ]);
      if (signal?.aborted) return;
      setItem(detail);
      setSiblings(all);
    } catch (err) {
      if (signal?.aborted) return;
      if (err.kind === 'server' || err.kind === 'api') {
        const kind = await listingsApi.diagnose();
        if (signal?.aborted) return;
        if (kind !== err.kind) err.kind = kind;
      }
      console.error('[Listing] Could not load listing:', err);
      setItem(null);
      setError(err);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  // One timer, replaced whenever the message changes.
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // A different listing means a different gallery; without this the index
  // would carry over and land past the end of a shorter one.
  useEffect(() => { setShot(0); }, [id]);

  /* Nothing is preselected. Most listings quote only one stay track, and
     filling it in for the visitor made the page look like it had decided —
     the answer has to be theirs, even when there is only one to give. The
     duration and the rest follow from it and stay empty until it is chosen. */
  useEffect(() => {
    if (!item) return;
    setIntent({
      sharing: null,
      stayType: null,
      duration: null,
      durationUnit: null,
      joiningDate: null,
      flexibleJoin: null,
      consented: false,
    });
    setShowAllAmenities(false);
  }, [item]);

  const images = Array.isArray(item?.images) ? item.images : (item?.imageUrl ? [item.imageUrl] : []);
  const shots = images.length;
  const amenities = Array.isArray(item?.amenities) ? item.amenities : [];
  const ownerMobile = item?.ownerMobile ? String(item.ownerMobile) : '';
  // Normalised by the API from whichever key this category uses.
  const sharingOptions = Array.isArray(item?.sharingOptions) ? item.sharingOptions : [];
  const description = item?.description || item?.details?.description || item?.overview || item?.summary || item?.about;

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
    return siblings
      .filter(l => l.id !== item.id && score(l) > 0)
      .sort((a, b) => score(b) - score(a))
      .slice(0, 3);
  }, [item, siblings]);

  if (loading) {
    return (
      <section id="listing">
        <div className="sec-inner">
          <div className="exp-empty">
            <p>Loading this listing…</p>
          </div>
        </div>
      </section>
    );
  }

  /* A broken connection and a listing that genuinely is not there look
     nothing alike to whoever has to fix it, so they are not merged. */
  if (error) {
    return (
      <section id="listing">
        <div className="sec-inner">
          <ConnectionError error={error} onRetry={() => load()} busy={loading} />
        </div>
      </section>
    );
  }

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

  /* ── The quote, and whether the button may light ──────────────────────
     Mirrors utils/stayIntent.js in the main backend, which stays the
     authority: it re-derives every figure when the request arrives and
     stores what it derives. This is a preview so the visitor sees the
     number before pressing, not a second source of truth. */
  const simple = item.simpleSharingPath === true;
  const rates = item.stayRates || {};

  const prorate = (monthly, iso) => {
    if (!monthly || !iso) return null;
    const d = new Date(`${iso}T00:00:00Z`);
    const daysInMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    const daysCharged = daysInMonth - d.getUTCDate() + 1;
    const full = daysCharged >= daysInMonth;
    return {
      amount: Math.round(full ? monthly : (monthly / daysInMonth) * daysCharged),
      daysCharged: full ? daysInMonth : daysCharged,
      daysInMonth,
      full,
    };
  };

  const plural = (n, word) => `${n} ${n === 1 ? word : `${word}s`}`;

  const quote = (() => {
    if (simple) {
      if (!intent.sharing) return null;
      const amount = intent.sharing.price || item.rent;
      return amount ? { amount, unitLabel: '/mo', durationLabel: null, prorated: null } : null;
    }
    if (!intent.stayType) return null;

    if (intent.stayType === 'short') {
      const amount = rates.short?.dailyPrice;
      if (!amount) return null;
      return {
        amount,
        unitLabel: '/night',
        durationLabel: intent.duration ? plural(intent.duration, 'night') : null,
        prorated: null,
      };
    }

    /* A per-room monthly price beats the headline one; the headline is the
       fallback when the panel priced the property but not each option. */
    const amount = intent.sharing?.price || rates.long?.monthlyPrice;
    if (!amount) return null;
    return {
      amount,
      unitLabel: '/mo',
      durationLabel: intent.duration ? plural(intent.duration, 'month') : null,
      prorated: prorate(amount, intent.joiningDate),
    };
  })();

  /* The first unanswered thing, named — a disabled button with no reason is
     just a dead end. Order matches the order they appear on the page. */
  const missing = (() => {
    if (sharingOptions.length > 0 && !intent.sharing) return 'Pick a room type to continue.';
    if (simple) return null;
    if (!intent.stayType) return 'Choose a short or long stay.';
    if (!intent.duration) return `Choose how many ${intent.stayType === 'short' ? 'nights' : 'months'}.`;
    if (!intent.joiningDate) return 'Pick a joining date.';
    if (intent.flexibleJoin === null || intent.flexibleJoin === undefined) {
      return 'Let us know whether your dates are flexible.';
    }
    if (!intent.consented) return 'Accept the Privacy Policy and Terms to continue.';
    return null;
  })();

  const ready = missing === null;

  /* Only facts the panel actually holds for this row. A null is a field the
     owner left blank, and a blank row on screen is worse than no row.

     Rent, deposit and the owner's contact used to sit in a card of their own
     beside this table. They read as one set of facts about the property, so
     they are rows here now — the rent flagged `big`, since it is the number
     people came for. */
  const facts = [
    ['Rent', item.rent != null ? `${rupees(item.rent)} ${item.pricePeriod || ''}`.trim() : null, 'big'],
    ['Deposit', item.deposit ? rupees(item.deposit) : null],
    ['Owner / manager', item.ownerName || null],
    ['Contact', ownerMobile ? (
      <a className="lst-tel" href={`tel:${ownerMobile.replace(/\s/g, '')}`}>
        <Icon name="megaphone" className="exp-ico" />
        {ownerMobile}
      </a>
    ) : null],
    ['Category', item.category || null],
    ['Stay type', item.stayType || null],
    ['Minimum term', item.longStayDuration || null],
    ['Short stay', item.shortStayDuration || null],
    ['City', item.city || null],
    ['Locality', item.locality || null],
    ['Address', item.address || null],
    ['Monthly rent', item.monthlyPrice && rupees(item.monthlyPrice)],
    ['Daily rate', item.dailyPrice && rupees(item.dailyPrice)],
    ['Listed', item.listedAt && new Date(item.listedAt).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
    })],
    /* `sharingPrices` and the category's occupancy key are the chooser above
       the button; repeating them here would say the same thing twice, and
       `description` is already the About section. */
    ...Object.entries(item.details || {})
      .filter(([k]) => ![
        'sharingPrices', OCCUPANCY_KEY[item.category], 'description',
      ].includes(k))
      .map(([k, v]) => [labelise(k), formatValue(v)]),
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
                {images.map((src, i) => (
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
              {images.map((src, i) => (
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
              {/* Shown only where the panel actually recorded it. A listing
                  with nothing on file is not "unverified" — it is unstated,
                  and there is no honest badge for that. */}
              {item.isVerified && (
                <span className="lst-kind lst-kind--verified">
                  <Icon name="verified" className="exp-ico" />
                  Verified by Lampose
                </span>
              )}
              {/* Only where the panel recorded it — hostels carry a type,
                  PGs have no gender field and get no badge rather than a
                  guessed one. */}
              {item.gender && (
                <span className="lst-kind">
                  <Icon name="users" className="exp-ico" />
                  {item.gender}
                </span>
              )}
              {amenities.length > 0 && (
                <span className="lst-kind">
                  <Icon name="verified" className="exp-ico" />
                  {amenities.length} facilities listed
                </span>
              )}
            </div>

            {description && (
              <p className="lst-hero-desc">
                {description}
              </p>
            )}
          </div>
        </header>

        {/* ── Body ─────────────────────────────────────────────────────
            One column. The booking rail that used to sit on the right held
            rent, deposit and the owner's number — all facts about the
            property, so they are rows in the table below rather than a second
            card repeating them. */}
        <div className="lst-main">
          {description && (
            <section className="lst-block reveal">
              <h2 className="lst-h2">About this property</h2>
              <p className="lst-desc-body">
                {description}
              </p>
            </section>
          )}

          {/* Meals, from the two fields the panel actually collects. No
              servings, timings or notes — those are not recorded, and a
              plausible-looking invention would be read as a promise. */}
          {item.meals && (
            <section className="lst-block reveal">
              <h2 className="lst-h2">Meals</h2>
              <p className="lst-desc-body">
                {item.meals.included
                  ? <>Food is <strong>included in the rent</strong>{item.meals.foodType ? <> — {item.meals.foodType}</> : null}.</>
                  : <>Meals are <strong>not included</strong> in the rent{item.meals.foodType ? <> ({item.meals.foodType} available)</> : null}.</>}
              </p>
            </section>
          )}

          {amenities.length > 0 && (
            <section className="lst-block reveal">
              <h2 className="lst-h2">What is included</h2>
              {/* Six is enough to judge a place by; the rest are one tap away
                  rather than a wall to scroll past. */}
              <ul className="lst-amenities">
                {(showAllAmenities ? amenities : amenities.slice(0, 6)).map(a => (
                  <li key={a}>
                    <Icon name="verified" className="exp-ico" />
                    {a}
                  </li>
                ))}
              </ul>
              {amenities.length > 6 && (
                <button
                  className="xp-linkbtn lst-seeall"
                  onClick={() => setShowAllAmenities(v => !v)}
                >
                  {showAllAmenities ? 'Show fewer' : `See all ${amenities.length}`}
                </button>
              )}
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
              {/* Once the owner has been asked, the button is gone: pressing it
                  again would only ring the same phone about the same room. The
                  old record stays until a new one replaces it, so cancelling
                  the dialog cannot lose the answer already on screen. */}
              {visit ? (
                <VisitStatus request={visit} onAskAgain={() => setAskOpen(true)} />
              ) : (
                <>
                  <StayIntentPicker listing={item} value={intent} onChange={setIntent} />

                  {/* Consent, with the real pages behind it — both routes
                      exist on this site, so neither link is a placeholder. */}
                  {!item.simpleSharingPath && (
                    <label className="lst-consent">
                      <input
                        type="checkbox"
                        checked={intent.consented === true}
                        onChange={e => setIntent(v => ({ ...v, consented: e.target.checked }))}
                      />
                      <span>
                        I accept the <Link to="/privacy">Privacy Policy</Link> and{' '}
                        <Link to="/terms">Terms and Conditions</Link>.
                      </span>
                    </label>
                  )}

                  {/* The bar restates what was chosen and what it costs, so
                      nobody presses the button without seeing the number. */}
                  <div className="lst-bar">
                    <div className="lst-bar__sum">
                      {quote ? (
                        <>
                          <strong>{rupees(quote.amount)}</strong>
                          <span>{quote.unitLabel}</span>
                          {quote.durationLabel && <em>· {quote.durationLabel}</em>}
                        </>
                      ) : (
                        <span className="lst-bar__empty">Choose your stay to see the rate</span>
                      )}
                      {item.deposit ? (
                        <span className="lst-bar__dep">Deposit {rupees(item.deposit)}</span>
                      ) : null}
                    </div>

                    <button className="exp-book" disabled={!ready} onClick={() => setAskOpen(true)}>
                      Request a visit
                    </button>
                  </div>

                  {/* Pro-rated only where it is real: a long stay with a
                      monthly rate and a chosen date. */}
                  {quote?.prorated && !quote.prorated.full && (
                    <p className="lst-prorate">
                      First month is pro-rated to <strong>{rupees(quote.prorated.amount)}</strong>
                      {' '}— {quote.prorated.daysCharged} of {quote.prorated.daysInMonth} days.
                    </p>
                  )}

                  {!ready && missing && <p className="lst-sharing__hint">{missing}</p>}
                </>
              )}

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

      {askOpen && (
        <VisitRequestDialog
          listing={item}
          sharing={intent.sharing}
          intent={intent}
          onClose={() => setAskOpen(false)}
          onVerified={next => {
            setVisit(next);
            setAskOpen(false);
            setToast(`Sent. We've asked the owner of ${item.name} — watch this page.`);
          }}
        />
      )}

      {toast && (
        <div className="exp-toast" role="status">
          <Icon name="verified" className="exp-ico" />
          {toast}
        </div>
      )}
    </section>
  );
}
