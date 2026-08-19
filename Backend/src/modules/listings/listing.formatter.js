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
  DEFAULT_CATEGORY, SIMPLE_PATH_CATEGORIES, TOKEN_CATEGORIES, normaliseCategory,
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

const formatListing = (input) => {
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
    ownerName: doc.ownerName || 'Property Owner',
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
       validates the customer's pick against the same list. */
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
     * Whether a confirmed visit here is paid for.
     *
     * Exposed rather than inferred from `simpleSharingPath`. The two happen to
     * cover the same categories today, and a page that guessed one from the
     * other would start asking for money — or stop — the moment they diverge.
     * The amount travels so a button can name the figure instead of hardcoding
     * a number that lives in the server's config.
     */
    visitToken: TOKEN_CATEGORIES.includes(normaliseCategory(doc.category))
      ? { required: true, amountPaise: config.razorpay.tokenAmountPaise }
      : { required: false, amountPaise: null },

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
};
