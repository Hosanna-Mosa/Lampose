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

/** [{ label, price|null }] for a property document. Never throws. */
const sharingOptionsFor = (doc) => {
  const details = (doc && doc.categoryDetails) || {};
  const prices = details.sharingPrices
    && typeof details.sharingPrices === 'object'
    && !Array.isArray(details.sharingPrices)
    ? details.sharingPrices
    : {};

  const key = OCCUPANCY_KEY[doc && doc.category];
  const labels = asList(key ? details[key] : (details.sharingTypes || details.roomTypes));

  /* A priced option the list forgot is still a real option — the two fields
     are filled in separately in the panel and do drift apart. */
  Object.keys(prices).forEach((label) => {
    if (!labels.includes(label)) labels.push(label);
  });

  return labels.map((label) => {
    const price = Number(prices[label]);
    return { label, price: Number.isFinite(price) && price > 0 ? price : null };
  });
};

/** The option matching a label, or null. Exact after trimming, case-insensitive. */
const findSharingOption = (doc, label) => {
  if (!label) return null;
  const wanted = String(label).trim().toLowerCase();
  return sharingOptionsFor(doc).find((o) => o.label.toLowerCase() === wanted) || null;
};

module.exports = { OCCUPANCY_KEY, sharingOptionsFor, findSharingOption };
