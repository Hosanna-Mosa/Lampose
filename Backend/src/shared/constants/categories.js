/* ══════════════════════════════════════════════════════════════════════════
   The property categories, defined once.

   ## What changed, and why the values are codes now

   The collection used to store four display strings — 'PG', 'Hostel',
   'Dormitory', 'Bachelor Room' — and every surface that showed them agreed by
   coincidence rather than by construction. There were five copies of the list
   (the schema enum, two controller allow-lists, the sharing key map and the
   frontend order), and they had already drifted: the mobile app merged PG and
   Hostel into one tab and mapped Dormitory onto a category the database did
   not have.

   So the four the app already used became the four that exist, and they are
   stored as CODES rather than labels. A code is a stable identity: renaming
   'Hotels' to 'Hotel' on a screen is now a one-line change here, not a
   migration. Every label a person reads comes from `CATEGORY_LABEL` or from
   the equivalent table in each frontend.

   ## The merge, and what it cost

   PG and Hostel are one category. Students use the words interchangeably and
   the facts that decide a stay — meals, sharing, gate timing — are the same
   for both. The merged form asks the union of what the two asked, so the rows
   that were hostels keep their warden contact and study room and the rows
   that were PGs keep their meal timings.

   Dormitory became HOTEL rather than folding into PG_HOSTEL, because that is
   what it already behaved like: it is the only category priced by the night,
   and the app has been rendering it as "By the night" for as long as the
   adapter has existed.

   ## Reading old values

   `normaliseCategory` maps every historical spelling onto a code. It exists
   because a migration is a moment and data outlives it: a document written by
   a deployment that has not restarted yet, a fixture, a query string from a
   bookmarked link. Anything unrecognised comes back as null rather than
   guessing, and callers decide what an unknown category means for them.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The stored values. This array IS the schema enum.
 *
 * COMMERCIAL is the odd one and is meant to be: it is not somewhere anybody
 * sleeps. It is here because the same field agents walking a street to onboard
 * a PG are the ones being offered the shop two doors down, and making them
 * file that as a "Bachelor" to get it into the system is how a category list
 * stops meaning anything. What it costs is that every surface which assumed
 * "a listing is a stay" now has one value it must decline rather than render
 * — see `STAY_CATEGORIES`.
 */
const CATEGORIES = ['PG_HOSTEL', 'BACHELOR', 'HOTEL', 'COLIVE', 'COMMERCIAL'];

/**
 * The subset a person can actually live in.
 *
 * The student app browses stays, and its feed asks for a category by name on
 * every tab — except when no tab is chosen yet, where asking for nothing means
 * asking for everything. Before COMMERCIAL that was harmless, because
 * everything WAS a stay. It is not any more, so anything serving the stay side
 * of the product filters on this rather than on `CATEGORIES`.
 */
const STAY_CATEGORIES = ['PG_HOSTEL', 'BACHELOR', 'HOTEL', 'COLIVE'];

/**
 * What a person sees. The only place the backend spells them out.
 *
 * Frontends keep their own copies of this table rather than fetching it —
 * a label is presentation, and each surface has its own room for one. What
 * they must not keep their own copy of is the code.
 */
const CATEGORY_LABEL = {
  PG_HOSTEL: 'PG / Hostel',
  BACHELOR: 'Bachelor',
  HOTEL: 'Hotels',
  COLIVE: 'House / Co-live',
  COMMERCIAL: 'Shop / Commercial',
};

/**
 * Every value that has ever meant one of these, lowercased.
 *
 * Includes the codes themselves so `normaliseCategory` is idempotent — it is
 * called on data that may already have been migrated, and running it twice
 * must not turn a code into null.
 */
const LEGACY_CATEGORY = {
  pg: 'PG_HOSTEL',
  hostel: 'PG_HOSTEL',
  'pg/hostel': 'PG_HOSTEL',
  'pg / hostel': 'PG_HOSTEL',
  pg_hostel: 'PG_HOSTEL',

  'bachelor room': 'BACHELOR',
  'bachelor rooms': 'BACHELOR',
  bachelor: 'BACHELOR',

  /* Dormitory is the only category that was priced by the night, which is
     what the new one means. */
  dormitory: 'HOTEL',
  hotel: 'HOTEL',
  hotels: 'HOTEL',

  colive: 'COLIVE',
  'co-live': 'COLIVE',
  'house/co-live': 'COLIVE',
  'house / co-live': 'COLIVE',

  /* No legacy spellings to carry — nothing was ever stored under any of these.
     They are here because `normaliseCategory` is what every query string,
     fixture and admin filter goes through, and a category that only answers to
     its own code is one that fails the first time somebody types the words. */
  commercial: 'COMMERCIAL',
  shop: 'COMMERCIAL',
  'shop/commercial': 'COMMERCIAL',
  'shop / commercial': 'COMMERCIAL',
  'commercial space': 'COMMERCIAL',
};

/**
 * Every raw spelling that means this code — the inverse of `LEGACY_CATEGORY`.
 *
 * The `properties` collection was never migrated, and it shows: PG, Hostel and
 * PG_HOSTEL are all live spellings of ONE category, as are BACHELOR and
 * "Bachelor Room", and HOTEL and Dormitory. Anything that queries or groups by
 * the stored value without this gets a bucket per spelling — which is exactly
 * why the console's "Property mix" reports eight categories when there are
 * four.
 *
 * So a query for one category is a query for a SET of strings, and this is the
 * only place that set is derived. Building it from `LEGACY_CATEGORY` rather
 * than listing it by hand means a spelling added there is understood by every
 * query for free.
 */
const rawValuesFor = (code) => Object.entries(LEGACY_CATEGORY)
  .filter(([, mapped]) => mapped === code)
  .map(([raw]) => raw);

/** Regex-safe. Stored spellings contain "/" and "-", and one day will
    contain something worse. */
const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A case-insensitive matcher for one category, for a Mongo query.
 *
 * `$in` on the lowercase list alone would miss "Hostel" and "Bachelor Room",
 * which is how they are actually stored. Anchored, case-insensitive regexes
 * mean no call site has to guess at the casing in the collection.
 */
const categoryQuery = (code) => ({
  $in: rawValuesFor(code).map((raw) => new RegExp(`^${escapeRegExp(raw)}$`, 'i')),
});

/** A code for anything that has ever named one of these, or null. */
const normaliseCategory = (value) => {
  const key = String(value === undefined || value === null ? '' : value).trim().toLowerCase();
  if (!key) return null;
  return LEGACY_CATEGORY[key] || null;
};

/** True for a stored value this version of the code understands. */
const isCategory = (value) => CATEGORIES.includes(value);

/**
 * Where the onboarding panel records the occupancy choice, per category.
 *
 * Different per category because the panel asked a different question for
 * each, and the answers are in the collection under those names. PG_HOSTEL
 * has two: the merge joined a category that wrote `sharingTypes` to one that
 * wrote `roomTypes`, and both spellings are live in rows nobody is going to
 * rewrite. Read in order, first non-empty wins.
 *
 * See sharing.util.js, which is the only file that should use this.
 */
const OCCUPANCY_KEYS = {
  PG_HOSTEL: ['sharingTypes', 'roomTypes'],
  /* Two again, and for the same reason as PG_HOSTEL: the onboarding form now
     offers layouts as a multi-select writing `roomTypes`, where it used to
     offer one and write `roomType`. Rows of both shapes are live. */
  BACHELOR: ['roomTypes', 'roomType'],
  /* `bedTypes` is the occupancy multi-select — Single, Double, 3 Sharing,
     4 Sharing — each priced in `sharingPrices`. The singular `bedType` is a
     different question (the physical bed format: a bunk, a pod) that older
     rows used as their only occupancy answer, so it stays as the fallback. */
  HOTEL: ['bedTypes', 'bedType'],
  /* Co-live is let as a whole property, like Bachelor, and records the same
     layouts rather than a sharing ladder. */
  COLIVE: ['roomTypes', 'roomType'],
  /* COMMERCIAL is absent, and has to stay absent. Occupancy is a question
     about how many people share a room, and a shop has no answer to it — not
     "one", which is what any placeholder key here would end up asserting.
     `occupancyOf` reads `OCCUPANCY_KEYS[code] || []`, so an absent entry
     already means "this category has no occupancy", which is the truth. */
};

/**
 * Categories that price by the bed rather than by stay length.
 *
 * These skip the month-ladder and daily-rate path entirely: the panel records
 * neither for them, so the detail page asks for sharing alone. PG_HOSTEL is
 * absent because it is the one category that does carry a stay-length ladder.
 *
 * COMMERCIAL is here for the half of that sentence that applies: it has no
 * ladder and no nightly rate, just a monthly rent. The sharing half does not
 * apply to it at all, which costs nothing — the flag only reaches the student
 * app's detail page, and a shop never appears there. See `STAY_CATEGORIES`.
 */
const SIMPLE_PATH_CATEGORIES = ['BACHELOR', 'COLIVE', 'COMMERCIAL'];

/**
 * Categories where a confirmed visit is paid for before it completes.
 *
 * A whole-property let is a viewing somebody drives across a city for, and an
 * owner who has agreed to show it is holding it. A small token is what turns a
 * browse into an intent — and it is what the joining date and the street
 * address sit behind.
 *
 * PG_HOSTEL is absent on purpose: a bed in a shared room is a lower commitment
 * on both sides, and putting a payment in front of it would cost more requests
 * than it would filter.
 *
 * COLIVE is absent for the SAME reason, as of 9 September 2026. It charged the
 * ₹199 assisted-visit fee until then, on the reasoning that a whole-property
 * let is a viewing somebody drives across a city for. That was overruled as a
 * business decision: co-living is free to enquire about, exactly like PG.
 *
 * Nothing else about the category moved. It keeps its simple detail path and
 * its room-type occupancy — see `SIMPLE_PATH_CATEGORIES` and `OCCUPANCY_KEYS`
 * — because those describe how a co-live listing is SHAPED, not what it costs.
 *
 * HOTEL is absent for a different reason again, and the difference is the
 * whole point of `PREPAID_CATEGORIES` below — a hotel IS paid for, but not for
 * a viewing.
 *
 * Requests already created keep whatever `payment.purpose` was frozen onto
 * them, so a co-live visitor who paid ₹199 yesterday still has a paid request
 * and a slot to pick. This changes what NEW requests are asked for.
 *
 * COMMERCIAL is absent from this and from `PREPAID_CATEGORIES`, so it charges
 * nothing of either kind. A shop is let after a negotiation between two
 * businesses, not booked; there is no viewing to hold with a token and no
 * stay total to take up front. Onboarding records the premises and the rent,
 * and the conversation happens off-platform.
 */
const TOKEN_CATEGORIES = ['BACHELOR'];

/**
 * Categories paid for IN FULL, up front, as the booking itself.
 *
 * Nobody views a hotel room before taking it. There is no representative to
 * send, no viewing to schedule and nothing for a token to hold — the guest
 * picks dates, the owner confirms the room is free, and then they pay for the
 * stay. The payment is not a filter in front of a visit; it IS the booking.
 *
 * So the amount is the stay total the server already computes and validates in
 * `stayIntent.util.js` — rate × nights, months or hours — snapshotted onto the
 * request at creation. It is deliberately NOT `assistedVisitAmountPaise`,
 * which is a fixed platform fee and has nothing to say about what a room
 * costs.
 */
const PREPAID_CATEGORIES = ['HOTEL'];

/**
 * WHY this category charges, or null when it does not.
 *
 * The two payment kinds share one subdocument, one Razorpay integration and
 * one webhook, and they must not share a meaning. They differ in every way
 * that matters downstream:
 *
 *   assisted_visit   a fixed platform fee (₹199), explained as a two-line
 *                    split, which buys a VIEWING — so paying it opens the slot
 *                    picker and the address is released with the slot
 *   stay_booking     the stay total, which buys the STAY — so paying it
 *                    finishes the booking, and there is no slot to pick
 *
 * Reading this rather than testing category membership at each call site is
 * what stops a hotel being chased for a visit slot it never needed, or being
 * charged ₹199 because a fallback reached for the assisted price.
 *
 * Frozen onto the request at creation (`payment.purpose`): re-deriving it from
 * a live listing would let an edited category reprice a request somebody has
 * already paid.
 */
const paymentPurposeFor = (category) => {
  const normalised = normaliseCategory(category);
  if (TOKEN_CATEGORIES.includes(normalised)) return 'assisted_visit';
  if (PREPAID_CATEGORIES.includes(normalised)) return 'stay_booking';
  return null;
};

/** Does this category take money through Lampose at all, of either kind? */
const chargesUpFront = (category) => paymentPurposeFor(category) !== null;

/** The category whose price is quoted per night rather than per day. */
const NIGHTLY_CATEGORIES = ['HOTEL'];

/** What an unset category falls back to — by far the most common kind. */
const DEFAULT_CATEGORY = 'PG_HOSTEL';

module.exports = {
  CATEGORIES,
  STAY_CATEGORIES,
  CATEGORY_LABEL,
  LEGACY_CATEGORY,
  OCCUPANCY_KEYS,
  SIMPLE_PATH_CATEGORIES,
  NIGHTLY_CATEGORIES,
  TOKEN_CATEGORIES,
  PREPAID_CATEGORIES,
  paymentPurposeFor,
  chargesUpFront,
  rawValuesFor,
  categoryQuery,
  DEFAULT_CATEGORY,
  normaliseCategory,
  isCategory,
};
