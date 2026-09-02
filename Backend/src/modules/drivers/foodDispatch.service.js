/* ══════════════════════════════════════════════════════════════════════════
   Finding a rider for one order, one rider at a time.

   This is the piece the whole delivery flow turns on:

     the diner pays  →  START HERE  →  a rider accepts  →  three apps update

   ## One at a time, nearest first — not a broadcast

   The obvious design is to shout the order at every rider nearby and let the
   fastest tap win. It is also the wrong one, and both of its failures are
   worse than they look:

     · Every rider but one is interrupted for nothing. Do that forty times a
       shift and riders stop looking at offers, which is the failure that
       cannot be undone by fixing the code later.
     · The winner is whoever tapped fastest, not whoever is nearest. A rider
       4km away with a fast thumb beats one outside the door, and the diner
       waits an extra fifteen minutes for a race they did not know they
       entered.

   So the shortlist is sorted by distance and offered in order: rider one gets
   fifteen seconds alone, then rider two, and so on. The cost is that a
   shortlist of eight takes two minutes to exhaust; the benefit is that the
   nearest rider who wants the job always gets it.

   ## Fifteen seconds, plus one

   `OFFER_MS` is 16000 against a 15-second countdown in the app. The extra
   second is the round trip: a rider who taps Accept on the last tick has to
   have their request arrive before the server has already moved on, or the
   app says "accepted" and the server says "too late" — which is the single
   most infuriating bug a rider app can have.

   ## The timer is an optimisation. The database is the truth.

   Sessions live in a `Map` in this process, and that map is NOT what makes
   dispatch correct:

     · Accepting is one atomic `findOneAndUpdate` whose filter requires the
       order to still be searching and still have no rider. Two riders tapping
       at once means one wins and the other is told the job is gone, with or
       without a session in memory.
     · The live offer is also written to the order document, so
       `currentOfferFor()` — the poll the Driver app falls back on when its
       socket is down — reads the database rather than this map.

   What the map buys is the cascade: without it, a rider who ignores an offer
   would hold it until something else happened. A restart therefore loses the
   cascade timers, not the orders — `sweepStalledDispatch()` is the backstop
   that picks those up, and it is why that function exists.

   ## Single process, and honestly so

   The map is per-process. Run two instances behind a load balancer and each
   would run its own cascade for orders it created — offering the same order
   to two riders in parallel. The atomic accept means only one can win, so
   this is a wasted offer rather than a double assignment, but it is still
   wrong. Moving the sessions into Redis is the fix, and it is deliberately
   not done here: this backend runs as one process today (see
   `deploy/VPS.md`), and a distributed lock nobody needs yet is a distributed
   lock nobody is testing.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const FoodOrder = require('../foodpartners/foodOrder.model');
const FoodRestaurant = require('../foodpartners/foodRestaurant.model');
const Driver = require('./driver.model');
const { findCandidates, dutyCount } = require('./driverMatch.service');
const realtime = require('../../infrastructure/realtime/realtime');
const notifier = require('./dispatch.notifier');

const { riderView } = FoodOrder;

const BADGE = '🛵 [dispatch]';

/** The rider's countdown, and the one extra second. See the header. */
const OFFER_SECONDS = 15;
const OFFER_MS = (OFFER_SECONDS + 1) * 1000;

/**
 * How many full sweeps one order gets.
 *
 * A sweep that finds nobody is retried when the kitchen marks the order ready
 * — by which time up to twenty minutes have passed and the riders on the road
 * are different people. Three is enough to cover "everybody was busy at 8pm"
 * and few enough that an order in a city with no riders stops asking rather
 * than looping until somebody notices.
 */
const MAX_SWEEPS = 3;

/**
 * What the rider is paid.
 *
 * A flat share of the delivery fee the diner was charged, floored so a
 * free-delivery order is not a free trip — the promotion is ours, not the
 * rider's. Deliberately not an environment variable: a rate a deployment can
 * change silently is a rate that gets changed silently, and it settles onto
 * each order (`delivery.earnings`) at assignment time so a later change cannot
 * rewrite what an old job paid.
 */
const RIDER_SHARE = 0.8;
const RIDER_MINIMUM = 25;

const riderEarningsFor = (order) => Math.max(
  RIDER_MINIMUM,
  Math.round((Number(order.deliveryFee) || 0) * RIDER_SHARE),
);

/* orderNumber -> { timer, driverId, candidates, index } */
const sessions = new Map();

const clearSession = (orderNumber) => {
  const session = sessions.get(orderNumber);
  if (session && session.timer) clearTimeout(session.timer);
  sessions.delete(orderNumber);
};

/* ── What a party is told ─────────────────────────────────────────────────
   One payload builder per audience, so a field added for the diner cannot
   accidentally reach the rider. `toOrderParties` fans out to whichever of the
   three are connected. */

const dispatchUpdate = (order, extra = {}) => ({
  orderNumber: order.orderNumber,
  status: order.status,
  dispatchState: order.dispatch ? order.dispatch.state : 'idle',
  paymentStatus: order.paymentStatus,
  rider: order.delivery && order.delivery.driverId
    ? {
      name: order.delivery.driverName,
      phone: order.delivery.driverPhone,
      vehicle: order.delivery.vehicle,
      assignedAt: order.delivery.assignedAt,
    }
    : null,
  ...extra,
});

/**
 * Is this order something a rider should be sent for at all?
 *
 * Four refusals, and each one is a real order that must NOT go out:
 *   · a pickup order — nobody is carrying it
 *   · an online order that has not been paid — no rider is sent for food
 *     nobody has paid for, which is also why `payment/verify` is what starts
 *     the search rather than `POST /orders`
 *   · a rejected or cancelled order
 *   · an order that already has a rider
 */
const eligibleForDispatch = (order) => {
  if (!order) return 'the order no longer exists';
  if (order.fulfilment === 'pickup') return 'it is a counter pickup';
  if (order.paymentMode === 'online' && order.paymentStatus !== 'paid') return 'it has not been paid for';
  if (['rejected', 'cancelled', 'delivered'].includes(order.status)) return `it is ${order.status}`;
  if (order.delivery && order.delivery.driverId) return 'it already has a rider';
  return null;
};

/**
 * Where the rider is being sent from.
 *
 * Snapshotted onto the order at placement, but read back through the
 * restaurant when it is missing — an order placed before this field existed,
 * or one whose partner dropped their pin after the order came in. Falling back
 * rather than failing is what stops those orders being undeliverable forever.
 */
const pickupPointOf = async (order) => {
  if (order.pickupLocation && Array.isArray(order.pickupLocation.coordinates)) {
    return order.pickupLocation.coordinates;
  }
  const restaurant = await FoodRestaurant.findOne({ restaurantId: order.restaurantId })
    .select('location').lean();
  const pair = restaurant && restaurant.location && restaurant.location.coordinates;
  return Array.isArray(pair) && pair.length === 2 ? pair : null;
};

/* ── Starting a search ────────────────────────────────────────────────────*/

/**
 * Begin looking for a rider.
 *
 * Called from three places, all of which mean "this order is now ready to be
 * carried": a cash order being placed, an online order's payment verifying,
 * and the kitchen marking a previously unassigned order ready.
 *
 * Resolves to a small report rather than throwing. Every caller is midway
 * through a request that has already succeeded — the order IS placed, the
 * payment IS verified — and a dispatcher that threw would undo a write that
 * was correct. So a failure here is a logged reason and an order in the
 * `unassigned` state, which is a state the product knows how to show.
 */
async function startDispatch(orderNumber, { reason = 'placed' } = {}) {
  const number = String(orderNumber || '').trim().toUpperCase();
  if (!number) return { started: false, reason: 'no order number' };

  try {
    const order = await FoodOrder.findOne({ orderNumber: number });
    const refusal = eligibleForDispatch(order);
    if (refusal) {
      console.log(`${BADGE} ${number} not dispatched — ${refusal}`);
      return { started: false, reason: refusal };
    }

    if (order.dispatch.attempts >= MAX_SWEEPS) {
      /* The end of the road, and it is SAID rather than logged and forgotten.
         Without this the order sits at `unassigned` with the diner's last
         message being "we are still looking" — which stops being true here and
         stays on their screen for ever. The wording changes to name a person,
         because at this point a person is what it needs. */
      const why = `no rider could be found after ${MAX_SWEEPS} attempts — our team has been alerted`;
      order.dispatch.failureReason = why;
      await order.save();

      console.error(
        `${BADGE} ⚠ ${number} has used all ${MAX_SWEEPS} sweeps and still has no rider. `
        + `Customer ${order.customerPhone || 'unknown'} is waiting; somebody needs to call them `
        + 'or the restaurant.',
      );
      realtime.toOrderParties(order, 'dispatch_update', dispatchUpdate(order, { failureReason: why }));
      return { started: false, reason: 'sweep limit reached' };
    }

    /* A search already running for this order is left alone. Two cascades on
       one order would offer it to two riders at once — the atomic accept means
       only one could win, but the other rider is interrupted for nothing,
       which is the exact cost this whole file is arranged to avoid. */
    if (order.dispatch.state === 'searching' && sessions.has(number)) {
      return { started: false, reason: 'a search is already running' };
    }

    const pickup = await pickupPointOf(order);
    if (!pickup) {
      await failSweep(order, 'the restaurant has not dropped a map pin, so nobody can be sent');
      return { started: false, reason: 'restaurant has no location' };
    }

    /* Riders who have already said no to THIS order are not asked again. The
       list is read off the order rather than held in the session, so it
       survives a restart mid-sweep. */
    const alreadyAsked = (order.dispatch.offers || [])
      .filter((offer) => ['declined', 'timeout'].includes(offer.outcome))
      .map((offer) => offer.driverId);

    const candidates = await findCandidates({ pickup, exclude: alreadyAsked });

    order.dispatch.attempts += 1;
    order.dispatch.candidateCount = candidates.length;
    order.dispatch.startedAt = new Date();
    order.dispatch.failureReason = '';
    order.delivery.earnings = riderEarningsFor(order);

    if (!candidates.length) {
      const duty = await dutyCount();
      await failSweep(
        order,
        duty.online === 0
          ? 'no rider is online right now'
          : `${duty.online} rider(s) online, none free and nearby`,
      );
      return { started: false, reason: 'no candidates' };
    }

    order.dispatch.state = 'searching';
    await order.save();

    console.log(
      `${BADGE} ${number} searching (${reason}) · sweep ${order.dispatch.attempts}/${MAX_SWEEPS} · `
      + `${candidates.length} candidate(s), nearest ${candidates[0].distanceMeters}m`,
    );

    /* The diner is told the search began. This is the "finding you a rider"
       state on the tracking screen, and it must appear before the first offer
       goes out or the screen sits on "order placed" for fifteen seconds. */
    realtime.toOrderParties(order, 'dispatch_update', dispatchUpdate(order, {
      candidateCount: candidates.length,
    }));

    sessions.set(number, { candidates, index: 0, timer: null, driverId: null });
    await offerNext(number);
    return { started: true, candidates: candidates.length };
  } catch (error) {
    console.error(`${BADGE} ${number} could not start: ${error.message}`);
    return { started: false, reason: error.message };
  }
}

/**
 * A sweep ended with nobody. Record it, and tell the diner honestly.
 *
 * `unassigned` rather than a failure status, because the order is not failed:
 * the kitchen is still cooking and the dispatcher will try again when the food
 * is ready. Wording it as a failure and then delivering the order is worse
 * than saying nothing at all.
 */
async function failSweep(order, why) {
  order.dispatch.state = 'unassigned';
  order.dispatch.failureReason = why;
  await order.save();
  clearSession(order.orderNumber);

  console.warn(`${BADGE} ${order.orderNumber} unassigned — ${why}`);

  realtime.toOrderParties(order, 'dispatch_update', dispatchUpdate(order, { failureReason: why }));
  notifier.notifyCustomerNoRider(order).catch(() => {});
}

/* ── The cascade ──────────────────────────────────────────────────────────*/

/**
 * Offer the order to the next candidate who is still worth offering to.
 *
 * Re-reads the order and each candidate before offering, because the list was
 * built up to two minutes ago: an order may have been cancelled, and a rider
 * may have gone offline or taken a different job. Skipping them here costs one
 * query; not skipping them costs a full sixteen-second timeout each.
 */
async function offerNext(orderNumber) {
  const session = sessions.get(orderNumber);
  if (!session) return;

  if (session.timer) {
    clearTimeout(session.timer);
    session.timer = null;
  }

  const order = await FoodOrder.findOne({ orderNumber });
  if (!order || order.dispatch.state !== 'searching') {
    /* Accepted, cancelled or rejected while the cascade was mid-flight. */
    clearSession(orderNumber);
    return;
  }

  /* Walk forward past anybody who is no longer offerable. */
  let candidate = null;
  while (session.index < session.candidates.length) {
    const next = session.candidates[session.index];
    // eslint-disable-next-line no-await-in-loop -- one check per skipped rider,
    // and the loop almost always runs once. Batching would read every
    // candidate on every offer, which is more work, not less.
    const driver = await Driver.findOne({ driverId: next.driverId })
      .select('driverId name phone vehicle isOnline isAvailable status').lean();

    const usable = driver
      && driver.status === 'approved'
      && driver.isOnline
      && driver.isAvailable;

    if (usable) { candidate = { ...next, driver }; break; }

    console.log(`${BADGE} ${orderNumber} skipping ${next.driverId} — no longer free`);
    session.index += 1;
  }

  if (!candidate) {
    await failSweep(order, 'every rider nearby declined or went offline');
    return;
  }

  session.driverId = candidate.driverId;

  /* Written to the order BEFORE it is emitted, so the poll fallback and the
     socket cannot disagree about who currently holds the offer. */
  order.dispatch.offers.push({
    driverId: candidate.driverId,
    distanceMeters: candidate.distanceMeters,
    offeredAt: new Date(),
    outcome: 'offered',
  });
  await order.save();

  console.log(
    `${BADGE} ${orderNumber} → ${candidate.driverId} `
    + `(#${session.index + 1}/${session.candidates.length}, ${candidate.distanceMeters}m, `
    + `₹${order.delivery.earnings})`,
  );

  const offer = {
    ...riderView(order, { revealed: false, distanceMeters: candidate.distanceMeters }),
    expiresInSeconds: OFFER_SECONDS,
    offerIndex: session.index + 1,
    offerCount: session.candidates.length,
  };

  realtime.toDriver(candidate.driverId, 'delivery_offer', offer);
  notifier.notifyDriverOfOffer(candidate.driverId, {
    order,
    distanceMeters: candidate.distanceMeters,
    expiresInSeconds: OFFER_SECONDS,
  }).catch(() => {});

  session.timer = setTimeout(() => {
    /* The callback is async and nothing awaits it — a rejected promise here
       must not take the process down, so it catches its own. */
    expireOffer(orderNumber, candidate.driverId).catch((error) => {
      console.error(`${BADGE} ${orderNumber} timeout handling failed: ${error.message}`);
    });
  }, OFFER_MS);
}

/** Nobody tapped. Close the offer and move to the next rider. */
async function expireOffer(orderNumber, driverId) {
  const session = sessions.get(orderNumber);
  /* The session is gone when the rider accepted a half-tick before the timer
     fired. Doing nothing is correct — the accept already cleared the cascade. */
  if (!session || session.driverId !== driverId) return;

  console.log(`${BADGE} ${orderNumber} · ${driverId} did not answer in ${OFFER_SECONDS}s`);

  await recordOutcome(orderNumber, driverId, 'timeout', 'No response');
  realtime.toDriver(driverId, 'delivery_offer_closed', { orderNumber, reason: 'timeout' });
  notifier.notifyDriverOfferClosed(driverId, orderNumber, 'timeout').catch(() => {});

  session.index += 1;
  await offerNext(orderNumber);
}

/** Stamp how one rider's offer ended, without disturbing the others. */
async function recordOutcome(orderNumber, driverId, outcome, reason = '') {
  await FoodOrder.updateOne(
    { orderNumber, 'dispatch.offers': { $elemMatch: { driverId, outcome: 'offered' } } },
    {
      $set: {
        'dispatch.offers.$.outcome': outcome,
        'dispatch.offers.$.respondedAt': new Date(),
        'dispatch.offers.$.reason': String(reason || '').slice(0, 200),
      },
    },
  );
}

/* ── The rider answering ──────────────────────────────────────────────────*/

/**
 * A rider takes the job.
 *
 * The claim is ONE atomic update, and its filter is the whole of the race
 * protection: the order must still be searching, must still have no rider, and
 * must still be one this rider was actually offered. Two riders tapping in the
 * same tick means Mongo applies one update and matches nothing for the other,
 * who is told the job is gone — which is true.
 *
 * Note what is NOT in the filter: the session map. A rider whose accept
 * arrives after a restart wiped the sessions still gets the job, because the
 * document says they were offered it and nobody else took it.
 *
 * @returns {Promise<{ ok: boolean, code?: string, message?: string, order?: object }>}
 */
async function acceptOffer(orderNumber, driver) {
  const number = String(orderNumber || '').trim().toUpperCase();

  /* A rider carrying something cannot take a second job. Checked before the
     claim rather than inside it, so the refusal names the real reason instead
     of "that job is gone". */
  if (driver.currentOrderNumber && driver.currentOrderNumber !== number) {
    return {
      ok: false,
      code: 'ALREADY_ON_A_JOB',
      message: `Finish ${driver.currentOrderNumber} before taking another delivery.`,
    };
  }

  const now = new Date();
  const claimed = await FoodOrder.findOneAndUpdate(
    {
      orderNumber: number,
      'dispatch.state': 'searching',
      /* `$in` with a null rather than an `$or`, and that is not a style
         choice: `{ $in: [..., null] }` matches a MISSING field as well as an
         empty one, which covers an order written before `delivery` existed —
         and it keeps the array field below as the only top-level thing the
         positional `$` could bind to. A `$or` beside a positional update is
         the shape MongoDB is documented to be fussy about, and this claim is
         the one write in the flow that must never quietly match nothing. */
      'delivery.driverId': { $in: ['', null] },
      'dispatch.offers': { $elemMatch: { driverId: driver.driverId, outcome: 'offered' } },
    },
    {
      $set: {
        'dispatch.state': 'assigned',
        'dispatch.failureReason': '',
        'delivery.driverId': driver.driverId,
        'delivery.driverName': driver.name || '',
        'delivery.driverPhone': driver.phone || '',
        'delivery.vehicle': {
          type: (driver.vehicle && driver.vehicle.type) || '',
          model: (driver.vehicle && driver.vehicle.model) || '',
          plate: (driver.vehicle && driver.vehicle.plate) || '',
        },
        'delivery.assignedAt': now,
        'dispatch.offers.$.outcome': 'accepted',
        'dispatch.offers.$.respondedAt': now,
      },
    },
    { new: true },
  );

  if (!claimed) {
    /* Told apart so the app can say something true. "Somebody else took it" and
       "your fifteen seconds ran out" feel very different to a rider, and one
       message for both is how they come to believe the button is broken. */
    const current = await FoodOrder.findOne({ orderNumber: number })
      .select('orderNumber dispatch.state delivery.driverId status').lean();

    if (!current) return { ok: false, code: 'NOT_FOUND', message: 'That delivery no longer exists.' };
    if (current.delivery && current.delivery.driverId) {
      return { ok: false, code: 'TAKEN', message: 'Another rider took this one.' };
    }
    if (['cancelled', 'rejected'].includes(current.status)) {
      return { ok: false, code: 'ORDER_CLOSED', message: 'That order was cancelled.' };
    }
    return { ok: false, code: 'OFFER_EXPIRED', message: 'That offer has expired.' };
  }

  /* Distance is copied from the offer that was accepted rather than
     recomputed — it is what the rider decided on. */
  const accepted = (claimed.dispatch.offers || [])
    .filter((offer) => offer.driverId === driver.driverId && offer.outcome === 'accepted')
    .pop();
  if (accepted) {
    claimed.delivery.acceptedFromMeters = accepted.distanceMeters || 0;
    await claimed.save();
  }

  /* The rider is now busy. Two fields on `app_drivers`, set together: the
     availability flag the matcher reads and the order number the app reads. */
  await Driver.updateOne(
    { driverId: driver.driverId },
    { $set: { isAvailable: false, currentOrderNumber: claimed.orderNumber } },
  );

  clearSession(number);

  console.log(
    `${BADGE} ${number} ACCEPTED by ${driver.driverId} `
    + `(${claimed.delivery.acceptedFromMeters}m away, ₹${claimed.delivery.earnings})`,
  );

  /* Everybody who is watching, in one call — the diner sees a rider, the
     kitchen sees who is coming, the rider sees their own job. */
  realtime.toOrderParties(claimed, 'dispatch_update', dispatchUpdate(claimed));
  notifier.notifyCustomerOfRider(claimed, driver).catch(() => {});

  return { ok: true, order: claimed };
}

/**
 * A rider says no.
 *
 * Moves to the next candidate immediately rather than waiting out the timer —
 * the whole point of an explicit decline is that it gives the next rider those
 * fifteen seconds back.
 */
async function declineOffer(orderNumber, driverId, reason = '') {
  const number = String(orderNumber || '').trim().toUpperCase();
  const session = sessions.get(number);

  await recordOutcome(number, driverId, 'declined', reason);
  realtime.toDriver(driverId, 'delivery_offer_closed', { orderNumber: number, reason: 'declined' });

  if (!session || session.driverId !== driverId) {
    /* Declining an offer that already moved on. Recorded above — a rider who
       consistently declines is worth seeing in the data either way — and then
       ignored, because advancing a cascade that is now on somebody else would
       skip an innocent rider. */
    return { ok: true, advanced: false };
  }

  console.log(`${BADGE} ${number} declined by ${driverId}${reason ? ` — ${reason}` : ''}`);

  if (session.timer) {
    clearTimeout(session.timer);
    session.timer = null;
  }
  session.index += 1;
  await offerNext(number);
  return { ok: true, advanced: true };
}

/* ── Ending a search from outside ─────────────────────────────────────────*/

/**
 * The order stopped being deliverable — cancelled by the diner, rejected by
 * the kitchen.
 *
 * The rider currently holding the offer is told explicitly. Without this their
 * screen counts down to zero on an order that no longer exists and they tap
 * Accept into a refusal, which reads as the app being broken rather than as
 * the order being gone.
 */
async function cancelDispatch(orderNumber, reason = 'The order was cancelled') {
  const number = String(orderNumber || '').trim().toUpperCase();
  const session = sessions.get(number);

  if (session && session.driverId) {
    realtime.toDriver(session.driverId, 'delivery_offer_closed', {
      orderNumber: number, reason: 'cancelled',
    });
    notifier.notifyDriverOfferClosed(session.driverId, number, 'cancelled').catch(() => {});
    await recordOutcome(number, session.driverId, 'cancelled', reason);
  }
  clearSession(number);

  await FoodOrder.updateOne(
    { orderNumber: number, 'dispatch.state': { $in: ['searching', 'unassigned'] } },
    { $set: { 'dispatch.state': 'idle', 'dispatch.failureReason': reason } },
  );
}

/**
 * The assigned rider drops the job — an accident, a breakdown, a wrong turn
 * into a closed road.
 *
 * The order goes back to the front of the queue rather than failing: the food
 * exists, the diner paid, and somebody else can carry it. The rider who
 * dropped it is added to the exclusion list by virtue of their offer already
 * being recorded, so the retry does not immediately hand it back to them.
 */
async function releaseRider(orderNumber, driverId, reason = 'The rider could not complete it') {
  const number = String(orderNumber || '').trim().toUpperCase();

  const order = await FoodOrder.findOne({ orderNumber: number, 'delivery.driverId': driverId });
  if (!order) return { ok: false, code: 'NOT_YOURS', message: 'That delivery is not assigned to you.' };
  if (order.status === 'delivered') {
    return { ok: false, code: 'ALREADY_DELIVERED', message: 'That delivery is already complete.' };
  }

  order.delivery.driverId = '';
  order.delivery.driverName = '';
  order.delivery.driverPhone = '';
  order.delivery.assignedAt = null;
  order.delivery.pickedUpAt = null;
  order.dispatch.state = 'unassigned';
  order.dispatch.failureReason = reason;
  order.statusHistory.push({
    status: order.status, at: new Date(), by: 'rider', note: `Released: ${reason}`.slice(0, 200),
  });
  /* The release is recorded against the accepted offer so a retry excludes
     them — `startDispatch` reads declined and timed-out offers, so the outcome
     is rewritten to `declined` rather than left as `accepted`. */
  await order.save();
  await recordOutcomeForce(number, driverId, 'declined', reason);

  await Driver.updateOne(
    { driverId },
    { $set: { isAvailable: true, currentOrderNumber: null } },
  );

  console.warn(`${BADGE} ${number} released by ${driverId} — ${reason}`);
  realtime.toOrderParties(order, 'dispatch_update', dispatchUpdate(order, { failureReason: reason }));

  /* Straight back out to the next rider. The food is cooked or cooking and
     every minute here is a cold meal. */
  const restarted = await startDispatch(number, { reason: 'rider released' });
  return { ok: true, restarted: restarted.started };
}

/** Like `recordOutcome`, but for an offer that was already answered. */
async function recordOutcomeForce(orderNumber, driverId, outcome, reason) {
  await FoodOrder.updateOne(
    { orderNumber, 'dispatch.offers': { $elemMatch: { driverId, outcome: 'accepted' } } },
    {
      $set: {
        'dispatch.offers.$.outcome': outcome,
        'dispatch.offers.$.respondedAt': new Date(),
        'dispatch.offers.$.reason': String(reason || '').slice(0, 200),
      },
    },
  );
}

/* ── The poll fallback, and the restart backstop ───────────────────────────*/

/**
 * The offer this rider is currently holding, read from the DATABASE.
 *
 * This is what the Driver app calls when its socket is down — on a train, on a
 * deployment where socket.io is not installed, or in the two seconds after a
 * reconnect. It answers from the order document rather than from the session
 * map on purpose: those are the exact circumstances in which the map may be
 * from a different process or a previous boot.
 *
 * The expiry is recomputed from `offeredAt`, so an offer whose timer died with
 * a restart reads as expired rather than as live forever.
 */
async function currentOfferFor(driverId) {
  if (mongoose.connection.readyState !== 1) return null;

  const order = await FoodOrder.findOne({
    'dispatch.state': 'searching',
    'dispatch.offers': { $elemMatch: { driverId, outcome: 'offered' } },
  }).sort({ placedAt: -1 });

  if (!order) return null;

  const offer = (order.dispatch.offers || [])
    .filter((row) => row.driverId === driverId && row.outcome === 'offered')
    .pop();
  if (!offer) return null;

  const elapsed = Date.now() - new Date(offer.offeredAt).getTime();
  const remaining = Math.ceil((OFFER_MS - elapsed) / 1000);
  if (remaining <= 0) return null;

  return {
    ...riderView(order, { revealed: false, distanceMeters: offer.distanceMeters }),
    expiresInSeconds: remaining,
  };
}

/**
 * Pick up orders whose cascade died with a restart.
 *
 * A `searching` order whose newest offer is older than the offer window has a
 * rider nobody is waiting on and a timer that no longer exists. Left alone it
 * would sit there until a human noticed. This is the backstop the header
 * promises, and it is why losing the session map on a deploy is survivable
 * rather than an outage.
 *
 * Cheap by construction: `dispatch.state` is indexed and almost every order is
 * `idle` or `assigned`, so the index this scans is nearly empty.
 */
async function sweepStalledDispatch() {
  if (mongoose.connection.readyState !== 1) return 0;

  const cutoff = new Date(Date.now() - OFFER_MS);
  const stalled = await FoodOrder.find({ 'dispatch.state': 'searching' })
    .select('orderNumber dispatch.offers').limit(50).lean();

  let resumed = 0;
  for (const row of stalled) {
    if (sessions.has(row.orderNumber)) continue;
    const last = (row.dispatch.offers || []).slice(-1)[0];
    if (last && new Date(last.offeredAt) > cutoff) continue;

    console.warn(`${BADGE} ${row.orderNumber} was left mid-search — resuming`);
    if (last && last.outcome === 'offered') {
      // eslint-disable-next-line no-await-in-loop
      await recordOutcome(row.orderNumber, last.driverId, 'timeout', 'Server restarted mid-offer');
    }
    /* Reset to `unassigned` first so `startDispatch`'s "already searching"
       guard does not refuse the very order it is meant to rescue. */
    // eslint-disable-next-line no-await-in-loop
    await FoodOrder.updateOne(
      { orderNumber: row.orderNumber },
      { $set: { 'dispatch.state': 'unassigned' } },
    );
    // eslint-disable-next-line no-await-in-loop
    await startDispatch(row.orderNumber, { reason: 'resumed after restart' });
    resumed += 1;
  }
  return resumed;
}

/* ── The rider who vanished ───────────────────────────────────────────────*/

/**
 * How long an ACCEPTED but uncollected order waits on a rider who has gone
 * dark before it is taken off them.
 *
 * Ten minutes, measured from their last position rather than from the
 * acceptance: a rider sitting outside a slow kitchen is reporting every
 * fifteen seconds and is fine, and a rider whose phone died two minutes after
 * accepting is not. Measuring from the acceptance would punish the first and
 * miss the second.
 */
const GONE_DARK_MS = 10 * 60 * 1000;

/**
 * How long an order may be IN A RIDER'S BAG before somebody is told.
 *
 * Forty-five minutes, and it is an alarm rather than an action — see below.
 */
const CARRYING_TOO_LONG_MS = 45 * 60 * 1000;

/**
 * Put right the states nothing else can.
 *
 * Three things go wrong that no request will ever fix on its own, because the
 * person who would have fixed them is the one who disappeared:
 *
 *   1. A rider flagged busy with `currentOrderNumber` pointing at an order
 *      that is finished, cancelled, or somebody else's. They are invisible to
 *      the dispatcher for ever and nothing in the product says why. Corrective
 *      only, no judgement: the ORDER decides, the flag follows.
 *
 *   2. An order accepted but never collected, whose rider has not reported a
 *      position in ten minutes. The food has NOT changed hands, so taking it
 *      off them and sending it out again is safe — and it is the difference
 *      between a diner waiting twenty minutes and a diner waiting for ever.
 *
 *   3. An order that has been in a bag for forty-five minutes. This is
 *      LOGGED AND LEFT ALONE, deliberately. The food is physically with a
 *      person; a sweep that "released" it would send a second rider to a
 *      restaurant that has nothing to give them, and mark the order as
 *      needing a rider when what it needs is a phone call. Automation cannot
 *      unmake a hand-over, so it does not pretend to.
 *
 * Runs on a timer beside `sweepStalledDispatch`. Cheap by construction: both
 * queries are on indexed fields and match almost nothing in the ordinary case.
 */
async function reconcileDeliveries() {
  if (mongoose.connection.readyState !== 1) return { freed: 0, reDispatched: 0, stuck: 0 };

  const report = { freed: 0, reDispatched: 0, stuck: 0 };
  const LIVE = ['placed', 'accepted', 'preparing', 'ready', 'picked_up'];

  /* ── 1. Riders flagged busy with nothing to be busy with ──────────────── */
  const busy = await Driver.find({ currentOrderNumber: { $ne: null } })
    .select('driverId currentOrderNumber').limit(200).lean();

  for (const driver of busy) {
    // eslint-disable-next-line no-await-in-loop
    const held = await FoodOrder.findOne({
      orderNumber: driver.currentOrderNumber,
      'delivery.driverId': driver.driverId,
      status: { $in: LIVE },
    }).select('orderNumber').lean();

    if (held) continue;

    // eslint-disable-next-line no-await-in-loop
    await Driver.updateOne(
      { driverId: driver.driverId },
      { $set: { currentOrderNumber: null, isAvailable: true } },
    );
    report.freed += 1;
    console.warn(
      `${BADGE} freed ${driver.driverId} — they were held on ${driver.currentOrderNumber}, `
      + 'which is no longer a live order of theirs',
    );
  }

  /* ── 2. Accepted, never collected, rider gone dark ────────────────────── */
  const assigned = await FoodOrder.find({
    'dispatch.state': 'assigned',
    status: { $in: ['placed', 'accepted', 'preparing', 'ready'] },
    'delivery.assignedAt': { $lte: new Date(Date.now() - GONE_DARK_MS) },
  }).select('orderNumber delivery.driverId').limit(50).lean();

  for (const row of assigned) {
    const driverId = row.delivery && row.delivery.driverId;
    if (!driverId) continue;

    // eslint-disable-next-line no-await-in-loop
    const driver = await Driver.findOne({ driverId }).select('locationUpdatedAt').lean();
    const lastFix = driver && driver.locationUpdatedAt
      ? new Date(driver.locationUpdatedAt).getTime()
      : 0;
    if (Date.now() - lastFix < GONE_DARK_MS) continue;

    console.warn(
      `${BADGE} ${row.orderNumber} — ${driverId} accepted it and has not reported a position `
      + `in ${Math.round(GONE_DARK_MS / 60000)} minutes. Taking it back.`,
    );
    // eslint-disable-next-line no-await-in-loop
    await releaseRider(row.orderNumber, driverId, 'The rider stopped responding');
    report.reDispatched += 1;
  }

  /* ── 3. In a bag too long. Said out loud, and left alone ──────────────── */
  const carrying = await FoodOrder.find({
    status: 'picked_up',
    'delivery.pickedUpAt': { $lte: new Date(Date.now() - CARRYING_TOO_LONG_MS) },
  }).select('orderNumber delivery.driverId delivery.driverPhone customerPhone').limit(50).lean();

  for (const row of carrying) {
    report.stuck += 1;
    console.error(
      `${BADGE} ⚠ ${row.orderNumber} has been with rider ${row.delivery?.driverId} `
      + `(${row.delivery?.driverPhone || 'no number'}) for over `
      + `${Math.round(CARRYING_TOO_LONG_MS / 60000)} minutes. NOT released — the food is with `
      + `them. Somebody needs to call the rider, and then the customer on `
      + `${row.customerPhone || 'their order'}.`,
    );
  }

  return report;
}

/** Clear every timer. Called on shutdown, so nothing fires into a closing DB. */
const stopAllDispatch = () => {
  for (const orderNumber of Array.from(sessions.keys())) clearSession(orderNumber);
};

module.exports = {
  OFFER_SECONDS,
  MAX_SWEEPS,
  RIDER_SHARE,
  RIDER_MINIMUM,
  riderEarningsFor,
  dispatchUpdate,
  startDispatch,
  acceptOffer,
  declineOffer,
  cancelDispatch,
  releaseRider,
  currentOfferFor,
  sweepStalledDispatch,
  reconcileDeliveries,
  stopAllDispatch,
  /* Exported for the verification script, which drives the cascade without
     waiting sixteen real seconds for each offer. */
  _sessions: sessions,
};
