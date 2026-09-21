/* ══════════════════════════════════════════════════════════════════════════
   The partner's orders — list, read one, and move one forward.

   Behind a food-partner session, and scoped to `req.foodPartner.restaurantId`
   exactly as the menu handlers are: every lookup filters on the restaurantId
   FROM THE TOKEN as well as the order number, never on the number alone. An
   order number is six digits and is read down a phone line, which is what
   makes it a poor secret — guessing one must not be enough to read somebody
   else's customer's address.

   ## An unpaid online order is not in this queue

   An order whose diner chose online payment and has not completed it exists as
   a row and is deliberately invisible here — see the note in
   `foodCustomerOrder.controller.js`. A kitchen that started cooking on one
   would be cooking on a promise, and the diner who abandoned the UPI screen is
   not coming back. Cash orders appear immediately, because cash is owed at the
   door and the order is real the moment it is placed.

   ## A restaurant may only make the moves that are its own

   `ALLOWED_PARTNER_TRANSITIONS` in the model is the whole rule, and it is
   enforced here rather than trusted from the body. `picked_up` and `delivered`
   belong to the rider; `cancelled` belongs to the customer. A kitchen that
   could set them would be reporting a hand-over that never happened.

   ## `ready` is also a dispatch event

   Marking an order ready is the second chance for an order nobody took: the
   first sweep ran when it was placed, and by the time the food is cooked the
   riders on the road are different people. So `ready` retries the dispatcher
   for an order sitting at `unassigned`, and only for that one — an order that
   already has a rider is left alone.

   ## Accepting a WEBSITE order can also say who delivers

   `deliveryBy: 'self' | 'driver'` on an accept is the restaurant choosing how
   the order reaches the diner — see `foodDelivery.service.js`. With it, the
   automatic rider search is NOT started (the restaurant, or the delivery desk
   it asked, is bringing it), and the same call can be made later on its own
   (`setDeliveryMethod`) to choose after the fact or to resend a WhatsApp that
   did not go out.

   ONLY for an order placed on the website (`channel: 'web'`). An order placed
   in the app is accepted exactly as it always was — the dispatcher searches for
   a real driver and the driver's own app takes it from there — and a
   `deliveryBy` that arrives with one is ignored rather than refused, so an
   older console that sends it for every order does not break the app's flow.
   Likewise an accept from the partner app, which sends no choice: the search
   starts, on whatever the order's channel.

   An order the restaurant arranged has no rider account to say the delivery boy
   has taken it, so the restaurant does (`picked_up`) — `partnerMovesFor` in the
   model is the rule. It goes no further: "delivered" is the DINER's to say, on
   the website, or the Lampose admin's for one the diner never closed.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const FoodOrder = require('./foodOrder.model');
const FoodRestaurant = require('./foodRestaurant.model');
const { markForRefund } = require('./foodPayment.controller');
const { logError } = require('./foodPartner.log');
const foodDelivery = require('./foodDelivery.service');

const {
  ORDER_STATUSES, DELIVERY_METHODS, partnerView, partnerMovesFor, restaurantSnapshot, isWebDelivery,
} = FoodOrder;

/**
 * The rows a kitchen may see.
 *
 * One predicate, used by both the list and the tab counts, so a badge can
 * never disagree with the list it labels. See the header on why an unpaid
 * online order is excluded.
 */
const visibleToKitchen = (restaurantId) => ({
  restaurantId,
  $or: [
    { paymentMode: 'cod' },
    { paymentStatus: { $in: ['paid', 'refunded'] } },
  ],
});

const LIST_LIMIT = 50;

const fail = (res, status, code, message) => res.status(status).json({
  success: false, code, message, error: message,
});

const dbDown = (res) => fail(
  res,
  503,
  'DB_DISCONNECTED',
  'The server is running but not connected to the database.',
);

/* Deliberately identical for "no such order" and "not your order" — see the
   file-top note. */
const notFound = (res) => fail(res, 404, 'NOT_FOUND', 'We could not find that order.');

const isUp = () => mongoose.connection.readyState === 1;

// @route   GET /api/v2/food-partners/me/orders
// @desc    This restaurant's orders, newest first, optionally by status
// @access  Food-partner session
const listMyOrders = async (req, res, next) => {
  try {
    if (!isUp()) return dbDown(res);

    const { restaurantId } = req.foodPartner;
    const filter = visibleToKitchen(restaurantId);

    /* Two shapes accepted, because the app's tabs are groups rather than
       single states: `?status=accepted` and `?status=placed,accepted`. */
    const asked = String(req.query.status || '').trim();
    if (asked) {
      const wanted = asked.split(',').map((s) => s.trim()).filter((s) => ORDER_STATUSES.includes(s));
      if (wanted.length) filter.status = { $in: wanted };
    }

    const limit = Math.min(Number(req.query.limit) || LIST_LIMIT, LIST_LIMIT);

    const orders = await FoodOrder.find(filter).sort({ placedAt: -1 }).limit(limit).lean();

    /* A tally per status, so the app's tab badges do not need a request each.
       Cheap: it is one grouped count over an indexed field. Matched on the
       same predicate as the list above, so a badge cannot count an order the
       tab it labels will not show. */
    const grouped = await FoodOrder.aggregate([
      { $match: visibleToKitchen(restaurantId) },
      { $group: { _id: '$status', n: { $sum: 1 } } },
    ]);
    const counts = grouped.reduce((acc, row) => ({ ...acc, [row._id]: row.n }), {});

    return res.json({
      success: true, count: orders.length, counts, data: orders.map(partnerView),
    });
  } catch (error) {
    logError('me/orders', error);
    return next(error);
  }
};

// @route   GET /api/v2/food-partners/me/orders/:orderNumber
// @desc    One order in full, for the detail screen
// @access  Food-partner session (owner of the order only)
const getMyOrder = async (req, res, next) => {
  try {
    if (!isUp()) return dbDown(res);

    const order = await FoodOrder.findOne({
      restaurantId: req.foodPartner.restaurantId,
      orderNumber: String(req.params.orderNumber || '').trim(),
    }).lean();

    if (!order) return notFound(res);

    return res.json({ success: true, data: partnerView(order) });
  } catch (error) {
    logError('me/orders/:orderNumber', error);
    return next(error);
  }
};

// @route   PATCH /api/v2/food-partners/me/orders/:orderNumber/status
// @desc    Move one order forward through the states a kitchen owns
// @access  Food-partner session (owner of the order only)
const setOrderStatus = async (req, res, next) => {
  try {
    if (!isUp()) return dbDown(res);

    const { restaurantId } = req.foodPartner;
    const orderNumber = String(req.params.orderNumber || '').trim();
    const next_ = String((req.body || {}).status || '').trim();

    if (!ORDER_STATUSES.includes(next_)) {
      return fail(res, 400, 'BAD_INPUT', `"status" must be one of: ${ORDER_STATUSES.join(', ')}.`);
    }

    /* Who delivers, chosen as the order is accepted. Refused when it is not one
       of the two answers rather than quietly ignored: a typo there would mean
       an accept that starts the automatic rider search the restaurant meant to
       skip. Empty is fine — that is the older apps' accept. */
    const deliveryBy = String((req.body || {}).deliveryBy || '').trim();
    if (deliveryBy && !DELIVERY_METHODS.includes(deliveryBy)) {
      return fail(res, 400, 'BAD_INPUT', `"deliveryBy" must be one of: ${DELIVERY_METHODS.join(', ')}.`);
    }

    const order = await FoodOrder.findOne({ restaurantId, orderNumber });
    if (!order) return notFound(res);

    const allowed = partnerMovesFor(order);
    if (!allowed.includes(next_)) {
      /* Naming both the current state and what IS possible from it, because
         "forbidden" alone leaves the app with nothing to show a cook who has
         just tapped a button that did nothing. */
      const message = allowed.length
        ? `An order that is "${order.status}" can only move to: ${allowed.join(', ')}.`
        : `An order that is "${order.status}" cannot be changed from the restaurant.`;
      return fail(res, 409, 'INVALID_TRANSITION', message);
    }

    /* "The delivery boy has taken it", on an order the restaurant arranged. The
       time is written with the move so the diner's page can say when. Only such
       an order reaches here with `picked_up` — `partnerMovesFor` offers it to
       nobody else. */
    if (next_ === 'picked_up') foodDelivery.markPickedUp(order);

    order.status = next_;
    if (next_ === 'rejected') {
      order.rejectionReason = String((req.body || {}).reason || '').trim().slice(0, 300);
    }
    if (next_ === 'accepted') {
      const minutes = Number((req.body || {}).promisedMinutes);
      if (Number.isFinite(minutes) && minutes > 0) order.promisedMinutes = Math.min(minutes, 240);
    }
    order.statusHistory.push({ status: next_, at: new Date(), by: 'partner' });

    /* A rejected order carries a rider who has nothing to collect. They come
       off here, in the same save as the status. */
    const strandedDriverId = next_ === 'rejected' && order.delivery && order.delivery.driverId
      ? order.delivery.driverId
      : null;
    if (strandedDriverId) {
      order.delivery.driverId = '';
      order.delivery.assignedAt = null;
      order.dispatch.state = 'idle';
    }

    /*
     * An order older than the restaurant snapshot picks one up here.
     *
     * `restaurant: { name, address, phone }` is written at placement and is
     * what the Driver app heads a job card with. Orders placed before the
     * field existed have an empty one, and the dispatcher builds its OFFER
     * from the row as stored — so an order that is only now being cooked would
     * go out to riders titled `FP-XXXXXXXX` with a call button that dials
     * nothing.
     *
     * Filled in the save that is already happening rather than by a migration:
     * this runs on the kitchen's own transitions, which is exactly the moment
     * before an order is offered or re-offered, and a migration that fails
     * half way through leaves the two halves of the fleet seeing different
     * cards. A restaurant that has since gone leaves it empty, which is the
     * honest answer and the one every reader is built for.
     */
    if (!(order.restaurant && order.restaurant.name)) {
      const row = await FoodRestaurant.findOne({ restaurantId })
        .select('restaurantName address contactNumber').lean();
      if (row) order.restaurant = restaurantSnapshot(row);
    }

    await order.save();

    /* ── What the move means to the rest of the flow ───────────────────────
       Required late so this module does not take a load-time dependency on the
       driver module: the two are separate features and one must be removable
       without the other failing to boot. */
    // eslint-disable-next-line global-require
    const dispatch = require('../drivers/foodDispatch.service');
    // eslint-disable-next-line global-require
    const realtime = require('../../infrastructure/realtime/realtime');
    // eslint-disable-next-line global-require
    const notifier = require('../drivers/dispatch.notifier');

    if (next_ === 'rejected') {
      /* A driver already asked for on WhatsApp is told not to come. */
      if (order.delivery && order.delivery.method === 'driver') foodDelivery.withdrawRequest(order);
      await dispatch.cancelDispatch(order.orderNumber, 'The restaurant could not take this order');
      if (strandedDriverId) {
        // eslint-disable-next-line global-require
        const Driver = require('../drivers/driver.model');
        await Driver.updateOne(
          { driverId: strandedDriverId },
          { $set: { isAvailable: true, currentOrderNumber: null } },
        );
        realtime.toDriver(strandedDriverId, 'delivery_cancelled', {
          orderNumber: order.orderNumber,
          message: 'The restaurant could not take this order.',
        });
      }
      /* Prepaid money is flagged as owed back. Not refunded from here — see
         `markForRefund` on why a button must not move real money by itself. */
      await markForRefund(order, 'the restaurant rejected the order');

      /*
       * And TELL the diner, which nothing did until now.
       *
       * `dispatch_update` below reaches a phone that is on the tracking screen
       * with a live socket, and the User App holds neither — it polls, and
       * only while that one screen is open. Somebody who ordered and put their
       * phone in a pocket learned the kitchen had refused them by waiting for
       * food that was never started.
       *
       * Not awaited, and its failure cannot reach the cook: the rejection is
       * committed, and a handset that could not be rung must not turn a
       * completed decision into an error on the tablet at the pass. The
       * notifier swallows its own problems and logs them — see its header. */
      notifier.notifyCustomerOfRejection(order).catch(() => {});
    }

    /*
     * The search starts HERE now, not at placement.
     *
     * The kitchen has just accepted and, on this same request, quoted how
     * long the food takes — `order.promisedMinutes`, set above. That is the
     * one number `foodDispatch.service.js` converts straight into a search
     * radius: every rider who could plausibly reach this restaurant before
     * the food is ready is broadcast the offer at once, not just the
     * nearest one — see that file's own header for why. `eligibleForDispatch`
     * still refuses a pickup order and an unpaid online one on its own, so
     * this is safe to call unconditionally on every accept — the same
     * pattern the "ready" retry below already uses. Not awaited: a broadcast
     * can still take a moment to resolve, and a cook who has just tapped
     * Accept is waiting for the button to come back, not for a rider to be
     * found.
     */
    /*
     * ...unless the restaurant has said who is bringing it.
     *
     * `deliveryBy` on an accept means the restaurant's own person, or a driver
     * the delivery desk sends — either way NO rider is searched for in the app.
     * That call is awaited, unlike the search: the caller is a person at a
     * screen who must be told whether the WhatsApp went out, and for "self" it
     * is a single write. It never throws — a message that did not go is a
     * report, not an error, and the accept above has already been committed.
     * A pickup order has no delivery to arrange, so the choice is ignored there.
     */
    let arranged = null;
    if (next_ === 'accepted' && isWebDelivery(order) && deliveryBy) {
      arranged = await foodDelivery.arrangeDelivery(orderNumber, deliveryBy, restaurantId);
    } else if (next_ === 'accepted') {
      dispatch.startDispatch(order.orderNumber, { reason: 'accepted' })
        .catch((err) => logError('dispatching a newly accepted order', err));
    }

    /*
     * The second chance for an order nobody has taken YET — see the header.
     *
     * `searching` is included alongside `unassigned` on purpose, and it is
     * the common case now, not the rare one: broadcast dispatch has no
     * per-rider timeout any more, so a round where every notified rider
     * simply never answers — ignored it, phone was face-down, decided
     * against it without tapping Decline — leaves the order sitting at
     * `searching` forever. Nothing else was watching for that: the two
     * scheduled widen checks are the only other thing that reaches further,
     * and both can already have run and found nobody new by the time the
     * kitchen taps Ready. Excluding `searching` here would mean an order
     * whose first broadcast simply went unanswered could never be retried at
     * all — not "slower than it should be", genuinely stuck, with nothing
     * left to move it. `startDispatch` itself still refuses safely if a
     * rider was assigned in the meantime (`eligibleForDispatch`) and never
     * shrinks the radius it has already reached, so calling it again here
     * costs nothing when the order was already in good shape. Not awaited:
     * a broadcast can still take a moment to resolve, and a cook who has
     * just tapped "Ready" is standing at the pass waiting for the button to
     * come back.
     */
    if (next_ === 'ready' && ['searching', 'unassigned'].includes(order.dispatch.state)) {
      dispatch.startDispatch(order.orderNumber, { reason: 'food is ready' })
        .catch((err) => logError('re-dispatching a ready order', err));
    }

    /* The order AS IT NOW STANDS: when a delivery was arranged that is the
       freshly written copy, carrying the method and the WhatsApp's outcome.
       The copy loaded at the top of this handler is older than that, and
       announcing it would put a stale "no driver yet" on the diner's screen
       right after the correct one. */
    const shown = arranged && arranged.ok ? arranged.order : order;

    realtime.toOrderParties(shown, 'dispatch_update', dispatch.dispatchUpdate(shown));

    /* "Your order is on its way" / "Delivered" — the same two nudges the rider's
       own hand-overs send. Best effort: the move is committed. */
    if (next_ === 'picked_up' || next_ === 'delivered') {
      notifier.notifyCustomerOfHandover(shown, next_).catch(() => {});
    }

    return res.json({
      success: true,
      data: partnerView(shown),
      /* What came of the delivery choice, beside the order, so a screen can say
         "accepted — and the driver request could not be sent" in one breath.
         `ok` is whether the choice was recorded; `sent` is whether the desk was
         actually messaged (null for "self", where nobody is). */
      delivery: arranged
        ? {
          method: deliveryBy,
          ok: arranged.ok,
          sent: arranged.ok ? arranged.sent : false,
          message: arranged.ok
            ? (arranged.sent === false ? (shown.delivery.request && shown.delivery.request.error) || 'The WhatsApp could not be sent.' : '')
            : arranged.message,
        }
        : null,
    });
  } catch (error) {
    logError('me/orders/:orderNumber/status', error);
    return next(error);
  }
};

// @route   PATCH /api/v2/food-partners/me/orders/:orderNumber/delivery
//          (and /api/v1/restaurant-admin/orders/:orderNumber/delivery)
// @desc    Choose — or change, or resend — who delivers an accepted order
// @access  Food-partner / restaurant-admin session (owner of the order only)
const setDeliveryMethod = async (req, res, next) => {
  try {
    if (!isUp()) return dbDown(res);

    const method = String((req.body || {}).deliveryBy || '').trim();
    const result = await foodDelivery.arrangeDelivery(
      req.params.orderNumber, method, req.foodPartner.restaurantId,
    );
    if (!result.ok) return fail(res, result.status, result.code, result.message);

    const request = (result.order.delivery && result.order.delivery.request) || {};
    return res.json({
      success: true,
      /* The same envelope an accept answers with, so the console handles both
         with one code path. `sent` is null for "self": nothing was sent. */
      data: partnerView(result.order),
      delivery: {
        method,
        ok: true,
        sent: result.sent,
        message: result.sent === false ? (request.error || 'The WhatsApp could not be sent.') : '',
      },
    });
  } catch (error) {
    logError('me/orders/:orderNumber/delivery', error);
    return next(error);
  }
};

module.exports = {
  listMyOrders, getMyOrder, setOrderStatus, setDeliveryMethod,
};
