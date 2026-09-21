/* ══════════════════════════════════════════════════════════════════════════
   The rider's half of an order — take it, carry it, hand it over.

   Behind an APPROVED rider session, and scoped to `req.driver.driverId` in
   exactly the way the partner handlers are scoped to their restaurantId: every
   lookup filters on the rider FROM THE TOKEN as well as the order number,
   never on the number alone. An order number is six digits and is read out in
   a kitchen — guessing one must not be enough to read a stranger's address or
   to mark somebody else's delivery complete.

     GET   /me/offer                  the offer being held right now (poll)
     POST  /orders/:number/accept     take it
     POST  /orders/:number/decline    pass, and let the next rider have the time
     GET   /me/orders/active          what I am carrying
     PATCH /orders/:number/status     picked_up, then delivered
     POST  /orders/:number/release    I cannot finish this — send it back out
     GET   /me/orders                 what I have carried

   ## Both hand-overs are gated on a code the OTHER party holds

   `picked_up` needs the kitchen's `pickupCode`; `delivered` needs the diner's
   `deliveryOtp`. Neither code is a credential and neither opens anything — see
   the note on the model. What they prove is that the two people were standing
   in the same place, which is exactly the claim a hand-over makes and exactly
   the claim a rider tapping a button on a scooter three streets away does not.

   The codes are checked against ONE order, not looked up, so four digits is
   enough: an attacker gets a handful of tries against a specific order before
   the mismatch is visible in the history, and the thing they win is having
   marked a delivery complete that a diner will immediately dispute.

   ## The two sides of "busy" are set together, always

   Accepting sets `isAvailable: false` and `currentOrderNumber`; delivering,
   releasing and cancelling set them back. They are written in the same handler
   as the order's own change every time, because a rider left `isAvailable:
   false` after a completed order silently stops getting work and nothing in
   the product would say why.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const FoodOrder = require('../foodpartners/foodOrder.model');
const FoodRestaurant = require('../foodpartners/foodRestaurant.model');
const Driver = require('./driver.model');
const dispatch = require('./foodDispatch.service');
const realtime = require('../../infrastructure/realtime/realtime');
const notifier = require('./dispatch.notifier');

const { ALLOWED_RIDER_TRANSITIONS, riderView, restaurantSnapshot } = FoodOrder;

const fail = (res, status, code, message) => res.status(status).json({
  success: false, code, message, error: message,
});

const dbDown = (res) => fail(
  res, 503, 'DB_DISCONNECTED', 'The server is running but not connected to the database.',
);

/* Deliberately identical for "no such order" and "not your order" — the same
   rule the partner controller follows, for the same reason. */
const notFound = (res) => fail(res, 404, 'NOT_FOUND', 'We could not find that delivery.');

const isUp = () => mongoose.connection.readyState === 1;

const numberOf = (req) => String(req.params.orderNumber || '').trim().toUpperCase();

/* The one question everything below turns on, asked in one place so that the
   page path and the single-order path cannot drift apart on the answer. */
const hasStoredKitchen = (order) => Boolean(order && order.restaurant && order.restaurant.name);

/*
 * ── The kitchen's name, for orders older than the field ──────────────────
 *
 * An order written today carries `restaurant: { name, address, phone }`,
 * snapshotted at placement, and `riderView` reads it straight off the row —
 * no query, and nothing that can change under a job that is already out.
 *
 * Orders placed BEFORE that field existed carry an empty one, and they are
 * the reason this section exists. A rider opening the app to a job they
 * took yesterday would otherwise get a card headed `FP-XXXXXXXX` and a call
 * button that dials nothing, which is worse than the row being old.
 *
 * So the lookup runs only when the snapshot is missing, which on a healthy
 * database is never. It is deliberately NOT written back: a GET that repairs
 * rows is a write on a read path, and the value it would save is one a
 * restaurant may have changed since — the point of a snapshot is that it was
 * taken at placement, and there is no placement to take one at any more.
 * A restaurant that has since been deleted resolves to nothing, and the view
 * answers with the empty strings the app already draws.
 */
const kitchenFor = async (order) => {
  if (!order || !order.restaurantId) return null;
  if (hasStoredKitchen(order)) return null;

  const row = await FoodRestaurant.findOne({ restaurantId: order.restaurantId })
    .select('restaurantName address contactNumber').lean();
  return row ? restaurantSnapshot(row) : null;
};

/** The same question for a page of orders, in ONE query rather than fifty. */
const kitchensFor = async (orders) => {
  const wanted = [...new Set(orders
    .filter((order) => !hasStoredKitchen(order))
    .map((order) => order.restaurantId)
    .filter(Boolean))];

  if (!wanted.length) return new Map();

  const rows = await FoodRestaurant.find({ restaurantId: { $in: wanted } })
    .select('restaurantId restaurantName address contactNumber').lean();
  return new Map(rows.map((row) => [row.restaurantId, restaurantSnapshot(row)]));
};

/*
 * The map keyed by restaurantId, read back for ONE row — and only for a row
 * that has no snapshot of its own.
 *
 * The gate has to be re-applied here because the map is keyed by restaurant,
 * not by order. One page of history can easily hold two deliveries from the
 * same kitchen, one placed before the snapshot field existed and one after;
 * the first puts that restaurant's CURRENT name and address into the map, and
 * handing that to `riderView` for the second would overwrite the second's own
 * snapshot, because `riderView` prefers the value it is passed over
 * `doc.restaurant`. The rider would then see a kitchen's new name on an old
 * delivery to an address it has since moved away from. A stored snapshot is
 * the record of what the place was called at the time and always wins.
 */
const kitchenFromPage = (kitchens, order) => {
  if (!order || hasStoredKitchen(order)) return null;
  return kitchens.get(order.restaurantId) || null;
};

/* ── GET /me/offer ────────────────────────────────────────────────────────*/

/**
 * The offer this rider is holding right now, if any.
 *
 * The socket is how an offer normally arrives; this is the fallback, and it is
 * a real one rather than a courtesy. A rider in a lift, on a train, or on a
 * deployment where socket.io was never installed gets their work through this
 * route and nothing else. `null` data is the ordinary answer — most polls find
 * nothing, and that is not an error.
 */
const getMyOffer = async (req, res, next) => {
  try {
    if (!isUp()) return dbDown(res);
    const offer = await dispatch.currentOfferFor(req.driver.driverId);
    return res.json({ success: true, data: offer });
  } catch (error) {
    return next(error);
  }
};

/* ── POST /orders/:orderNumber/accept ─────────────────────────────────────*/

/**
 * Take the job.
 *
 * Every check that matters lives in `foodDispatch.acceptOffer`, in one atomic
 * update — see the note there. This handler is the HTTP shape around it, and
 * deliberately does not pre-check anything the claim already checks: a
 * "still available?" read before the write would be a read whose answer is
 * stale by the time the write runs, and would make the race look handled when
 * it was not.
 */
const acceptOrder = async (req, res, next) => {
  try {
    if (!isUp()) return dbDown(res);

    const result = await dispatch.acceptOffer(numberOf(req), req.driver);
    if (!result.ok) {
      /* 409 for every refusal rather than 404 for some of them: the rider's
         app shows one "that one got away" screen, and splitting the status
         codes only makes the client branch on something the `code` already
         says. */
      return fail(res, result.code === 'NOT_FOUND' ? 404 : 409, result.code, result.message);
    }

    return res.json({
      success: true,
      message: 'The delivery is yours.',
      data: riderView(result.order, {
        revealed: true,
        restaurant: await kitchenFor(result.order),
      }),
    });
  } catch (error) {
    return next(error);
  }
};

/* ── POST /orders/:orderNumber/decline ────────────────────────────────────*/

/**
 * Pass.
 *
 * Answers 200 even when the offer had already moved on. Declining is not a
 * request that can fail from the rider's point of view — they have said no,
 * and telling them their "no" was rejected is noise about a thing they no
 * longer care about. The dispatcher records it either way, because a rider who
 * declines everything is worth seeing in the data.
 */
const declineOrder = async (req, res, next) => {
  try {
    if (!isUp()) return dbDown(res);

    const reason = String((req.body || {}).reason || '').trim().slice(0, 200);
    await dispatch.declineOffer(numberOf(req), req.driver.driverId, reason);
    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
};

/* ── GET /me/orders/active ────────────────────────────────────────────────*/

/**
 * What this rider is carrying.
 *
 * Read from `food_orders` rather than trusting `currentOrderNumber`, which is
 * a denormalised convenience: the two are written together, but the order is
 * the one that decides. A rider whose `currentOrderNumber` points at an order
 * that was cancelled underneath them gets `null` here and a freed flag, which
 * is the state they should actually be in.
 */
const getActiveOrder = async (req, res, next) => {
  try {
    if (!isUp()) return dbDown(res);

    const order = await FoodOrder.findOne({
      'delivery.driverId': req.driver.driverId,
      status: { $in: ['placed', 'accepted', 'preparing', 'ready', 'picked_up'] },
    }).sort({ placedAt: -1 });

    if (!order) {
      /* Self-healing: the flag said busy and no order agrees. Clearing it here
         costs one write on a path that runs at most once per app open, and the
         alternative is a rider who is invisible to dispatch until somebody
         edits the database. */
      if (req.driver.currentOrderNumber) {
        await Driver.updateOne(
          { driverId: req.driver.driverId },
          { $set: { currentOrderNumber: null, isAvailable: true } },
        );
      }
      return res.json({ success: true, data: null });
    }

    return res.json({
      success: true,
      data: riderView(order, { revealed: true, restaurant: await kitchenFor(order) }),
    });
  } catch (error) {
    return next(error);
  }
};

/* ── PATCH /orders/:orderNumber/status ────────────────────────────────────*/

/**
 * The two hand-overs.
 *
 * `ALLOWED_RIDER_TRANSITIONS` is the whole rule and it is enforced here rather
 * than trusted from the body, exactly as the partner's own transitions are.
 * The refusal names both the current state and what IS possible from it,
 * because "forbidden" alone leaves the app with nothing to show a rider who
 * has just tapped a button that did nothing.
 */
const setOrderStatus = async (req, res, next) => {
  try {
    if (!isUp()) return dbDown(res);

    const orderNumber = numberOf(req);
    const wanted = String((req.body || {}).status || '').trim();
    const code = String((req.body || {}).code || '').trim();

    const order = await FoodOrder.findOne({ orderNumber, 'delivery.driverId': req.driver.driverId });
    if (!order) return notFound(res);

    const allowed = ALLOWED_RIDER_TRANSITIONS[order.status] || [];
    if (!allowed.includes(wanted)) {
      const message = allowed.length
        ? `A delivery that is "${order.status}" can only move to: ${allowed.join(', ')}.`
        : order.status === 'preparing' || order.status === 'accepted'
          ? 'The kitchen has not finished this order yet. Wait for it to be marked ready.'
          : `A delivery that is "${order.status}" cannot be changed by the rider.`;
      return fail(res, 409, 'INVALID_TRANSITION', message);
    }

    /* The code check. Compared against this one order's own value — see the
       header on why four digits is enough for what this actually proves.

       A MISSING expected code refuses rather than waving the move through.
       Today it is unreachable (both codes are minted at placement, and the one
       order shape without a `deliveryOtp` is a pickup, which never gets a
       rider) — but `if (expected && ...)` would have meant that the day an
       order reached here without one, every hand-over on it passed unchecked.
       A guard whose failure mode is "stop checking" is the wrong way round. */
    const expected = wanted === 'picked_up' ? order.pickupCode : order.deliveryOtp;
    if (!expected) {
      return fail(
        res, 409, 'NO_HANDOVER_CODE',
        'This order has no hand-over code. Please call Lampose support before handing anything over.',
      );
    }
    if (code !== expected) {
      return fail(
        res, 409, 'CODE_INCORRECT',
        wanted === 'picked_up'
          ? 'That is not the pickup code. Ask the restaurant to read it out again.'
          : 'That is not the delivery PIN. Ask the customer to read it out again.',
      );
    }

    const now = new Date();
    order.status = wanted;
    order.statusHistory.push({ status: wanted, at: now, by: 'rider' });

    if (wanted === 'picked_up') {
      order.delivery.pickedUpAt = now;
    }

    if (wanted === 'delivered') {
      order.delivery.deliveredAt = now;
      /* Cash collected at the door is the moment the order is paid. An online
         order is already `paid` and is left alone — overwriting it here would
         move `razorpay.paidAt` to the doorstep. */
      if (order.paymentMode === 'cod' && order.paymentStatus === 'pending') {
        order.paymentStatus = 'paid';
      }
    }

    await order.save();

    if (wanted === 'delivered') {
      /* Both sides of "busy", together — see the header. */
      await Driver.updateOne(
        { driverId: req.driver.driverId },
        { $set: { isAvailable: true, currentOrderNumber: null } },
      );
      console.log(
        `🛵 [dispatch] ${orderNumber} DELIVERED by ${req.driver.driverId} `
        + `· ₹${order.delivery.earnings} earned`,
      );
    }

    realtime.toOrderParties(order, 'dispatch_update', dispatch.dispatchUpdate(order));
    notifier.notifyCustomerOfHandover(order, wanted).catch(() => {});

    return res.json({
      success: true,
      data: riderView(order, { revealed: true, restaurant: await kitchenFor(order) }),
    });
  } catch (error) {
    return next(error);
  }
};

/* ── POST /orders/:orderNumber/release ────────────────────────────────────*/

/**
 * "I cannot finish this."
 *
 * A real thing that happens — a breakdown, an accident, a road closed — and
 * the product needs a way to say it that is not "go offline and disappear".
 * The order goes straight back to the dispatcher and out to the next rider;
 * the food exists and the diner has paid, so every minute spent deciding what
 * to do about it is a cold meal.
 *
 * Refused after `picked_up` on purpose: the rider is holding the food, and
 * handing that back is a conversation with support rather than a button. The
 * message says so instead of leaving them tapping.
 */
const releaseOrder = async (req, res, next) => {
  try {
    if (!isUp()) return dbDown(res);

    const orderNumber = numberOf(req);
    const order = await FoodOrder.findOne({ orderNumber, 'delivery.driverId': req.driver.driverId })
      .select('orderNumber status').lean();
    if (!order) return notFound(res);

    if (['picked_up', 'delivered'].includes(order.status)) {
      return fail(
        res, 409, 'ALREADY_COLLECTED',
        'You are already carrying this food. Call Lampose support so we can sort it out with the customer.',
      );
    }

    const reason = String((req.body || {}).reason || 'The rider could not complete it').trim().slice(0, 200);
    const result = await dispatch.releaseRider(orderNumber, req.driver.driverId, reason);
    if (!result.ok) return fail(res, 409, result.code, result.message);

    return res.json({
      success: true,
      message: result.restarted
        ? 'Released. We are finding another rider.'
        : 'Released. Our team will find another rider.',
    });
  } catch (error) {
    return next(error);
  }
};

/* ── GET /me/orders ───────────────────────────────────────────────────────*/

/**
 * What this rider has carried, newest first.
 *
 * `skip` pages back through it — 0 by default, so an old caller that never
 * sends it keeps getting exactly the first 50 it always did. `total` travels
 * alongside so the app can say "that's all of it" rather than a rider paging
 * forever into an empty reply, or never learning there was more than 50 to
 * begin with.
 */
const listMyOrders = async (req, res, next) => {
  try {
    if (!isUp()) return dbDown(res);

    const limit = Math.min(Number(req.query.limit) || 50, 50);
    const skip = Math.max(Number(req.query.skip) || 0, 0);
    const filter = { 'delivery.driverId': req.driver.driverId };

    const [orders, total] = await Promise.all([
      FoodOrder.find(filter).sort({ placedAt: -1 }).skip(skip).limit(limit),
      FoodOrder.countDocuments(filter),
    ]);

    const kitchens = await kitchensFor(orders);

    return res.json({
      success: true,
      count: orders.length,
      total,
      data: orders.map((order) => riderView(order, {
        revealed: true,
        restaurant: kitchenFromPage(kitchens, order),
      })),
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getMyOffer,
  acceptOrder,
  declineOrder,
  getActiveOrder,
  setOrderStatus,
  releaseOrder,
  listMyOrders,
};
