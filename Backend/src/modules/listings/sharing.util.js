/* ══════════════════════════════════════════════════════════════════════════
   Room sharing (occupancy) options for a property.

   NOTE ON THE NAME: "sharing" here means how many people share a room —
   "Single", "2 Sharing", "Triple Sharing". It is the onboarding panel's own
   word for it. This file has nothing to do with share links or social
   sharing, and deliberately does not generate URLs: listing URLs are the
   frontend's business and already derived from the id there.

   The panel writes the choice under a different key per category, and as
   either a list or a comma-separated string:

     PG             categoryDetails.sharingTypes   ["Single","2 Sharing",…]
     Hostel         categoryDetails.roomTypes      ["Double Sharing",…]
     Dormitory      categoryDetails.bedType        "Bunk Bed Pod"
     Bachelor Room  categoryDetails.roomType       "1 BHK Independent"

   Newer rows also carry categoryDetails.sharingPrices — a map of label to
   monthly rent, e.g. {"Single":8000,"2 Sharing":5999}.

   Normalised here, in one place, because two callers need the same answer:
   utils/listingFormatter renders these as choices on the public site, and the
   visit-request controller validates the customer's pick against them. If
   they disagreed, a customer could request an option the page never offered.
   ══════════════════════════════════════════════════════════════════════════ */

const asList = (value) => {
  if (Array.isArray(value)) return value.map((x) => String(x).trim()).filter(Boolean);
  if (typeof value === 'string' && value.trim()) {
    return value.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
};

const OCCUPANCY_KEY = {
  PG: 'sharingTypes',
  Hostel: 'roomTypes',
  Dormitory: 'bedType',
  'Bachelor Room': 'roomType',
};

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

  const key = OCCUPANCY_KEY[doc && doc.category];
  const labels = asList(key ? details[key] : (details.sharingTypes || details.roomTypes));

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

    return {
      label,
      price: Number.isFinite(price) && price > 0 ? price : null,
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
  OCCUPANCY_KEY, occupancyOf, shareTypeIdFor, sharingOptionsFor, findSharingOption,
};
