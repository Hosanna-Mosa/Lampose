/* ══════════════════════════════════════════════════════════════════════════
   Does this kitchen reach this door?

   ONE definition of the delivery-area question, because the feed and the
   checkout must not disagree about it. The feed says "we deliver to you" on
   the way in; the checkout disables an address on the way out. Two
   implementations of the same rule is two chances for a diner to be promised
   delivery on one screen and refused it on the next, after they have built a
   cart.

   ## The rule is the KITCHEN's own radius, not a drawn area

   `foodRestaurant.deliveryRadiusKm` is a real field its owner sets — the
   partner app's onboarding refuses to finish without one (`gates.ts`), the
   console shows it, and the dispatcher already reasons in radii. So the
   answer is a distance from the kitchen's pin to the door's pin, which needs
   no second collection and no administrator to keep drawing.

   This replaces the `zones` collection, which is gone. A zone was one shape
   covering every kitchen inside it; a radius is per-kitchen, which is
   strictly closer to the truth — two restaurants on the same street genuinely
   do deliver different distances.

   ## A radius of zero means UNSET, not "delivers nowhere"

   `deliveryRadiusKm` defaults to 0 and rows onboarded before it was asked for
   still carry that default. Reading 0 as a literal radius would make every
   one of those kitchens refuse every address in the country, silently, and
   the first symptom would be a checkout nobody can complete. So 0 is read as
   "this kitchen has not declared a limit" and reaches, which is exactly the
   behaviour of the product before any of this existed.

   ## A kitchen with no pin also reaches

   `location` is optional on the restaurant. Without one there is nothing to
   measure from, and refusing on a missing pin would punish the diner for a
   field the restaurant never filled in. Same reasoning, same answer.
   ══════════════════════════════════════════════════════════════════════════ */
const FoodRestaurant = require('../foodpartners/foodRestaurant.model');
const { LISTED } = require('./foodWeb.shape');

/**
 * Metres between two points, great-circle.
 *
 * Enough for "1.4 km to go" and enough for a delivery radius — the error
 * against a road distance is far larger than the error in the sphere.
 */
const haversineMeters = (lat1, lng1, lat2, lng2) => {
  const rad = (deg) => (deg * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2
    + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/* What the two callers below need off a kitchen, and nothing else. A `.select`
   string rather than the whole document, so neither of them accidentally
   starts reading a field this rule does not depend on. */
const REACH_FIELDS = 'restaurantId restaurantName location deliveryRadiusKm';

/**
 * Does this kitchen deliver to this point?
 *
 * @param {object} kitchen   a lean restaurant carrying `location` and
 *                           `deliveryRadiusKm` (see `REACH_FIELDS`).
 * @param {number} lat       the door's latitude.
 * @param {number} lng       the door's longitude.
 * @returns {boolean}        true also when the question cannot be asked — see
 *                           the two "unset" notes at the top of this file.
 */
const kitchenReaches = (kitchen, lat, lng) => {
  if (!kitchen) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;

  const radiusKm = Number(kitchen.deliveryRadiusKm);
  if (!Number.isFinite(radiusKm) || radiusKm <= 0) return true;

  /* Stored [LONGITUDE, LATITUDE], read back by index in that order and turned
     into named arguments immediately — the swap is the classic mistake here
     and it does not throw, it just puts the kitchen in the Arctic Ocean. */
  const pin = kitchen.location && kitchen.location.coordinates;
  if (!Array.isArray(pin) || pin.length !== 2) return true;

  return haversineMeters(lat, lng, pin[1], pin[0]) <= radiusKm * 1000;
};

/**
 * One kitchen, fetched with only the fields the rule reads.
 *
 * Returns null when the id names nothing listed, so a caller can tell "not
 * available" apart from "does not reach" — they are different sentences on
 * the checkout.
 *
 * @param {string} kitchenId
 * @returns {Promise<object|null>}
 */
const findKitchenForReach = async (kitchenId) => FoodRestaurant
  .findOne({ restaurantId: String(kitchenId || '').trim(), ...LISTED })
  .select(REACH_FIELDS)
  .lean();

/**
 * How many listed kitchens reach this point.
 *
 * A count rather than a boolean, because the feed says how many — "no kitchen
 * delivers to you yet" and "four kitchens deliver to you" are the two things
 * worth printing, and a boolean can only carry the first.
 *
 * Every listed kitchen is read and judged here rather than in a `$geoNear`,
 * because the radius is a property of each ROW and Mongo cannot compare a
 * computed distance against a per-document field in a `$near` — and the
 * projection is four fields over the kitchens on the feed, not a scan of
 * anything large.
 *
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<number>}
 */
const countKitchensReaching = async (lat, lng) => {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return 0;

  const kitchens = await FoodRestaurant.find(LISTED).select(REACH_FIELDS).lean();
  return kitchens.filter((kitchen) => kitchenReaches(kitchen, lat, lng)).length;
};

module.exports = {
  haversineMeters,
  kitchenReaches,
  findKitchenForReach,
  countKitchensReaching,
  REACH_FIELDS,
};
