import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Icon } from '../components/common/atoms/Icon/Icon';
import { ListingCard, rupees } from '../components/common/organisms/ListingCard/ListingCard';
import { ConnectionError } from '../components/common/organisms/ConnectionError/ConnectionError';
import { VisitRequestDialog } from '../components/common/organisms/VisitRequestDialog/VisitRequestDialog';
import { StayIntentPicker } from '../components/common/organisms/StayIntentPicker/StayIntentPicker';
import { VisitStatus } from '../components/common/organisms/VisitStatus/VisitStatus';
import { iconForCategory, labelForCategory } from '../data/categories';
import listingsApi from '../api/listingsApi';
import { useReveals } from '../hooks/useSite';
import useVisitRequest from '../hooks/useVisitRequest';
import { Chevron } from '../components/listing/atoms/Chevron/Chevron';
import { Aside, Box, DescriptionDetail, DescriptionList, DescriptionTerm, Emphasis, Heading, Image, Inline, Input, Label, List, ListItem, Masthead, PlainButton, Region, Strong, Text } from '../components/common/atoms';
import { AvailabilityChip } from '../components/common/molecules/AvailabilityChip/AvailabilityChip';

const iconFor = iconForCategory;


/* ══════════════════════════════════════════════════════════════════════════
   What each category's detail table shows, and in what order.

   ## Why this is a curated list and not the object

   It used to print `categoryDetails` verbatim, label-ised. That produced rows
   nobody could act on — `Sharing Beds: Single: 2 · 2 Sharing: 8` restating the
   room chooser, `Rate Type: Daily Rate` restating the price — and it published
   whatever a future field happened to be called, including one that should
   never have been public (see `wardenContact` below).

   ## The order comes from what renters actually look for

   Researched against how Indian platforms present this stock — NoBroker, Zolo,
   Colive, 99acres — and against tenant-side checklists. Three things drove it:

     · Inclusions beat labels. "Food included: Yes" is the flag every platform
       shows and the one tenants say misleads them; the meals and their timings
       are the answer they actually want, so those lead.
     · House rules are a first-class field for shared stock. NoBroker ships
       "Gate Closing Time" as its own row — no other rental category has it —
       and curfew is the most common post-move complaint.
     · Shared-resource RATIOS matter more than the amenity flag. A washroom
       count against a bed count is what tells somebody whether the queue is
       tolerable; "Attached bathroom: Yes" does not.

   Anything absent is simply not rendered, so a half-filled listing shows a
   short table rather than a wall of "Not specified".
   ══════════════════════════════════════════════════════════════════════════ */

/** "Breakfast 7:30 AM - 9:30 AM · Dinner 8:00 PM - 10:00 PM" */
const mealSchedule = (provided, timings) => {
  const meals = Array.isArray(provided) ? provided : [];
  if (!meals.length) return null;
  const at = timings && typeof timings === 'object' ? timings : {};
  return meals.map(m => (at[m] ? `${m} ${at[m]}` : m)).join(' · ');
};

const categoryFacts = (category, d = {}) => {
  const rows = [];
  const add = (label, value) => {
    if (value === null || value === undefined || value === '' ) return;
    if (Array.isArray(value) && !value.length) return;
    rows.push([label, typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value]);
  };

  if (category === 'PG_HOSTEL') {
    add('Who it is for', d.hostelType);
    add('Meals', d.foodIncluded === false ? 'Not provided' : mealSchedule(d.mealsProvided, d.mealTimings));
    add('Food', d.foodIncluded === false ? null : d.foodType);
    add('Mess / canteen', d.canteenFacility);
    /* NoBroker ships this as its own field, and it is the rule people are
       most often caught out by. */
    add('Gate closing time', d.curfewTime);
    add('Warden on site', d.wardenContact ? 'Yes' : d.securityCCTV === undefined ? null : false);
    add('CCTV & security', d.securityCCTV);
    add('Housekeeping', d.housekeeping);
    add('Study room', d.studyRoom);
    return rows;
  }

  if (category === 'BACHELOR' || category === 'COLIVE') {
    /* Who it is let to leads, because it is a gate rather than a detail: a
       flat that will not take the person reading it wastes their whole visit,
       and "bachelors allowed" is the field renters filter on first. */
    add('Let to', String(d.allowedTenants || '').replace(/^Bachelors /, '') || null);
    add('Furnishing', d.furnishing);
    add('What is included', Array.isArray(d.furnishingItems) ? d.furnishingItems.join(', ') : null);
    add('Kitchen', d.kitchenAvailable);
    add('Water supply', d.waterSupply);
    return rows;
  }

  if (category === 'HOTEL') {
    add('Beds in total', d.totalBeds);
    /* The ratio, not the count — one number against the other is what says
       whether the morning queue is bearable. */
    add('Shared washrooms', d.washroomsCount
      ? (d.totalBeds ? `${d.washroomsCount} · about ${Math.ceil(d.totalBeds / d.washroomsCount)} beds each` : d.washroomsCount)
      : null);
    add('Lockers', d.lockersAvailable);
    /* Older rows carry these; the form no longer collects them. Shown where
       present because a nightly guest turned away at 1 PM has lost a day. */
    add('Check-in', d.checkInTime);
    add('Check-out', d.checkOutTime);
    return rows;
  }

  return rows;
};

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

/* Rendered as the occupancy chooser in the rail, so they would only be
   repeated as rows in the table below it. Keyed by category because that is
   how the panel writes them — see backend/src/utils/sharing.js. */


export function Listing() {
  const { id } = useParams();
  const [item, setItem] = useState(null);
  const [siblings, setSiblings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [shot, setShot] = useState(0);
  const [lightbox, setLightbox] = useState(false);
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
    /* Hotels ask for two dates and a headcount instead of a track and a
       duration — see StayIntentPicker. */
    checkIn: null,
    checkOut: null,
    /* Which of the three structures a hotel bed is bought on. Defaults to the
       first the owner priced, decided in the picker. */
    rateStructure: null,
    /* Nights, months or hours — whichever the chosen structure is bought in.
       Read off the dates for a nightly stay, asked for otherwise. */
    rateQuantity: null,
    consented: false,
  });

  /* Survives a reload and a return visit — see hooks/useVisitRequest.js. */
  const { request: visit, setRequest: setVisit, refresh: refreshVisit } = useVisitRequest(id);

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
  // would carry over and land past the end of a shorter one — with the
  // previous listing's lightbox still open over it. Also fires when the
  // selected sharing option changes, for the same reason: picking "2 BHK"
  // after "1 BHK" can swap in a shorter (or longer) per-option gallery, and
  // `shot` must not be left pointing past the end of it. Keyed on the
  // option's `label` rather than the object itself — `intent.sharing` is a
  // new reference every render, `label` is the one thing that's stable.
  useEffect(() => { setShot(0); setLightbox(false); }, [id, intent.sharing?.label]);

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

  // The selected sharing option's own photos, when it has any, take over
  // from the property's whole-gallery ones — "1 BHK" and "2 BHK" can show
  // different rooms. An option with none (or none selected yet) falls back
  // to the same property-level gallery every listing has always shown.
  const propertyImages = Array.isArray(item?.images) ? item.images : (item?.imageUrl ? [item.imageUrl] : []);
  const optionImages = Array.isArray(intent.sharing?.images) ? intent.sharing.images.filter(Boolean) : [];
  const images = optionImages.length ? optionImages : propertyImages;
  const shots = images.length;
  const amenities = Array.isArray(item?.amenities) ? item.amenities : [];
  // Normalised by the API from whichever key this category uses.
  const sharingOptions = Array.isArray(item?.sharingOptions) ? item.sharingOptions : [];
  const description = item?.description || item?.details?.description || item?.overview || item?.summary || item?.about;

  // Wraps, so the arrows never dead-end and there is no disabled state to
  // explain on a gallery of three photos.
  const go = step => setShot(i => (i + step + shots) % shots);

  const openShot = i => { setShot(i); setLightbox(true); };

  /* The lightbox owns the keyboard while it is up — Escape closes, arrows
     move — and parks the page scroll so the wheel pages photos' backdrop,
     not the listing underneath it. */
  useEffect(() => {
    if (!lightbox) return undefined;
    const onKey = e => {
      if (e.key === 'Escape') setLightbox(false);
      if (shots < 2) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
    // `go` closes over `shots`, so the listener is rebuilt with it.
  }, [lightbox, shots]); // eslint-disable-line react-hooks/exhaustive-deps

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
      <Region id="listing">
        <Box className="sec-inner">
          <Box className="exp-empty">
            <Text>Loading this listing…</Text>
          </Box>
        </Box>
      </Region>
    );
  }

  /* A broken connection and a listing that genuinely is not there look
     nothing alike to whoever has to fix it, so they are not merged. */
  if (error) {
    return (
      <Region id="listing">
        <Box className="sec-inner">
          <ConnectionError error={error} onRetry={() => load()} busy={loading} />
        </Box>
      </Region>
    );
  }

  if (!item) {
    return (
      <Region id="listing">
        <Box className="sec-inner">
          <Box className="exp-empty">
            <Icon name="search" className="exp-empty__ico" />
            <Heading level={3}>That listing is not on Lampose</Heading>
            <Text>It may have been taken down, or the link may be mistyped.</Text>
            <Link className="exp-more" to="/explore">Back to Explore</Link>
          </Box>
        </Box>
      </Region>
    );
  }

  /* ── The quote, and whether the button may light ──────────────────────
     Mirrors utils/stayIntent.js in the main backend, which stays the
     authority: it re-derives every figure when the request arrives and
     stores what it derives. This is a preview so the visitor sees the
     number before pressing, not a second source of truth. */
  const simple = item.simpleSharingPath === true;
  /* A hotel is asked for dates and a rate structure, not a stay length. */
  const nightly = item.category === 'HOTEL';
  const tokenRequired = item.visitToken?.required === true;
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
     just a dead end. Order matches the order they appear in the rail. */
  const missing = (() => {
    if (sharingOptions.length > 0 && !intent.sharing) {
      return nightly ? 'Pick a bed type to continue.' : 'Pick a room type to continue.';
    }

    /* Hotels: how they are charged, then when and how much of it. Which of
       the two the second question is depends on the first — nights come off a
       pair of dates, hours and months are asked for. */
    if (nightly) {
      if (!intent.checkIn) return 'Pick a check-in date.';
      const byNight = !intent.rateStructure || intent.rateStructure === 'nightly';
      if (byNight && !intent.checkOut) return 'Pick a check-out date.';
      if (!byNight && !intent.rateQuantity) {
        return intent.rateStructure === 'monthly' ? 'How many months?' : 'How many hours?';
      }
      if (!intent.consented) return 'Accept the Privacy Policy and Terms to continue.';
      return null;
    }

    /* A whole flat: the layout, and the tick. On paid categories the visit
       date is picked after the owner confirms and the ₹199 is paid — see
       VisitNextSteps. */
    if (simple) {
      if (!tokenRequired && !intent.joiningDate) return 'Pick a move-in date.';
      if (!intent.consented) return 'Accept the Privacy Policy and Terms to continue.';
      return null;
    }

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

     The rent is not a row here: it is the headline of the booking rail,
     where it updates into the live quote as the stay is chosen. The deposit
     appears in both places on purpose — under the price as a cost, here as
     a fact beside the others. */
  /*
   * ── No prices here, and no stay lengths ─────────────────────────────────
   *
   * Every figure this block used to carry — deposit, monthly rent, daily rate
   * — is already in the booking rail directly above, where the visitor is
   * actually deciding. Printing them again put the same number on screen
   * twice, and when the two disagreed the lower one was always the wrong one:
   * a nightly hotel listing showed "Minimum term: 1 Month+" beside a ₹450
   * daily rate, because the backend defaults those fields whether or not the
   * property sells that way.
   *
   * What is left is what the rail does NOT say: who the listing belongs to,
   * when it appeared, and the facts that decide whether the place suits
   * somebody at all.
   */
  const facts = [
    ['Owner / manager', item.ownerName || null],
    ['Listed', item.listedAt && new Date(item.listedAt).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
    })],
    /*
     * The category's own facts, curated and ordered — see `categoryFacts`.
     *
     * This replaced a verbatim dump of `categoryDetails`. That dump restated
     * the room chooser as unreadable maps, restated the price as "Rate type",
     * and published every field an onboarding form happened to add — including
     * `wardenContact`, which put a real phone number on a public page while
     * the owner's own number was deliberately withheld two lines above.
     */
    ...categoryFacts(item.category, item.details || {}),
  ].filter(([, v]) => v !== null && v !== undefined && v !== '');

  const tiles = images.slice(0, 5);

  const chips = (
    <Inline className="lst-mosaic__chips">
      <Inline className="exp-chip exp-chip--light">{labelForCategory(item.category)}</Inline>
      {/* Beds free, not stay type. The old chip read "Long Stay" on almost
          every listing because the backend defaults that field — the same
          word on every card is not information. This one changes as owners
          accept requests. */}
      <AvailabilityChip item={item} />
    </Inline>
  );

  /* What the rail quotes before anything is chosen: the headline rent, so
     the page never opens on a blank price. It hands over to the live quote
     the moment there is one. */
  const headlineRent = item.rent || rates.long?.monthlyPrice || null;

  return (
    <Region id="listing" className={`exp-card--${item.categorySlug}`}>
      <Box className="sec-inner">
        <Link className="lst-back" to="/explore">
          <Inline aria-hidden="true">←</Inline> All listings
        </Link>

        {/* ── Mosaic gallery ───────────────────────────────────────────
            Up to five photos at once, big one first, so the property reads
            at a glance instead of one photo hiding the rest. Any tile — or
            the count pill — opens the lightbox at that photo, where the
            arrows, keys, swipe and thumbnails live. */}
        <Masthead className="lst-top reveal">
          {shots > 0 ? (
            <Box className={`lst-mosaic lst-mosaic--${Math.min(shots, 5)}`}>
              {tiles.map((src, i) => (
                <PlainButton
                  key={src}
                  type="button"
                  className="lst-mosaic__ph"
                  onClick={() => openShot(i)}
                  aria-label={`Open photo ${i + 1} of ${shots}`}
                >
                  <Image
                    src={src}
                    alt={i === 0 ? item.name : ''}
                    loading={i === 0 ? 'eager' : 'lazy'}
                    decoding="async"
                    onError={e => { e.currentTarget.style.visibility = 'hidden'; }}
                  />
                </PlainButton>
              ))}
              {chips}
              {shots > 1 && (
                <PlainButton
                  type="button"
                  className="lst-mosaic__all"
                  onClick={() => openShot(0)}
                >
                  View all {shots} photos
                </PlainButton>
              )}
            </Box>
          ) : (
            <Box className="lst-mosaic lst-mosaic--0">
              {chips}
            </Box>
          )}

          <Box className="lst-head">
            <Heading level={1} className="lst-title">{item.name}</Heading>

            <Text className="lst-where">
              <Icon name="pin" className="exp-ico" />
              {item.place}
            </Text>

            <Box className="lst-scores">
              <Inline className="lst-kind">
                <Icon name={iconFor(item.category)} className="exp-ico" />
                {labelForCategory(item.category)}
              </Inline>
              {/* Only where the panel recorded it — hostels carry a type,
                  PGs have no gender field and get no badge rather than a
                  guessed one. */}
              {item.gender && (
                <Inline className="lst-kind">
                  <Icon name="users" className="exp-ico" />
                  {item.gender}
                </Inline>
              )}
              {amenities.length > 0 && (
                <Inline className="lst-kind">
                  <Icon name="verified" className="exp-ico" />
                  {amenities.length} facilities listed
                </Inline>
              )}
            </Box>
          </Box>
        </Masthead>

        {/* ── Body ─────────────────────────────────────────────────────
            Content on the left, the booking rail on the right. From 980px
            the rail sticks, so the price and the button follow the reader
            down the page; on a phone the columns stack and the rail comes
            after the facts, where the old inline flow sat. */}
        <Box className="lst-cols">
          <Box className="lst-main">
            {description && (
              <Region className="lst-block reveal">
                <Heading level={2} className="lst-h2">About this property</Heading>
                <Text className="lst-desc-body">
                  {description}
                </Text>
              </Region>
            )}

            {/* Meals, from the two fields the panel actually collects. No
                servings, timings or notes — those are not recorded, and a
                plausible-looking invention would be read as a promise. */}
            {item.meals && (
              <Region className="lst-block reveal">
                <Heading level={2} className="lst-h2">Meals</Heading>
                <Text className="lst-desc-body">
                  {item.meals.included
                    ? <>Food is <Strong>included in the rent</Strong>{item.meals.foodType ? <> — {item.meals.foodType}</> : null}.</>
                    : <>Meals are <Strong>not included</Strong> in the rent{item.meals.foodType ? <> ({item.meals.foodType} available)</> : null}.</>}
                </Text>
              </Region>
            )}

            {amenities.length > 0 && (
              <Region className="lst-block reveal">
                <Heading level={2} className="lst-h2">What is included</Heading>
                {/* Six is enough to judge a place by; the rest are one tap away
                    rather than a wall to scroll past. */}
                <List className="lst-amenities">
                  {(showAllAmenities ? amenities : amenities.slice(0, 6)).map(a => (
                    <ListItem key={a}>
                      <Icon name="verified" className="exp-ico" />
                      {a}
                    </ListItem>
                  ))}
                </List>
                {amenities.length > 6 && (
                  <PlainButton
                    className="xp-linkbtn lst-seeall"
                    onClick={() => setShowAllAmenities(v => !v)}
                  >
                    {showAllAmenities ? 'Show fewer' : `See all ${amenities.length}`}
                  </PlainButton>
                )}
              </Region>
            )}

            <Region className="lst-block reveal">
              <Heading level={2} className="lst-h2">Property details</Heading>
              <DescriptionList className="lst-facts">
                {facts.map(([k, v]) => (
                  <Box key={k}>
                    <DescriptionTerm className="exp-lbl">{k}</DescriptionTerm>
                    <DescriptionDetail>{v}</DescriptionDetail>
                  </Box>
                ))}
              </DescriptionList>

              {/* The city, locality and door number are deliberately not rows
                  above. A public page that prints an owner's exact address
                  invites people to turn up unannounced, so it is held back
                  until the owner has agreed to the visit. Saying so here —
                  where the address would have been — answers the question
                  the missing rows would otherwise raise. */}
              <Text className="lst-addr-note">
                <Icon name="pin" className="exp-ico" />
                <Inline>
                  The full address is shared on <Strong>WhatsApp</Strong> once your
                  visit is confirmed.
                </Inline>
              </Text>
            </Region>
          </Box>

          {/* ── Booking rail ───────────────────────────────────────────
              Price on top, the stay questions under it, one button. Once
              the owner has been asked, the whole flow is replaced by the
              status card: pressing again would only ring the same phone
              about the same room. The old record stays until a new one
              replaces it, so cancelling the dialog cannot lose the answer
              already on screen. */}
          <Aside className="lst-rail reveal">
            <Box className="lst-block lst-rail__card">
              {visit ? (
                <VisitStatus
                  request={visit}
                  onAskAgain={() => setAskOpen(true)}
                  /* The token panel changes the request server-side — paying,
                     then dating it — so the card has to re-read rather than
                     keep showing the state it was mounted with. */
                  onRefresh={refreshVisit}
                />
              ) : (
                <>
                  {/* The bar restates what was chosen and what it costs, so
                      nobody presses the button without seeing the number.
                      Before anything is chosen it shows the headline rent —
                      the number the visitor opened the page for. */}
                  <Box className="lst-rail__price">
                    {quote ? (
                      <>
                        <Strong>{rupees(quote.amount)}</Strong>
                        <Inline>{quote.unitLabel}</Inline>
                        {quote.durationLabel && <Emphasis>· {quote.durationLabel}</Emphasis>}
                      </>
                    ) : headlineRent ? (
                      <>
                        <Strong>{rupees(headlineRent)}</Strong>
                        <Inline>{item.pricePeriod || '/mo'}</Inline>
                      </>
                    ) : (
                      <Inline className="lst-rail__unpriced">Choose your stay to see the rate</Inline>
                    )}
                  </Box>
                  {item.deposit ? (
                    <Text className="lst-rail__dep">Deposit {rupees(item.deposit)}</Text>
                  ) : null}

                  <StayIntentPicker listing={item} value={intent} onChange={setIntent} />

                  {/* Consent, with the real pages behind it — both routes
                      exist on this site, so neither link is a placeholder.

                      Asked of every category. It used to be skipped on the
                      simple path, which meant a bachelor or co-live request
                      was sent with no record that the person agreed to
                      anything — the same request, the same data sharing, and
                      no consent behind it. */}
                  {true && (
                    <Label className="lst-consent">
                      <Input
                        type="checkbox"
                        checked={intent.consented === true}
                        onChange={e => setIntent(v => ({ ...v, consented: e.target.checked }))}
                      />
                      <Inline>
                        I accept the <Link to="/privacy">Privacy Policy</Link> and{' '}
                        <Link to="/terms">Terms and Conditions</Link>.
                      </Inline>
                    </Label>
                  )}

                  <PlainButton className="exp-book" disabled={!ready} onClick={() => setAskOpen(true)}>
                    Request a visit
                  </PlainButton>

                  {/* Pro-rated only where it is real: a long stay with a
                      monthly rate and a chosen date. */}
                  {quote?.prorated && !quote.prorated.full && (
                    <Text className="lst-prorate">
                      First month is pro-rated to <Strong>{rupees(quote.prorated.amount)}</Strong>
                      {' '}— {quote.prorated.daysCharged} of {quote.prorated.daysInMonth} days.
                    </Text>
                  )}

                  {!ready && missing && <Text className="lst-sharing__hint">{missing}</Text>}
                </>
              )}

              <Text className="lst-note">
                Listed through the Lampose onboarding panel. Nothing is paid through
                this site — arrange the visit with the owner directly.
              </Text>
            </Box>
          </Aside>
        </Box>

        {/* The heading has to describe what actually came back: a listing in a
            city of its own falls through to same-category matches elsewhere,
            and "More in Guntur" over three Bangalore rooms would be a lie. */}
        {related.length > 0 && (
          <Region className="lst-related">
            <Heading level={2} className="lst-h2">
              {related.every(l => l.city === item.city)
                ? `More in ${item.city}`
                : 'More like this'}
            </Heading>
            <Box className="exp-grid">
              {related.map((l, i) => <ListingCard key={l.id} item={l} index={i} />)}
            </Box>
          </Region>
        )}
      </Box>

      {/* ── Lightbox ─────────────────────────────────────────────────────
          The full gallery: arrows on desktop, swipe on touch, arrow keys
          from the window, thumbnails to jump. Clicking the backdrop closes;
          clicking the photo or the controls does not. */}
      {lightbox && shots > 0 && (
        <Box
          className="lst-lb"
          role="dialog"
          aria-modal="true"
          aria-label={`${item.name} photos`}
          onClick={() => setLightbox(false)}
        >
          <PlainButton
            type="button"
            className="lst-lb__close"
            onClick={e => { e.stopPropagation(); setLightbox(false); }}
            aria-label="Close photos"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6 L18 18 M18 6 L6 18" /></svg>
          </PlainButton>

          <Box
            className="lst-lb__stage"
            onClick={e => e.stopPropagation()}
            {...(shots > 1 ? swipe : {})}
          >
            <Image
              // Clamped rather than a bare `images[shot]`: the reset effect
              // above fires a render after `images` itself changes length
              // (a new sharing option picked), so there's one frame where
              // `shot` could still be pointing past the end of a shorter
              // gallery. This never reads past the array either way.
              src={images[Math.min(shot, Math.max(images.length - 1, 0))]}
              alt={item.name}
              decoding="async"
              onError={e => { e.currentTarget.style.visibility = 'hidden'; }}
            />

            {shots > 1 && (
              <>
                <PlainButton
                  className="lst-nav lst-nav--back"
                  onClick={() => go(-1)}
                  aria-label="Previous photo"
                >
                  <Chevron back />
                </PlainButton>
                <PlainButton
                  className="lst-nav lst-nav--next"
                  onClick={() => go(1)}
                  aria-label="Next photo"
                >
                  <Chevron />
                </PlainButton>

                <Inline className="lst-count" aria-live="polite">
                  {shot + 1} / {shots}
                </Inline>
              </>
            )}
          </Box>

          {shots > 1 && (
            <Box className="lst-shots" onClick={e => e.stopPropagation()}>
              {images.map((src, i) => (
                <PlainButton
                  key={src}
                  className={`lst-shot${i === shot ? ' is-active' : ''}`}
                  onClick={() => setShot(i)}
                  aria-label={`Photo ${i + 1} of ${shots}`}
                  aria-pressed={i === shot}
                >
                  <Image src={src} alt="" loading="lazy" decoding="async" />
                </PlainButton>
              ))}
            </Box>
          )}
        </Box>
      )}

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
        <Box className="exp-toast" role="status">
          <Icon name="verified" className="exp-ico" />
          {toast}
        </Box>
      )}
    </Region>
  );
}
