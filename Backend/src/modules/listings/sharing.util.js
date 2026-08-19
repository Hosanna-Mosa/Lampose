/* ══════════════════════════════════════════════════════════════════════════
   Room sharing (occupancy) options for a property.

   NOTE ON THE NAME: "sharing" here means how many people share a room —
   "Single", "2 Sharing", "Triple Sharing". It is the onboarding panel's own
   word for it. This file has nothing to do with share links or social
   sharing, and deliberately does not generate URLs: listing URLs are the
   frontend's business and already derived from the id there.

   The panel writes the choice under a different key per category, and as
   either a list or a comma-separated string:

     PG_HOSTEL   categoryDetails.sharingTypes   ["Single","2 Sharing",…]
                 or categoryDetails.roomTypes    ["Double Sharing",…]
     HOTEL       categoryDetails.bedTypes        ["Single","4 Sharing"]
                 (older rows carry one `bedType` format string instead)
     BACHELOR    categoryDetails.roomTypes       ["1 RK","2 BHK"]
     COLIVE      categoryDetails.roomTypes       ["2 BHK","3 BHK"]
                 (older rows carry one `roomType` string instead)

   PG_HOSTEL has two keys because the category is a merge: rows onboarded as
   a PG wrote `sharingTypes` and rows onboarded as a hostel wrote `roomTypes`,
   and both spellings are live in the collection. First non-empty wins.

   Newer rows also carry categoryDetails.sharingPrices — a map of label to
   monthly rent, e.g. {"Single":8000,"2 Sharing":5999}.

   Normalised here, in one place, because two callers need the same answer:
   utils/listingFormatter renders these as choices on the public site, and the
   visit-request controller validates the customer's pick against them. If
   they disagreed, a customer could request an option the page never offered.
   ══════════════════════════════════════════════════════════════════════════ */

/** A positive number, or null. */
const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const asList = (value) => {
  if (Array.isArray(value)) return value.map((x) => String(x).trim()).filter(Boolean);
  if (typeof value === 'string' && value.trim()) {
    return value.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
};

const { OCCUPANCY_KEYS, normaliseCategory } = require('../../shared/constants/categories');

/**
 * How many people the label says share one room.
 *
 * Read out of the label itself because that is the only place it has ever
 * been recorded — the panel offers "Single", "2 Sharing", "Dorm Sharing" as
 * free-form checkboxes and stores the string. It is what lets the onboarding
 * form ask for ROOMS and work out beds, which is how an owner counts.
 *
 * Null where the label does not say — "Dorm Sharing", "1 BHK Independent".
 * A null is not a failure: it means the bed count has to be asked for
 * directly rather than multiplied out, and the form does exactly that.
 */
const occupancyOf = (label) => {
  const text = String(label || '').toLowerCase();
  if (/\bsingle\b/.test(text)) return 1;
  if (/\bdouble\b/.test(text)) return 2;
  if (/\btriple\b/.test(text)) return 3;
  if (/\bquad(ruple)?\b/.test(text)) return 4;
  const digits = text.match(/(\d+)\s*(sharing|share|bed|seater)/);
  if (digits) {
    const n = Number(digits[1]);
    return Number.isFinite(n) && n > 0 && n <= 50 ? n : null;
  }
  return null;
};

/**
 * A stable id for one property's one sharing option.
 *
 * `partner_share_types` rows are re-synced every time the property is saved,
 * so the row's `_id` is not a handle anything may keep. This is: it is derived
 * from the two things that identify the option, it survives a re-sync, and it
 * can be written onto a request without a lookup.
 *
 * The label is slugged rather than used raw because it reaches URLs and query
 * strings — "2 Sharing" becomes `2-sharing`.
 */
const shareTypeIdFor = (propertyId, label) => {
  const slug = String(label || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${String(propertyId)}:${slug}`;
};

/**
 * [{ label, price|null, rooms|null, totalBeds|null, shareTypeId }] for a
 * property document. Never throws.
 *
 * `totalBeds` is the CAPACITY the property was onboarded with, not what is
 * free today — that lives on the `partner_share_types` row and moves as beds
 * are taken and given back. The two are deliberately separate: capacity is a
 * fact about the building that only an owner changes, availability is a fact
 * about this afternoon.
 *
 * Null beds means nobody has recorded a count, which is a real and common
 * state for every property onboarded before the field existed. It is not
 * treated as zero anywhere — see `inventory.service.js` for why a property
 * with no count is refused rather than shown as full.
 */
const sharingOptionsFor = (doc) => {
  const details = (doc && doc.categoryDetails) || {};
  const asMap = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

  const prices = asMap(details.sharingPrices);
  const rooms = asMap(details.sharingRooms);
  const beds = asMap(details.sharingBeds);

  /* Normalised rather than looked up directly: this reads documents, and a
     document may predate the migration to category codes. */
  const keys = OCCUPANCY_KEYS[normaliseCategory(doc && doc.category)] || [];
  const fromCategory = keys.map((key) => details[key]).find((v) => asList(v).length);
  const labels = asList(
    fromCategory !== undefined
      ? fromCategory
      : (details.sharingTypes || details.roomTypes || details.roomType
        || details.bedTypes || details.bedType),
  );

  /* A priced option the list forgot is still a real option — the two fields
     are filled in separately in the panel and do drift apart. */
  Object.keys(prices).forEach((label) => {
    if (!labels.includes(label)) labels.push(label);
  });

  const propertyId = doc && (doc._id || doc.id);

  return labels.map((label) => {
    const price = Number(prices[label]);
    const roomCount = Number(rooms[label]);
    const occupancy = occupancyOf(label);

    /* An explicit bed count wins over one multiplied out of rooms. The form
       writes both where it can, and only the explicit number where the label
       does not say how many share a room. */
    const stated = Number(beds[label]);
    const derived = Number.isFinite(roomCount) && roomCount > 0 && occupancy
      ? roomCount * occupancy
      : null;
    const totalBeds = Number.isFinite(stated) && stated > 0 ? stated : derived;

    /*
     * The three ways a hotel bed is sold, when it is sold more than one way.
     *
     * Offered so the page can show only the structures this owner actually
     * priced — a "per month" button on a bed with no monthly rate is a dead
     * choice, and letting it be picked would send a request the pricing has no
     * answer for. Null for every other category, which sells one way.
     */
    const rates = {
      nightly: num(prices[label]),
      monthly: num((details.monthlyPrices || {})[label]),
      flexible: num((details.flexiblePrices || {})[label]),
    };
    const acRates = {
      nightly: num((details.sharingAcPrices || {})[label]),
      monthly: num((details.monthlyAcPrices || {})[label]),
      flexible: num((details.flexibleAcPrices || {})[label]),
    };

    return {
      label,
      price: Number.isFinite(price) && price > 0 ? price : null,
      rates,
      acRates,
      rooms: Number.isFinite(roomCount) && roomCount > 0 ? roomCount : null,
      occupancy,
      totalBeds: Number.isFinite(totalBeds) && totalBeds > 0 ? totalBeds : null,
      shareTypeId: propertyId ? shareTypeIdFor(propertyId, label) : null,
    };
  });
};

/** The option matching a label, or null. Exact after trimming, case-insensitive. */
const findSharingOption = (doc, label) => {
  if (!label) return null;
  const wanted = String(label).trim().toLowerCase();
  return sharingOptionsFor(doc).find((o) => o.label.toLowerCase() === wanted) || null;
};

module.exports = {
  OCCUPANCY_KEYS, occupancyOf, shareTypeIdFor, sharingOptionsFor, findSharingOption,
};
