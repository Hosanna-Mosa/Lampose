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

/** The stored values. This array IS the schema enum. */
const CATEGORIES = ['PG_HOSTEL', 'BACHELOR', 'HOTEL', 'COLIVE'];

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
};

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
};

/**
 * Categories that price by the bed rather than by stay length.
 *
 * These skip the month-ladder and daily-rate path entirely: the panel records
 * neither for them, so the detail page asks for sharing alone. PG_HOSTEL is
 * absent because it is the one category that does carry a stay-length ladder.
 */
const SIMPLE_PATH_CATEGORIES = ['BACHELOR', 'COLIVE'];

/**
 * Categories where a confirmed visit is paid for before it completes.
 *
 * A whole-property let is a viewing somebody drives across a city for, and an
 * owner who has agreed to show it is holding it. A small token is what turns a
 * browse into an intent — and it is what the joining date and the street
 * address sit behind.
 *
 * PG_HOSTEL and HOTEL are absent on purpose: a bed in a shared room is a lower
 * commitment on both sides, and putting a payment in front of it would cost
 * more requests than it would filter.
 */
const TOKEN_CATEGORIES = ['BACHELOR', 'COLIVE'];

/** The category whose price is quoted per night rather than per day. */
const NIGHTLY_CATEGORIES = ['HOTEL'];

/** What an unset category falls back to — by far the most common kind. */
const DEFAULT_CATEGORY = 'PG_HOSTEL';

module.exports = {
  CATEGORIES,
  CATEGORY_LABEL,
  LEGACY_CATEGORY,
  OCCUPANCY_KEYS,
  SIMPLE_PATH_CATEGORIES,
  NIGHTLY_CATEGORIES,
  TOKEN_CATEGORIES,
  DEFAULT_CATEGORY,
  normaliseCategory,
  isCategory,
};
