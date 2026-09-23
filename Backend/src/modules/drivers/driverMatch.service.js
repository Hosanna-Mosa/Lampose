/* ══════════════════════════════════════════════════════════════════════════
   Who could carry this order, within one radius.

   One question, one answer, no side effects. This file decides the
   shortlist; `foodDispatch.service.js` decides what to do with it. Keeping
   them apart is what makes the shortlist testable: it is a pure read of
   `app_drivers` and the same inputs always give the same list.

   ## One radius, not three rings

   This used to try 2km, then 5km, then 10km, stopping at the first ring with
   anybody in it — built for "give me the nearest one," which is what a
   sequential, one-at-a-time cascade needs. Dispatch no longer works that
   way: the business wants EVERY rider who could plausibly make it to the
   restaurant before the food is ready notified at once, not just the
   closest. "Plausibly make it in time" is a single radius — the kitchen's
   prep-time quote converted to a distance at the same planning speed the
   offer's own ETA uses — so there is exactly one ring to search, not three,
   and it is the caller's job to say how wide it is.

   ## What disqualifies a rider, and why each one is here

     not approved      an administrator has not checked their licence.
     not online        they did not press the switch. Their choice.
     not available     they are already carrying something.
     stale position    the app has not reported in for five minutes — see
                       `driver.model.js`. Their coordinates are a memory, and
                       offering to a memory is offering to nobody.
     wrong service     they have not opted into food work. An empty list means
                       "has not chosen", not "wants nothing" — a rider who
                       onboarded before the field existed must not be silently
                       excluded from every dispatch.
     already asked     `exclude` carries every rider this order has already
                       offered — a broadcast still must not offer the same
                       person twice, whether they declined, are still holding
                       an earlier offer, or already lost the job to somebody
                       else.

   ## Distance is the gateway's, not ours

   `$geoNear` reports the metres it actually computed on the sphere. Nothing
   here recomputes a haversine afterwards: two distance calculations in one
   dispatch is two numbers that will eventually disagree, and the one shown to
   the rider would be the one nobody was checking.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const Driver = require('./driver.model');
const { DRIVER_ID: REVIEW_DRIVER_ID } = require('../reviewAccounts/reviewAccounts.service');

const { LOCATION_MAX_AGE_MS } = Driver;

/**
 * How many riders one broadcast will ever notify.
 *
 * Not the cost-per-candidate ceiling `MAX_CANDIDATES` used to be — a
 * broadcast costs the same whether it reaches five riders or fifty. This is
 * a plain safety valve: a genuinely dense city inside a wide, 60-minute-quote
 * radius could otherwise return far more riders than any dispatcher should
 * wake up for one order, and forty is generous enough that it is not
 * expected to ever actually bind.
 */
const MAX_BROADCAST = 40;

/**
 * The shortlist for one order, within one radius.
 *
 * @param {object} input
 * @param {[number, number]} input.pickup [longitude, latitude] of the restaurant.
 * @param {number} input.radiusMeters how far out to look.
 * @param {string[]} [input.exclude] driverIds this order has already offered.
 * @param {string} [input.service] the kind of work. Only 'food' exists.
 * @returns {Promise<Array<{ driverId, distanceMeters, name, phone, vehicle }>>}
 *   Nearest first (the gateway sorts it that way regardless), empty when
 *   nobody qualifies — a normal answer, not an error: at 4am it is the true
 *   one.
 */
const findCandidatesWithinRadius = async ({
  pickup, radiusMeters, exclude = [], service = 'food',
}) => {
  if (!Array.isArray(pickup) || pickup.length !== 2
    || !Number.isFinite(pickup[0]) || !Number.isFinite(pickup[1])) {
    /* No pin on the restaurant. Returning an empty list rather than throwing
       is deliberate: the caller's next move ("tell the diner we could not find
       a rider") is the same either way, and an order must not fail to save
       because a partner never dropped a pin. The dispatcher logs the reason. */
    return [];
  }
  if (!Number.isFinite(radiusMeters) || radiusMeters <= 0) return [];
  if (mongoose.connection.readyState !== 1) return [];

  const freshSince = new Date(Date.now() - LOCATION_MAX_AGE_MS);

  const predicate = {
    status: 'approved',
    isOnline: true,
    isAvailable: true,
    locationUpdatedAt: { $gte: freshSince },
    /* `$in` with the empty array is what lets a pre-update rider through: it
       matches a document whose `services` is `['food']` AND one whose
       `services` is `[]`, because `$or` is spelled out rather than relying on
       an array-match rule that reads the other way. */
    $or: [
      { services: service },
      { services: { $size: 0 } },
      { services: { $exists: false } },
    ],
  };

  /* The Play review rider can go online but is never offered real work — see
     reviewAccounts.service.js. */
  predicate.driverId = { $nin: [...exclude, REVIEW_DRIVER_ID] };

  const near = { type: 'Point', coordinates: [Number(pickup[0]), Number(pickup[1])] };

  let rows = [];
  try {
    rows = await Driver.aggregate([
      {
        $geoNear: {
          near,
          /* Named explicitly. The stage picks the geo index for you only
             while there is exactly one on the collection, and starts
             guessing the day a second geometry is added. */
          key: 'currentLocation',
          distanceField: 'distanceMeters',
          maxDistance: radiusMeters,
          spherical: true,
          query: predicate,
        },
      },
      { $limit: MAX_BROADCAST },
      {
        $project: {
          _id: 0,
          driverId: 1,
          distanceMeters: 1,
          name: 1,
          phone: 1,
          vehicle: 1,
        },
      },
    ]);
  } catch (error) {
    /* `$geoNear` refuses to run at all without a 2dsphere index — "unable to
       find index for $geoNear query" — which is what a fresh database looks
       like before mongoose has finished building it. Reported once and
       answered as "nobody nearby", because that is the truth from the
       dispatcher's point of view and an order must not 500 over it. */
    console.error(`[dispatch] rider search failed at ${radiusMeters}m: ${error.message}`);
    return [];
  }

  return rows.map((row) => ({
    driverId: row.driverId,
    distanceMeters: Math.round(row.distanceMeters || 0),
    name: row.name || '',
    phone: row.phone || '',
    vehicle: row.vehicle || {},
  }));
};

/**
 * How many riders are online right now, and how many of those are free.
 *
 * Not used by dispatch — it is what the boot banner and the "no rider found"
 * log line print, so an operator reading "nobody took order LO123456" can tell
 * whether the answer was "nobody was working" or "eleven riders said no".
 * Those need completely different responses and the message alone cannot tell
 * them apart.
 */
const dutyCount = async () => {
  if (mongoose.connection.readyState !== 1) return { online: 0, available: 0 };
  const freshSince = new Date(Date.now() - LOCATION_MAX_AGE_MS);
  const [online, available] = await Promise.all([
    Driver.countDocuments({ status: 'approved', isOnline: true }),
    Driver.countDocuments({
      status: 'approved', isOnline: true, isAvailable: true, locationUpdatedAt: { $gte: freshSince },
    }),
  ]);
  return { online, available };
};

module.exports = { findCandidatesWithinRadius, dutyCount, MAX_BROADCAST };
