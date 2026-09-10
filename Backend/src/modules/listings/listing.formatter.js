/* ══════════════════════════════════════════════════════════════════════════
   Turns a `properties` document into the shape lampose.com's Explore page
   reads.

   Kept in step with scripts/export-listings.js — the live API and the
   build-time snapshot must derive the same city from the same `place`, or the
   two disagree about what the city filter should contain.
   ══════════════════════════════════════════════════════════════════════════ */

const { sharingOptionsFor } = require('./sharing.util');
const {
  stayRatesFor, shortDayOptions, longMonthOptions, joinWindow,
} = require('./stayIntent.util');

/* The occupancy path a listing takes on the detail page. Bachelor Room prices
   by the bed rather than by stay length — the panel records no daily rate and
   no month ladder for it — so that page asks for sharing alone. Named here so
   the browser does not have to re-derive the rule. */
const {
  DEFAULT_CATEGORY, SIMPLE_PATH_CATEGORIES, paymentPurposeFor, normaliseCategory,
} = require('../../shared/constants/categories');
const config = require('../../config/env');

/* Cities we can name with confidence. `place` is free text from the panel and
   often has no comma, so a known name anywhere in the string beats splitting
   on punctuation and hoping. */
const KNOWN_CITIES = [
  'Visakhapatnam', 'Vizag', 'Vijayawada', 'Amaravati', 'Guntur', 'Tirupati',
  'Kakinada', 'Nellore', 'Kurnool', 'Hyderabad', 'Bangalore', 'Bengaluru',
  'Chennai', 'Mumbai', 'Pune', 'Delhi',
];

const CITY_ALIAS = { Vizag: 'Visakhapatnam', Bengaluru: 'Bangalore' };

/* A recognised name anywhere in the string wins; otherwise the tail after the
   last comma, or the whole string. It must never fall back to a fixed city —
   doing so filed every unrecognised place under Visakhapatnam, a city those
   listings had nothing to do with. */
const cityOf = (place) => {
  const text = String(place || '');
  const hit = KNOWN_CITIES.find((city) => new RegExp(`\\b${city}\\b`, 'i').test(text));
  if (hit) return CITY_ALIAS[hit] || hit;

  const parts = text.split(',').map((s) => s.trim()).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : text.trim();
};

const localityOf = (place, city) => {
  const text = String(place || '');
  if (!city) return text.trim();
  const stripped = text
    .replace(new RegExp(`,?\\s*\\b${city}\\b`, 'i'), '')
    .replace(/,\s*$/, '')
    .trim();
  return stripped || text.trim();
};

// Dormitories and pods are quoted nightly, and the panel says so two ways.
const isDaily = (doc) => (doc.categoryDetails && doc.categoryDetails.rateType === 'Daily Rate')
  || (doc.dailyPrice > 0 && !(doc.monthlyPrice > 0));

const slugify = (value) => String(value || 'stay')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

/**
 * The verified partner behind each property, by owner phone.
 *
 * One `$in` for a whole page rather than a lookup per row, and only over the
 * distinct numbers — an owner with twenty listings costs one entry. Keyed on
 * the last ten digits because `Property.ownerMobile` has been typed in by hand
 * for as long as the product has existed and holds "+91 8639139906",
 * "+919704726252" and undefined side by side, while `Partner.phoneDigits` is
 * clean.
 *
 * Only `phoneVerifiedAt` accounts count. An unverified row is somebody who
 * typed a number into a login screen, not somebody holding the handset — the
 * same bar `createStayRequest` applies before it will send them a student.
 *
 * Returns a Map of digits -> name. A property whose owner is not on Stay
 * Partner is simply absent, and `formatListing` falls back to the listing's
 * own text.
 */
const ownerNamesFor = async (docs) => {
  const digitsOf = (value) => String(value || '').replace(/\D/g, '').slice(-10);
  const wanted = [...new Set(docs.map((d) => digitsOf(d && d.ownerMobile)).filter(Boolean))];
  if (!wanted.length) return new Map();

  try {
    const Partner = require('../partners/partner.model');
    const rows = await Partner.find({ phoneDigits: { $in: wanted }, phoneVerifiedAt: { $ne: null } })
      .select('phoneDigits name fullName ownerName')
      .lean();

    const byDigits = new Map();
    for (const row of rows) {
      const name = String(row.name || row.fullName || row.ownerName || '').trim();
      if (name) byDigits.set(String(row.phoneDigits), name);
    }
    return byDigits;
  } catch (error) {
    /* A name that could not be resolved is not a listing that failed. The
       property's own text is served, exactly as before. */
    console.warn('[listings] could not resolve owner names:', error.message);
    return new Map();
  }
};

/**
 * @param {object} input               the property document
 * @param {string} [resolvedOwnerName] the verified partner's name, from
 *                                     `ownerNamesFor`. Optional: a caller that
 *                                     does not resolve one gets the old
 *                                     behaviour.
 */
const formatListing = (input, resolvedOwnerName = '') => {
  const doc = input && typeof input.toObject === 'function' ? input.toObject() : input;

  /* `images` is the gallery and `imageUrl` the single cover the older panel
     wrote; one card renders from whichever exists. */
  let images = Array.isArray(doc.images) ? doc.images.filter(Boolean) : [];
  if (images.length === 0 && doc.imageUrl) images = [doc.imageUrl];

  const place = String(doc.place || '');
  const city = cityOf(place);

  return {
    id: doc._id ? String(doc._id) : String(doc.id === undefined || doc.id === null ? '' : doc.id),
    name: doc.name,
    place: doc.place,
    city,
    locality: localityOf(place, city),
    category: normaliseCategory(doc.category) || DEFAULT_CATEGORY,
    categorySlug: slugify(doc.category),
    stayType: doc.stayType || 'Long Stay',
    longStayDuration: doc.longStayDuration || null,
    shortStayDuration: doc.shortStayDuration || null,
    rent: doc.rent || 0,
    pricePeriod: isDaily(doc) ? '/day' : '/mo',
    monthlyPrice: doc.monthlyPrice || null,
    dailyPrice: doc.dailyPrice || null,
    deposit: doc.deposit || null,
    /*
     * Who the student will actually meet.
     *
     * `doc.ownerName` is free text typed onto the property at onboarding, and
     * it goes stale the moment somebody else takes over the building — or was
     * simply never the account holder. Measured across the live collection, 41
     * of the 42 properties with a verified partner disagreed with that
     * partner's own name: the listing said "Sunand", the person who answers
     * the request and opens the door is "Venky".
     *
     * That name is not decoration. The app says "Waiting for Venky", "Venky
     * has your booking" and "Ask for Venky at the gate" — a student standing
     * at a door asking for the wrong person is the failure this prevents.
     *
     * So the VERIFIED partner's name wins where the caller resolved one (see
     * `ownerNamesFor`), and the property's own text is the fallback for a
     * listing whose owner is not on Stay Partner yet.
     */
    ownerName: resolvedOwnerName || doc.ownerName || 'Property Owner',
    ownerMobile: doc.ownerMobile || '',
    /*
     * NOT the street address.
     *
     * This projection is what `/api/v2/listings` serves to anybody, and it was
     * publishing the door number of every property on the platform. No client
     * ever rendered it — the Listing page has a comment explaining why it must
     * not — so it was a leak with no reader, which is the kind that survives
     * longest.
     *
     * `place` above is the area, which is what a map and a locality line need.
     * The full address is released with the visit token, by
     * visitPayment.controller.js, to the one person who paid for it.
     */
    addressAvailableAfterVisit: true,
    /* The Listing page renders an "About this property" section from this.
       It was absent from the projection, so that section had nothing to show
       however well the panel filled it in. */
    description: doc.description || '',
    amenities: Array.isArray(doc.amenities) ? doc.amenities : [],
    images,
    details: doc.categoryDetails || null,

    /* Verification, as the onboarding flow records it. `isVerified` is a
       boolean either way, but `verificationStatus` is left null when unset:
       a property nobody has looked at yet is unstated, not rejected, and the
       site has no honest badge for the difference otherwise. */
    isVerified: doc.isVerified === true,
    verificationStatus: doc.verificationStatus || null,

    /* Room sharing (occupancy) choices, normalised out of whichever key this
       category uses — see utils/sharing.js. The public site renders these as
       the chooser above "Request a visit", and the visit-request controller
       validates the customer's pick against the same list. Each option now
       also carries its own `images` (possibly empty) — the frontend falls
       back to the top-level `images` above when an option has none. */
    sharingOptions: sharingOptionsFor(doc),

    /* ── Visit-intent inputs ─────────────────────────────────────────────
       Everything the detail page needs to offer stay type, duration and a
       joining date, derived from fields the document already has. The same
       functions re-derive these when a request comes back, so the page can
       only offer what the server will accept. */
    stayRates: stayRatesFor(doc),
    durationOptions: {
      shortDays: shortDayOptions(doc),
      longMonths: longMonthOptions(doc),
    },
    joinWindow: joinWindow(),
    /* Bachelor Room asks for sharing only — no stay type, no duration. */
    simpleSharingPath: SIMPLE_PATH_CATEGORIES.includes(normaliseCategory(doc.category)),

    /*
     * Whether this property is paid for through Lampose, and what the money
     * buys.
     *
     * Exposed rather than inferred from `simpleSharingPath`. The two happened
     * to cover the same categories once, and a page that guessed one from the
     * other would start asking for money — or stop — the moment they diverged.
     * They have now: a hotel charges and takes the stay-length path.
     *
     * `purpose` is what a client should branch on:
     *
     *   assisted_visit   a fixed fee that buys a VIEWING. `amountPaise` is the
     *                    figure, so a button can name it before an order
     *                    exists.
     *   stay_booking     the stay total, which buys the STAY. `amountPaise` is
     *                    NULL here on purpose — the price depends on the dates
     *                    and the bed the guest has not chosen yet, and it is
     *                    computed and frozen when the request is made. A
     *                    number here would be a price for a stay nobody has
     *                    described.
     *
     * (The field keeps its old `visitToken` name so no client parsing breaks;
     * the ₹20 token itself is retired.)
     */
    visitToken: (() => {
      const purpose = paymentPurposeFor(doc.category);
      if (!purpose) return { required: false, purpose: null, amountPaise: null };
      return {
        required: true,
        purpose,
        amountPaise: purpose === 'assisted_visit'
          ? config.razorpay.assistedVisitAmountPaise
          : null,
      };
    })(),

    /* Meal facts, only where the panel recorded them. `foodIncluded` false is
       a real answer and is kept; absent stays absent, and the page shows no
       meal block at all rather than inventing servings or timings. */
    meals: (() => {
      const details = doc.categoryDetails || {};
      if (details.foodIncluded === undefined && !details.foodType) return null;
      return {
        included: details.foodIncluded === true,
        foodType: details.foodType || null,
      };
    })(),

    /* Only where it is genuinely recorded. A PG has no gender field, and
       guessing one would put a claim on the page the owner never made. */
    gender: (doc.categoryDetails && doc.categoryDetails.hostelType) || null,

    listedAt: doc.createdAt || doc.updatedAt || new Date().toISOString(),

    /* Deliberately NOT projected: `employeeEmail`. It is the panel staffer
       who onboarded the row, internal to Lampose, and of no use to a
       visitor — publishing it would put a colleague's address on a public
       page. */
  };
};

module.exports = {
  KNOWN_CITIES,
  CITY_ALIAS,
  cityOf,
  localityOf,
  isDaily,
  slugify,
  formatListing,
  ownerNamesFor,
};
