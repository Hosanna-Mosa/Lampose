/* ══════════════════════════════════════════════════════════════════════════
   Finding a rider for one order — broadcast to everyone who can make it in
   time, not one at a time.

   This is the piece the whole delivery flow turns on:

     the kitchen accepts, with a prep-time quote  →  START HERE  →
     a rider accepts  →  three apps update

   ## The search starts at Accept

   The kitchen has to accept and quote how long the food takes before any
   rider is searched for at all — see `setOrderStatus` in
   `foodOrder.controller.js`, where accepting is the one thing that calls
   `startDispatch` now. `order.promisedMinutes`, set on that same request, is
   the number everything below is built around: it is converted straight into
   a search radius, and later into the "ready by" time shown to every rider
   who is offered the job. `eligibleForDispatch` and its callers are what
   enforce nothing starts any earlier than that.

   ## Everyone who can make it in time, not the nearest one

   An earlier version of this file offered the order to one rider at a time,
   nearest first, each with a private fifteen-second turn — because with no
   ready-time to reason against, offering to everyone at once meant every
   rider but the fastest thumb was interrupted for nothing, and "nearest"
   lost to "quickest to tap."

   That reasoning stops applying once the kitchen has quoted a real prep
   time. If the food is not ready for another 25 minutes, a rider 2 minutes
   away and a rider 22 minutes away are both genuinely useful — "nearest" is
   no longer the thing that matters, "can get there before the food does"
   is — and there is no reason to make the farther one wait for the nearer
   one to be asked first and possibly decline. So the search radius IS the
   prep-time quote (converted to a distance at `PLANNING_SPEED_KMH`), every
   rider inside it is offered the job in the same instant, and whoever
   accepts first gets it — the exact same atomic claim `acceptOffer` already
   used when there was only ever one holder to race against.

   ## Nobody's offer has a personal countdown any more

   The old fifteen-second window existed because only one rider held the
   offer and the next one was waiting on them. With everyone notified
   together, an offer just stays open until the order is taken, declined, or
   its own lifecycle ends — a rider close by has no reason to be rushed by a
   clock that was only ever there to move a queue that no longer exists.
   What replaces the countdown is the ready time itself, sent with the offer
   (`readyAt`, in `broadcastOffers`) — the fact a rider actually needs to
   decide when to leave.

   ## Nobody in range yet? The radius grows, twice, before Ready takes over

   `scheduleWidening` books up to two future checks — around the halfway
   point of the prep window, and again five minutes before it ends — each of
   which asks the same radius question again, wider. Growing rather than
   restarting: `dispatch.radiusMeters` is stored on the order specifically so
   a widen step always adds to the distance already searched, never forgets
   it. The kitchen marking the order `ready` remains the backstop underneath
   all of this exactly as before — see the `'food is ready'` retry in
   `foodOrder.controller.js` — for the case where widening twice still was
   not enough.

   ## The timer is an optimisation. The database is the truth.

   Sessions live in a `Map` in this process, and that map is NOT what makes
   dispatch correct:

     · Accepting is one atomic `findOneAndUpdate` whose filter requires the
       order to still be searching, still have no rider, and still carry an
       `offered` row for the accepting driver. Two riders tapping at once
       means one wins and the other is told the job is gone, with or without
       a session in memory.
     · The live offer is also written to the order document, so
       `currentOfferFor()` — the poll the Driver app falls back on when its
       socket is down — reads the database rather than this map.

   What the map buys is the widen SCHEDULE: without it, a widen step that was
   booked would simply never fire after a restart. `sweepStalledDispatch()`
   is the backstop that notices a `searching` order with no timers in this
   process and re-books them — the one thing a restart actually costs is losing
   track of exactly which of the two widen checks already ran, which self-heals
   the next time one fires from a freshly recomputed "how long is left."

   ## Single process, and honestly so

   The map is per-process. Run two instances behind a load balancer and each
   would run its own widen schedule for orders it created, and could
   independently broadcast to the same newly-in-range rider twice. The
   atomic accept still means only one instance's rider can ever WIN the
   order, so this is a duplicate offer rather than a double assignment, but
   it is still wrong. Moving the sessions into Redis is the fix, and it is
   deliberately not done here: this backend runs as one process today (see
   `deploy/VPS.md`), and a distributed lock nobody needs yet is a distributed
   lock nobody is testing.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const FoodOrder = require('../foodpartners/foodOrder.model');
const FoodRestaurant = require('../foodpartners/foodRestaurant.model');
const Driver = require('./driver.model');
const { findCandidatesWithinRadius, dutyCount } = require('./driverMatch.service');
const realtime = require('../../infrastructure/realtime/realtime');
const notifier = require('./dispatch.notifier');

const { riderView } = FoodOrder;

const BADGE = '🛵 [dispatch]';

/**
 * How many full sweeps one order gets.
 *
 * A sweep that finds nobody at all — the radius comes back empty even before
 * any widening — is retried when the kitchen marks the order ready, by which
 * time the riders on the road are different people. Three is enough to cover
 * "everybody was busy at 8pm" and few enough that an order in a city with no
 * riders stops asking rather than looping until somebody notices. Widening an
 * existing broadcast (see `widen`) does not count against this — it is the
 * same sweep reaching further, not a new one.
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

/* ── Turning a prep-time quote into a distance ────────────────────────────
   `PLANNING_SPEED_KMH` is a rough planning number, not a routed ETA — this
   app has no directions API and the delivery map shown to a diner is
   deliberately straight-line distance for the same reason (see its own
   header). It is used for two related but separate things: how far out to
   search (`radiusFromMinutes`), and the minutes shown to a rider alongside
   an offer (`riderEtaMinutes`) — the same number, read two ways, so a rider
   is never told an ETA that disagrees with why they were in range to begin
   with. */

/** A scooter crossing ordinary city traffic — lights, turns, the lot. */
const PLANNING_SPEED_KMH = 20;
/** Metres per minute at the planning speed — the one conversion everything
 *  below is built from. */
const METRES_PER_MINUTE = (PLANNING_SPEED_KMH * 1000) / 60;

/** Never search narrower than this, even for a very short or absent quote —
 *  the immediate neighbourhood is always worth asking. */
const MIN_RADIUS_METERS = 2000;
/** How far a widen step reaches beyond whatever was already searched. */
const WIDEN_STEP_METERS = 10 * METRES_PER_MINUTE;
/** Neither scheduled widen check runs closer to now than this — booking one
 *  for eleven seconds out is not worth the moving part. */
const MIN_CHECKPOINT_MS = 60 * 1000;
/** How long before the food should be ready the SECOND widen check runs. */
const FINAL_CHECKPOINT_LEAD_MS = 5 * 60 * 1000;
/** The two fallback checkpoints when the kitchen gave no quote at all, so
 *  there is no ready time to schedule against. */
const NO_QUOTE_CHECKPOINTS_MS = [3 * 60 * 1000, 8 * 60 * 1000];

const radiusFromMinutes = (minutes) => {
  const m = Number(minutes) || 0;
  return Math.max(MIN_RADIUS_METERS, m * METRES_PER_MINUTE);
};

const riderEtaMinutes = (distanceMeters) => (Number(distanceMeters) || 0) / METRES_PER_MINUTE;

/**
 * When the food will be ready, or null when there is nothing to compute it
 * from.
 *
 * Read from `statusHistory`'s own `accepted` event rather than kept as a
 * separate field — see `buildTimeline` on the client for the same lookup
 * against the same event, so the two sides of one order agree about when it
 * was accepted. Null covers both an order not yet accepted and one accepted
 * without a prep-time quote; either way there is no ready time to show
 * anybody, and callers treat the two identically.
 */
function readyAtFor(order) {
  if (!order.promisedMinutes) return null;
  const acceptedEvent = (order.statusHistory || []).find((event) => event.status === 'accepted');
  if (!acceptedEvent || !acceptedEvent.at) return null;
  const acceptedAt = new Date(acceptedEvent.at);
  if (Number.isNaN(acceptedAt.getTime())) return null;
  return new Date(acceptedAt.getTime() + order.promisedMinutes * 60000);
}

/* orderNumber -> { timers: NodeJS.Timeout[] } — see the header on why this
   holding nothing but timers is enough for the map to be a pure optimisation. */
const sessions = new Map();

const clearSession = (orderNumber) => {
  const session = sessions.get(orderNumber);
  if (session) for (const timer of session.timers) clearTimeout(timer);
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
  /* How the restaurant arranged delivery ('' / 'self' / 'driver'), and whether
     the diner may be told a driver is assigned — see `driverAssigned` in the
     order model. Both are additions; nothing that read this before changes. */
  deliveryMethod: (order.delivery && order.delivery.method) || '',
  driverAssigned: FoodOrder.driverAssigned(order),
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
 *     nobody has paid for. In practice this can no longer even trigger: the
 *     restaurant is never shown an unpaid online order to accept, and Accept
 *     is the only thing that calls `startDispatch` now — kept as a guard
 *     anyway, since a refusal that can never fire is cheaper than one that
 *     silently stops being true
 *   · a rejected or cancelled order
 *   · an order that already has a rider
 */
const eligibleForDispatch = (order) => {
  if (!order) return 'the order no longer exists';
  if (order.fulfilment === 'pickup') return 'it is a counter pickup';
  if (order.paymentMode === 'online' && order.paymentStatus !== 'paid') return 'it has not been paid for';
  if (['rejected', 'cancelled', 'delivered'].includes(order.status)) return `it is ${order.status}`;
  if (order.delivery && order.delivery.driverId) return 'it already has a rider';
  /* The restaurant said who brings it — its own person, or the delivery desk's
     driver. A rider from the app on top of that is a second person sent for one
     bag. Every caller of `startDispatch` (accept, the "food is ready" retry, a
     released rider, the restart backstop) passes through here, so this is the
     one place it has to be said. See `foodDelivery.service.js`. */
  if (order.delivery && order.delivery.method) return 'the restaurant is arranging the delivery';
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

/* ── The broadcast ────────────────────────────────────────────────────────*/

/**
 * Write and send one offer round to a list of candidates.
 *
 * Shared by `startDispatch`'s first round and every `widen` step after it —
 * the two differ only in WHICH candidates they have to offer, never in how
 * an offer is recorded or delivered. Every row is written to the order
 * BEFORE anything is sent, so the poll fallback (`currentOfferFor`) and the
 * sockets going out a moment later can never disagree about who holds one.
 */
async function broadcastOffers(order, candidates) {
  const offeredAt = new Date();
  for (const candidate of candidates) {
    order.dispatch.offers.push({
      driverId: candidate.driverId,
      distanceMeters: candidate.distanceMeters,
      offeredAt,
      outcome: 'offered',
    });
  }
  await order.save();

  console.log(
    `${BADGE} ${order.orderNumber} → broadcasting to ${candidates.length}: `
    + candidates.map((c) => `${c.driverId}(${c.distanceMeters}m)`).join(', '),
  );

  const readyAt = readyAtFor(order);
  for (const candidate of candidates) {
    const offer = {
      ...riderView(order, { revealed: false, distanceMeters: candidate.distanceMeters }),
      etaMinutes: Math.round(riderEtaMinutes(candidate.distanceMeters)),
      readyAt: readyAt ? readyAt.toISOString() : null,
    };
    realtime.toDriver(candidate.driverId, 'delivery_offer', offer);
    notifier.notifyDriverOfOffer(candidate.driverId, {
      order, distanceMeters: candidate.distanceMeters, readyAt,
    }).catch(() => {});
  }
}

/**
 * Book the next widen check, if one is still worth booking.
 *
 * Recomputes from CURRENT time every time it is called — by `startDispatch`
 * after the first broadcast, by `widen` after each step, and by
 * `sweepStalledDispatch` after a restart — rather than working off fixed
 * checkpoints set once. That is what makes restart recovery simple: there is
 * no schedule to have "lost half of," only a question ("is there still a
 * sensible moment to check again before Ready?") that can be asked fresh at
 * any time and keeps answering itself correctly as the window runs out.
 */
function scheduleWidening(order, session) {
  const readyAt = readyAtFor(order);
  const delays = [];

  if (readyAt) {
    const remainingMs = readyAt.getTime() - Date.now();
    const halfway = remainingMs / 2;
    const final = remainingMs - FINAL_CHECKPOINT_LEAD_MS;
    if (halfway > MIN_CHECKPOINT_MS) delays.push(halfway);
    if (final > MIN_CHECKPOINT_MS && Math.abs(final - halfway) > MIN_CHECKPOINT_MS) delays.push(final);
  } else {
    /* No quote to schedule against — two fixed fallback checks. The kitchen
       marking the order `ready` is still the ultimate backstop either way. */
    delays.push(...NO_QUOTE_CHECKPOINTS_MS);
  }

  for (const delay of delays) {
    const timer = setTimeout(() => {
      widen(order.orderNumber).catch((error) => {
        console.error(`${BADGE} ${order.orderNumber} widen failed: ${error.message}`);
      });
    }, delay);
    session.timers.push(timer);
  }
}

/**
 * Reach further, because nobody in range has taken it yet.
 *
 * Re-reads the order first — the whole point of a widen step is that time
 * has passed, and the order may already be assigned, cancelled, or rejected
 * by the time this fires. Excludes every driverId this order has EVER
 * offered, whatever the outcome: a wider radius must never re-offer someone
 * who already declined, is still holding an earlier offer, or lost the job
 * to somebody else — asking twice is how a rider comes to believe declining
 * does nothing.
 */
async function widen(orderNumber) {
  const order = await FoodOrder.findOne({ orderNumber });
  if (!order || order.dispatch.state !== 'searching') return;

  const pickup = await pickupPointOf(order);
  if (!pickup) return;

  const alreadyAsked = (order.dispatch.offers || []).map((offer) => offer.driverId);
  const currentRadius = order.dispatch.radiusMeters || radiusFromMinutes(order.promisedMinutes);
  const widerRadius = currentRadius + WIDEN_STEP_METERS;

  const found = await findCandidatesWithinRadius({
    pickup, radiusMeters: widerRadius, exclude: alreadyAsked,
  });

  order.dispatch.radiusMeters = widerRadius;

  if (found.length) {
    console.log(
      `${BADGE} ${orderNumber} widened to ${(widerRadius / 1000).toFixed(1)}km — `
      + `${found.length} newly-in-range rider(s)`,
    );
    await broadcastOffers(order, found);
  } else {
    await order.save();
  }

  const session = sessions.get(orderNumber) || { timers: [] };
  sessions.set(orderNumber, session);
  scheduleWidening(order, session);
}

/* ── Starting a search ────────────────────────────────────────────────────*/

/**
 * Begin looking for a rider — or reach further, if one is already running.
 *
 * Called from four places: the kitchen accepting an order, the kitchen
 * marking a still-unassigned-or-still-searching order ready (see
 * `foodOrder.controller.js`'s own comment on why `searching` counts too — a
 * broadcast with no per-rider timeout can sit there with nobody having
 * answered at all), a rider releasing a job back, and the restart backstop.
 * Re-entering while a search is already `searching` is normal now rather
 * than refused — see `widen`, which is the usual reason it happens — so
 * this only ever refuses an order that genuinely should not be searched at
 * all.
 *
 * Resolves to a small report rather than throwing. Every caller is midway
 * through a request that has already succeeded — the order WAS accepted, the
 * rider WAS released — and a dispatcher that threw would undo a write that
 * was correct. So a failure here is a logged reason and an order in the
 * `unassigned` state, which is a state the product knows how to show.
 */
async function startDispatch(orderNumber, { reason = 'accepted' } = {}) {
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

    const pickup = await pickupPointOf(order);
    if (!pickup) {
      await failSweep(order, 'the restaurant has not dropped a map pin, so nobody can be sent');
      return { started: false, reason: 'restaurant has no location' };
    }

    /* Every rider this order has EVER offered, whatever the outcome — a
       fresh sweep must not re-offer somebody who already declined, is still
       holding an offer from an earlier round, or lost the job to somebody
       else. Read off the order rather than held in the session, so it
       survives a restart mid-broadcast. */
    const alreadyAsked = (order.dispatch.offers || []).map((offer) => offer.driverId);
    /*
     * Never narrower than whatever this order has already searched.
     *
     * A fresh top-level call — the kitchen accepting, a rider releasing the
     * job back, the "food is ready" retry — used to recompute the radius
     * from `promisedMinutes` alone, which SHRINKS it back down whenever a
     * `widen` step had already grown it past that. A rider found only
     * because the search had widened to 10km, who then accepted and dropped
     * the job, would otherwise make the retry search 6.7km again — throwing
     * away ground a widen step had already paid for, on the exact order that
     * most needs the wider net (it has already failed or been given back
     * once). `dispatch.radiusMeters` is the highest-water mark; this can
     * only ever match or exceed it.
     */
    const radiusMeters = Math.max(radiusFromMinutes(order.promisedMinutes), order.dispatch.radiusMeters || 0);

    const candidates = await findCandidatesWithinRadius({
      pickup, radiusMeters, exclude: alreadyAsked,
    });

    order.dispatch.attempts += 1;
    order.dispatch.radiusMeters = radiusMeters;
    /* When the search FIRST began, and left alone by every later sweep. It used
       to be overwritten each time, so an order that found nobody at Accept and
       was retried at Ready told the diner it had started looking at Ready —
       minutes after it actually had. `attempts` is what says it has been
       tried again. */
    if (!order.dispatch.startedAt) order.dispatch.startedAt = new Date();
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
    order.dispatch.candidateCount = candidates.length;
    await order.save();

    console.log(
      `${BADGE} ${number} searching (${reason}) · sweep ${order.dispatch.attempts}/${MAX_SWEEPS} · `
      + `${candidates.length} candidate(s) within ${(radiusMeters / 1000).toFixed(1)}km`,
    );

    /* The diner is told the search began. This is the "finding you a rider"
       state on the tracking screen, and it must appear before any offer goes
       out or the screen sits on "order placed" until the first one lands. */
    realtime.toOrderParties(order, 'dispatch_update', dispatchUpdate(order, {
      candidateCount: candidates.length,
    }));

    /* A round already running for this order (a widen mid-flight) gets its
       pending timers cleared before a fresh one is booked below — this call
       is starting the search over from a clean radius, not adding to a
       schedule that is still ticking. */
    clearSession(number);
    const session = { timers: [] };
    sessions.set(number, session);

    await broadcastOffers(order, candidates);
    scheduleWidening(order, session);

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
 * protection: the order must still be searching, must still have no rider,
 * and must still carry an `offered` row for this rider. Whoever's accept
 * reaches Mongo first wins — the same rule whether two riders tap within a
 * millisecond of each other or one accepts an hour after the other declined.
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
    /* Told apart so the app can say something true. "Somebody else took it"
       and "that order was cancelled" feel very different to a rider, and
       one message for both is how they come to believe the button is
       broken. */
    const current = await FoodOrder.findOne({ orderNumber: number })
      .select('orderNumber dispatch.state delivery.driverId status').lean();

    if (!current) return { ok: false, code: 'NOT_FOUND', message: 'That delivery no longer exists.' };
    if (current.delivery && current.delivery.driverId) {
      return { ok: false, code: 'TAKEN', message: 'Another rider took this one.' };
    }
    if (['cancelled', 'rejected'].includes(current.status)) {
      return { ok: false, code: 'ORDER_CLOSED', message: 'That order was cancelled.' };
    }
    return { ok: false, code: 'OFFER_EXPIRED', message: 'That offer is no longer open.' };
  }

  /* Distance is copied from the offer that was accepted rather than
     recomputed — it is what the rider decided on. */
  const accepted = (claimed.dispatch.offers || [])
    .filter((offer) => offer.driverId === driver.driverId && offer.outcome === 'accepted')
    .pop();
  if (accepted) {
    claimed.delivery.acceptedFromMeters = accepted.distanceMeters || 0;
  }

  /* Everybody else still holding this offer is told it is gone — a broadcast
     rewards being first, but it must not leave the other N-1 riders staring
     at a live-looking offer for an order that already has somebody. */
  const others = (claimed.dispatch.offers || [])
    .filter((offer) => offer.driverId !== driver.driverId && offer.outcome === 'offered')
    .map((offer) => offer.driverId);

  if (others.length) {
    for (const offer of claimed.dispatch.offers) {
      if (others.includes(offer.driverId) && offer.outcome === 'offered') {
        offer.outcome = 'superseded';
        offer.respondedAt = now;
      }
    }
  }
  await claimed.save();

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

  for (const otherId of others) {
    realtime.toDriver(otherId, 'delivery_offer_closed', { orderNumber: number, reason: 'taken' });
    notifier.notifyDriverOfferClosed(otherId, number, 'taken').catch(() => {});
  }

  /* Everybody who is watching, in one call — the diner sees a rider, the
     kitchen sees who is coming, the rider sees their own job. */
  realtime.toOrderParties(claimed, 'dispatch_update', dispatchUpdate(claimed));
  notifier.notifyCustomerOfRider(claimed, driver).catch(() => {});

  return { ok: true, order: claimed };
}

/**
 * A rider says no.
 *
 * Just a record now, not a handoff — there is no "next in line" to advance
 * to, because everyone who was ever going to be asked in this round was
 * already asked at the same time. What a decline actually does is make sure
 * a later widen step, or the next full sweep, does not offer this rider the
 * same order again.
 */
async function declineOffer(orderNumber, driverId, reason = '') {
  const number = String(orderNumber || '').trim().toUpperCase();

  await recordOutcome(number, driverId, 'declined', reason);
  realtime.toDriver(driverId, 'delivery_offer_closed', { orderNumber: number, reason: 'declined' });

  console.log(`${BADGE} ${number} declined by ${driverId}${reason ? ` — ${reason}` : ''}`);

  return { ok: true };
}

/* ── Ending a search from outside ─────────────────────────────────────────*/

/**
 * The order stopped being deliverable — cancelled by the diner, rejected by
 * the kitchen.
 *
 * Every rider currently holding an open offer is told explicitly — with a
 * broadcast that can mean several people, not the one it used to. Without
 * this their screens keep showing a live "New delivery" card for an order
 * that no longer exists, and a rider who taps Accept into a refusal reads it
 * as the app being broken rather than as the order being gone.
 */
async function cancelDispatch(orderNumber, reason = 'The order was cancelled') {
  const number = String(orderNumber || '').trim().toUpperCase();

  const order = await FoodOrder.findOne({ orderNumber: number });
  if (order) {
    const stillOpen = order.dispatch.offers.filter((offer) => offer.outcome === 'offered');
    if (stillOpen.length) {
      const now = new Date();
      for (const offer of stillOpen) {
        offer.outcome = 'cancelled';
        offer.respondedAt = now;
      }
      await order.save();
      for (const offer of stillOpen) {
        realtime.toDriver(offer.driverId, 'delivery_offer_closed', { orderNumber: number, reason: 'cancelled' });
        notifier.notifyDriverOfferClosed(offer.driverId, number, 'cancelled').catch(() => {});
      }
    }
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
     them — `startDispatch` reads every past offer regardless of outcome, so
     the outcome is rewritten to `declined` rather than left as `accepted`. */
  await order.save();
  await recordOutcomeForce(number, driverId, 'declined', reason);

  await Driver.updateOne(
    { driverId },
    { $set: { isAvailable: true, currentOrderNumber: null } },
  );

  console.warn(`${BADGE} ${number} released by ${driverId} — ${reason}`);
  realtime.toOrderParties(order, 'dispatch_update', dispatchUpdate(order, { failureReason: reason }));

  /* Straight back out to a fresh broadcast. The food is cooked or cooking and
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
 * No expiry to recompute any more — an offer is either still `offered` in the
 * database or it is not, and there is no countdown for a restart to have
 * silently outlived.
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

  const readyAt = readyAtFor(order);
  return {
    ...riderView(order, { revealed: false, distanceMeters: offer.distanceMeters }),
    etaMinutes: Math.round(riderEtaMinutes(offer.distanceMeters)),
    readyAt: readyAt ? readyAt.toISOString() : null,
  };
}

/**
 * Re-arm the widen schedule for orders whose timers this process lost.
 *
 * A `searching` order with no session in THIS process is one of two things:
 * a restart wiped its widen timers, or another process is handling it (see
 * the header on running more than one). Either way, booking a fresh
 * schedule for it here is safe — `scheduleWidening` only ever asks "is there
 * still a sensible moment to check again before Ready," recomputed from
 * whatever time is left, so it cannot double-book a step that already ran
 * elsewhere; the worst case is one extra widen check on a process that was
 * never actually behind, which costs one query.
 *
 * Cheap by construction: `dispatch.state` is indexed and almost every order
 * is `idle` or `assigned`, so the index this scans is nearly empty.
 */
async function sweepStalledDispatch() {
  if (mongoose.connection.readyState !== 1) return 0;

  const stalled = await FoodOrder.find({ 'dispatch.state': 'searching' })
    .select('orderNumber promisedMinutes statusHistory').limit(50).lean();

  let resumed = 0;
  for (const row of stalled) {
    if (sessions.has(row.orderNumber)) continue;

    console.warn(`${BADGE} ${row.orderNumber} has no widen schedule in this process — rebooking`);
    const session = { timers: [] };
    sessions.set(row.orderNumber, session);
    scheduleWidening(row, session);
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
  /* Exported for the verification script, so it can assert a broadcast
     actually reached every candidate without waiting real minutes for a
     widen timer to fire. */
  _sessions: sessions,
  _radiusFromMinutes: radiusFromMinutes,
  _readyAtFor: readyAtFor,
  PLANNING_SPEED_KMH,
};
