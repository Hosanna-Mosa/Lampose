/* ══════════════════════════════════════════════════════════════════════════
   Who could carry this order, nearest first.

   One question, one answer, no side effects. This file decides the shortlist;
   `foodDispatch.service.js` decides what to do with it. Keeping them apart is
   what makes the shortlist testable: it is a pure read of `app_drivers` and
   the same inputs always give the same list.

   ## Three rings, not one radius

   A single radius has to be either too small at 3pm (nobody within 2km, and
   the order fails while a rider sits at 2.5km) or too large at 8pm (the
   nearest of forty riders is picked from a 10km circle, and the first offer
   goes to somebody twenty minutes away). So the search widens in stages and
   stops at the first stage that finds anybody:

     1.  2 km   the ordinary case. A rider already in the neighbourhood.
     2.  5 km   thin coverage. Still a sane pickup time.
     3. 10 km   the last resort, and it is a real one: a 10km rider is a
                twenty-minute pickup on a scooter, which is worse than most
                orders want but much better than no rider at all.

   The widening stops as soon as a stage returns anybody, so the 10km ring is
   only ever read when the two inside it were empty.

   ## What disqualifies a rider, and why each one is here

     not approved      an administrator has not checked their licence.
     not online        they did not press the switch. Their choice.
     not available     they are already carrying something.
     stale position    the app has not reported in for five minutes — see
                       `driver.model.js`. Their coordinates are a memory, and
                       offering to a memory burns a fifteen-second timeout.
     wrong service     they have not opted into food work. An empty list means
                       "has not chosen", not "wants nothing" — a rider who
                       onboarded before the field existed must not be silently
                       excluded from every dispatch.
     already asked     `exclude` carries the riders this order has already been
                       offered to and who said no. Asking twice is how a rider
                       comes to believe declining does nothing.

   ## Distance is the gateway's, not ours

   `$geoNear` reports the metres it actually computed on the sphere. Nothing
   here recomputes a haversine afterwards: two distance calculations in one
   dispatch is two numbers that will eventually disagree, and the one shown to
   the rider would be the one nobody was checking.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const Driver = require('./driver.model');

const { LOCATION_MAX_AGE_MS } = Driver;

/** The rings, in metres, tried in order. See the header. */
const SEARCH_RINGS = [2000, 5000, 10000];

/**
 * How many riders one sweep will ever hold.
 *
 * The cascade offers them one at a time with a sixteen-second timeout, so
 * twelve candidates is over three minutes of offering — longer than any diner
 * will wait, and long enough that the thirteenth rider was never going to be
 * reached. Cutting the list here rather than at offer time also means the
 * `candidateCount` written on the order is the number that was actually
 * offerable, not a number nobody could have got to.
 */
const MAX_CANDIDATES = 12;

/**
 * The shortlist for one order.
 *
 * @param {object} input
 * @param {[number, number]} input.pickup [longitude, latitude] of the restaurant.
 * @param {string[]} [input.exclude] driverIds this order has already asked.
 * @param {string} [input.service] the kind of work. Only 'food' exists.
 * @returns {Promise<Array<{ driverId, distanceMeters, name, phone, vehicle }>>}
 *   Nearest first. Empty when nobody qualifies — which is a normal answer,
 *   not an error: at 4am it is the true one.
 */
const findCandidates = async ({ pickup, exclude = [], service = 'food' }) => {
  if (!Array.isArray(pickup) || pickup.length !== 2
    || !Number.isFinite(pickup[0]) || !Number.isFinite(pickup[1])) {
    /* No pin on the restaurant. Returning an empty list rather than throwing
       is deliberate: the caller's next move ("tell the diner we could not find
       a rider") is the same either way, and an order must not fail to save
       because a partner never dropped a pin. The dispatcher logs the reason. */
    return [];
  }

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

  if (exclude.length) predicate.driverId = { $nin: exclude };

  const near = { type: 'Point', coordinates: [Number(pickup[0]), Number(pickup[1])] };

  for (const radiusMeters of SEARCH_RINGS) {
    /* eslint-disable no-await-in-loop -- the rings are tried in order and a
       hit in the first one must not pay for the other two. Running them in
       parallel would triple the database work on the common case to save
       nothing, because the first ring answers almost every order. */
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
        { $limit: MAX_CANDIDATES },
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
    /* eslint-enable no-await-in-loop */

    if (rows.length) {
      return rows.map((row) => ({
        driverId: row.driverId,
        distanceMeters: Math.round(row.distanceMeters || 0),
        name: row.name || '',
        phone: row.phone || '',
        vehicle: row.vehicle || {},
        /* Which ring found them, for the log line. An order consistently
           filled from the 10km ring is a coverage problem, and it is invisible
           unless somebody records which ring answered. */
        foundWithinMeters: radiusMeters,
      }));
    }
  }

  return [];
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

module.exports = { findCandidates, dutyCount, SEARCH_RINGS, MAX_CANDIDATES };
