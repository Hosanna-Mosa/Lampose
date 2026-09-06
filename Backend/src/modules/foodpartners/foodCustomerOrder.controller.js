/* ══════════════════════════════════════════════════════════════════════════
   A diner placing an order.

   The customer half of `food_orders`, behind an `app_customers` session. The
   restaurant half — reading the queue and moving an order forward — is
   `foodOrder.controller.js`, and the two never share a handler: they are
   different identity systems answering different questions.

   ## EVERY price is re-derived here

   The request says WHAT was ordered — product ids, quantities, a variant name,
   add-on names — and nothing about what any of it costs. Every figure is read
   back out of `food_products` and `food_restaurants` and recomputed on this
   side.

   That is not defensiveness for its own sake. A client that sends its own
   totals is a client that can order a ₹320 biryani for ₹1, and the first time
   it happens the restaurant has cooked the food. The same rule already governs
   the stay-visit flow (`stayIntent.util.js`), for the same reason.

   A line whose product has been deleted, un-listed, or switched out of stock
   since the cart was filled is REFUSED rather than silently dropped. Dropping
   it charges a diner for a smaller order than they thought they placed and
   sends a kitchen a ticket missing a dish somebody is waiting for.

   ## The alert is fired after the write, and cannot undo it

   `notifyRestaurantOfOrder` resolves whether or not a handset was reachable.
   An order that saved but could not ring is still an order; the partner app
   polls its queue and shows it on the next open.

   ## What happens next depends on how it is being paid for

   A CASH order is complete the moment it is written: the kitchen is rung and a
   rider is sent for immediately, because there is nothing left to wait on.

   An ONLINE order is written and then goes quiet. Nobody is rung, no rider is
   sent, and the row sits at `paymentStatus: 'pending'` until a signature says
   the money arrived — see `foodPayment.controller.js`, which owns that step
   and is the only thing in this codebase that may mark an order paid. A
   kitchen that started cooking on an unpaid order would be cooking on a
   promise, and the diner who abandoned the UPI screen is not coming back.

   That is why this handler answers with `nextStep`: the app has to know
   whether to show a tracking screen or a checkout sheet, and deriving it from
   `paymentMode` in three different clients is three chances to get it wrong.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const FoodOrder = require('./foodOrder.model');
const FoodProduct = require('./foodProduct.model');
const FoodRestaurant = require('./foodRestaurant.model');
const { notifyRestaurantOfOrder } = require('./foodOrder.notifier');
const { markForRefund } = require('./foodPayment.controller');
const { BADGE, logError, startTimer } = require('./foodPartner.log');

const {
  makeOrderNumber, makeHandoverCode, customerView, restaurantSnapshot, PAYMENT_MODES,
} = FoodOrder;
const { isOpenNow } = FoodRestaurant;

const MAX_LINES = 40;
const MAX_QTY = 20;
/** Matches the commercial terms the partner signs — see `constants/partner`. */
const COMMISSION_RATE = 15;

const fail = (res, status, code, message) => res.status(status).json({
  success: false, code, message, error: message,
});

const dbDown = (res) => fail(
  res, 503, 'DB_DISCONNECTED', 'The server is running but not connected to the database.',
);

const isUp = () => mongoose.connection.readyState === 1;

const money = (value) => Math.max(0, Math.round((Number(value) || 0) * 100) / 100);

/* ── Placing one ───────────────────────────────────────────────────────── */

// @route   POST /api/v2/food-partners/orders
// @desc    A diner places an order. Every price is recomputed server-side.
// @access  Customer session (app_customers)
const placeOrder = async (req, res, next) => {
  const timer = startTimer();

  try {
    if (!isUp()) return dbDown(res);

    const body = req.body || {};
    const restaurantId = String(body.restaurantId || '').trim().toUpperCase();
    const rawLines = Array.isArray(body.lines) ? body.lines : [];

    if (!restaurantId) return fail(res, 400, 'BAD_INPUT', 'Which restaurant is this order for?');
    if (!rawLines.length) return fail(res, 400, 'EMPTY_ORDER', 'There is nothing in this order.');
    if (rawLines.length > MAX_LINES) {
      return fail(res, 400, 'TOO_MANY_LINES', `An order can hold at most ${MAX_LINES} different dishes.`);
    }

    /* ── The restaurant has to be one a diner may actually order from ──── */
    const restaurant = await FoodRestaurant.findOne({
      restaurantId,
      verificationStatus: 'approved',
      isActive: true,
    }).lean();

    if (!restaurant) {
      return fail(res, 404, 'RESTAURANT_UNAVAILABLE', 'That restaurant is not taking orders.');
    }
    if (!isOpenNow(restaurant)) {
      return fail(res, 409, 'RESTAURANT_CLOSED', `${restaurant.restaurantName} is closed right now.`);
    }

    /* ── Read every dish back, and price from the row not the request ──── */
    const wanted = rawLines
      .map((line) => String(line?.productId || '').trim().toUpperCase())
      .filter(Boolean);

    if (wanted.length !== rawLines.length) {
      return fail(res, 400, 'BAD_INPUT', 'Every line needs a productId.');
    }

    const products = await FoodProduct.find({ restaurantId, productId: { $in: wanted } }).lean();
    const byId = new Map(products.map((p) => [p.productId, p]));

    const lines = [];
    let itemsTotal = 0;

    for (const raw of rawLines) {
      const productId = String(raw.productId).trim().toUpperCase();
      const product = byId.get(productId);

      /* Refused, not skipped — see the header. */
      if (!product) {
        return fail(res, 409, 'DISH_UNAVAILABLE', 'A dish in your order is no longer on the menu. Please review your cart.');
      }
      if (product.isAvailable === false) {
        return fail(res, 409, 'DISH_SOLD_OUT', `${product.productName} has just sold out.`);
      }

      const quantity = Math.min(MAX_QTY, Math.max(1, Math.floor(Number(raw.quantity) || 1)));

      /* A variant REPLACES the base price; an add-on adds to it. Both are
         matched by name against the stored row, so a name the kitchen does not
         offer contributes nothing rather than whatever the client claimed. */
      const variantName = String(raw.variantName || '').trim();
      const variant = variantName
        ? (product.variants || []).find((v) => v.name === variantName)
        : null;
      if (variantName && !variant) {
        return fail(res, 409, 'VARIANT_UNAVAILABLE', `${product.productName} is not offered as "${variantName}".`);
      }

      const wantedAddOns = Array.isArray(raw.addOns) ? raw.addOns.map((a) => String(a?.name ?? a).trim()) : [];
      const addOns = wantedAddOns
        .map((name) => (product.addOns || []).find((a) => a.name === name))
        .filter(Boolean)
        .map((a) => ({ name: a.name, price: money(a.price) }));

      const base = variant
        ? money(variant.price)
        : money(product.discountedPrice && product.discountedPrice > 0 ? product.discountedPrice : product.price);

      const unitPrice = money(base + addOns.reduce((sum, a) => sum + a.price, 0));
      const lineTotal = money(unitPrice * quantity);
      itemsTotal += lineTotal;

      lines.push({
        productId: product.productId,
        productName: product.productName,
        variantName: variant ? variant.name : '',
        addOns,
        quantity,
        unitPrice,
        lineTotal,
        isVeg: product.isVeg || 'veg',
        note: String(raw.note || '').trim().slice(0, 200),
      });
    }

    itemsTotal = money(itemsTotal);

    /* ── Charges, also from the restaurant's own row ────────────────────── */
    const paymentMode = PAYMENT_MODES.includes(body.paymentMode) ? body.paymentMode : 'cod';
    if (paymentMode === 'cod' && restaurant.acceptsCod === false) {
      return fail(res, 409, 'COD_UNAVAILABLE', 'This restaurant is not taking cash on delivery.');
    }
    if (paymentMode === 'online' && restaurant.acceptsOnlinePayment === false) {
      return fail(res, 409, 'ONLINE_UNAVAILABLE', 'This restaurant is not taking online payment.');
    }

    const isPickup = body.fulfilment === 'pickup';
    const minOrder = money(restaurant.minOrderValue);
    if (minOrder > 0 && itemsTotal < minOrder) {
      return fail(res, 409, 'BELOW_MINIMUM', `The minimum order here is ₹${minOrder}.`);
    }

    const packagingCharge = money(restaurant.packagingCharge);

    /* Pickup pays no delivery. Otherwise the rule the partner configured
       decides, and a per-kilometre rate falls back to its base because nothing
       has measured a distance for this order yet. */
    const fee = restaurant.deliveryFee || {};
    let deliveryFee = 0;
    if (!isPickup) {
      if (fee.type === 'free_above' && money(fee.freeAboveValue) > 0 && itemsTotal >= money(fee.freeAboveValue)) {
        deliveryFee = 0;
      } else {
        deliveryFee = money(fee.amount);
      }
    }

    const grandTotal = money(itemsTotal + packagingCharge + deliveryFee);
    const partnerPayout = money(itemsTotal * (1 - COMMISSION_RATE / 100));

    /* ── Where the two ends of the ride are ─────────────────────────────
       Snapshotted onto the order rather than joined at dispatch time, so a
       restaurant that moves its pin — or a diner who edits an address — cannot
       move an order that is already out. The drop is optional: a diner who
       declined location access still orders, and the matcher falls back to the
       restaurant's own position for distance. */
    const pickupLocation = restaurant.location && Array.isArray(restaurant.location.coordinates)
      ? { type: 'Point', coordinates: restaurant.location.coordinates }
      : undefined;

    const dropLat = Number(body.dropLat ?? body.deliveryLat);
    const dropLng = Number(body.dropLng ?? body.deliveryLng);
    const dropLocation = !isPickup
      && Number.isFinite(dropLat) && Number.isFinite(dropLng)
      && Math.abs(dropLat) <= 90 && Math.abs(dropLng) <= 180
      /* [LONGITUDE, LATITUDE] — MongoDB's order, and the named inputs above
         are the only defence against the swap. See `foodOrder.model.js`. */
      ? { type: 'Point', coordinates: [dropLng, dropLat] }
      : undefined;

    /* ── Write it ───────────────────────────────────────────────────────── */
    const now = new Date();
    const order = await FoodOrder.create({
      orderNumber: makeOrderNumber(),
      restaurantId,
      customerId: req.customer?.customerId || '',
      customerName: String(body.customerName || req.customer?.name || '').trim(),
      customerPhone: String(req.customer?.phone || '').trim(),
      deliveryAddress: isPickup ? '' : String(body.deliveryAddress || '').trim().slice(0, 300),
      fulfilment: isPickup ? 'pickup' : 'delivery',
      pickupLocation,
      dropLocation,
      /* The kitchen in words, snapshotted beside its pin for the same reason
         the pin is snapshotted: a rider is sent to the restaurant this order
         was placed at, not to whatever that restaurantId names an hour later.
         It is also the only way the Driver app can head a job card with a
         name — see `restaurantSnapshot` on the model. */
      restaurant: restaurantSnapshot(restaurant),
      lines,
      itemsTotal,
      packagingCharge,
      deliveryFee,
      discount: 0,
      grandTotal,
      partnerPayout,
      commissionRate: COMMISSION_RATE,
      paymentMode,
      /* Cash is owed at the door; an online order is only `paid` once a
         verified signature says so. Marking it paid here would put money in a
         settlement report that never arrived. */
      paymentStatus: 'pending',
      status: 'placed',
      statusHistory: [{ status: 'placed', at: now, by: 'customer' }],
      /* The two hand-over codes, minted now so both are on the order before
         anybody could need them. A pickup order still gets a `pickupCode` —
         the diner reads it out at the counter, which is the same hand-over
         with one fewer person in it. */
      pickupCode: makeHandoverCode(),
      deliveryOtp: isPickup ? '' : makeHandoverCode(),
      placedAt: now,
    });

    console.log(
      `${BADGE} [New Order] ${order.orderNumber} · ${restaurant.restaurantName} · ` +
      `${lines.length} line(s) · ₹${grandTotal} · ${paymentMode} · ${isPickup ? 'pickup' : 'delivery'} ` +
      `(${timer.ms()}ms)`,
    );

    /* ── What happens next depends on the money — see the header ────────── */
    if (paymentMode === 'online') {
      return res.status(201).json({
        success: true,
        message: 'Your order is held. Complete the payment to send it to the kitchen.',
        /* `customerView`, exactly as the cash branch below uses. This answered
           with `order.toJSON()` — which strips only `__v` — so every diner who
           chose to pay online was handed the restaurant's `partnerPayout`, the
           `commissionRate` we settle at, and BOTH hand-over codes, on the one
           response the app definitely keeps. The kitchen's commercial terms
           have never been anybody's business on a phone, and `pickupCode` is
           the number the pass reads out to the rider.

           Nothing the payment hand-off needs is in what this removes: the
           checkout is opened by `POST /orders/:number/payment`, which mints
           the gateway order and answers with it, and the app's own
           `ServerFoodOrder` type names none of the three. */
        data: customerView(order),
        /* The app opens checkout on this rather than inferring it. */
        nextStep: 'payment',
        notified: false,
      });
    }

    /* Cash: ring the kitchen. Dispatch does NOT start here any more — the
       kitchen has to accept and quote a prep time first, so a rider is only
       ever found against a real ready-time estimate rather than the instant
       the order lands. See `setOrderStatus` in `foodOrder.controller.js`,
       where accepting is what now calls `dispatch.startDispatch`. */
    const alert = await notifyRestaurantOfOrder(order.toObject());

    return res.status(201).json({
      success: true,
      message: 'Your order is with the kitchen.',
      data: customerView(order),
      nextStep: 'track',
      /* Honest about whether anybody was actually rung. The app uses it to
         say "we have told the kitchen" versus "we are still reaching them". */
      notified: alert.sent > 0,
    });
  } catch (error) {
    logError('placing an order', error);
    return next(error);
  }
};

/* ── Reading your own ──────────────────────────────────────────────────── */

/**
 * How stale a rider's position may be before the diner is shown nothing.
 *
 * Two minutes, which is deliberately LONGER than the five the dispatcher uses
 * (`driver.model.js`). The two questions are different: the dispatcher is
 * asking "can this rider be sent somewhere", where a stale fix means offering
 * work to somebody asleep, and this is asking "is this worth drawing", where a
 * ninety-second-old marker on a scooter is still roughly right and much better
 * than an empty map.
 *
 * Past two minutes it is not roughly right any more — a rider covers most of a
 * kilometre in that time — so the marker is dropped rather than left sitting
 * still, which reads as a rider who has stopped rather than as a fix nobody
 * has.
 */
const RIDER_POSITION_MAX_AGE_MS = 2 * 60 * 1000;

/**
 * Where the assigned rider is, for ONE order.
 *
 * Read from `app_drivers` at request time rather than copied onto the order:
 * a position moves four times a minute and the order does not, and writing one
 * into the other would be four writes a minute to a document nothing else is
 * touching. The lookup is by indexed `driverId` and only happens on the
 * single-order read.
 *
 * Returns null — which the app draws as "we cannot see your rider right now" —
 * whenever there is no rider, the order is finished, or the fix is old.
 */
const riderPosition = async (order) => {
  const driverId = order.delivery && order.delivery.driverId;
  if (!driverId) return null;
  /* Nothing to follow once it is delivered, and a marker left on a finished
     order is a rider's movements shown to somebody with no reason to see
     them. */
  if (['delivered', 'cancelled', 'rejected'].includes(order.status)) return null;

  // eslint-disable-next-line global-require
  const Driver = require('../drivers/driver.model');
  const driver = await Driver.findOne({ driverId })
    .select('currentLocation heading locationUpdatedAt')
    .lean();

  const pair = driver && driver.currentLocation && driver.currentLocation.coordinates;
  if (!Array.isArray(pair) || pair.length !== 2 || !driver.locationUpdatedAt) return null;

  const age = Date.now() - new Date(driver.locationUpdatedAt).getTime();
  if (age > RIDER_POSITION_MAX_AGE_MS) return null;

  return {
    coordinates: pair,
    heading: driver.heading,
    at: driver.locationUpdatedAt,
  };
};

// @route   GET /api/v2/food-partners/orders
// @desc    The diner's own order history, newest first
// @access  Customer session
const listMyOrders = async (req, res, next) => {
  try {
    if (!isUp()) return dbDown(res);

    const orders = await FoodOrder.find({ customerId: req.customer.customerId })
      .sort({ placedAt: -1 })
      .limit(50)
      .lean();

    /* `(order) => customerView(order)`, NOT `.map(customerView)`. `map` passes
       the index as a second argument, which `customerView` now reads as the
       rider's live position — the classic point-free footgun, and here it would
       hand the projection a number where it expects coordinates. The list
       deliberately carries no positions anyway: fifty orders would be fifty
       driver lookups to draw markers nobody is looking at. */
    return res.json({
      success: true,
      count: orders.length,
      data: orders.map((order) => customerView(order)),
    });
  } catch (error) {
    logError('reading a customer order list', error);
    return next(error);
  }
};

// @route   GET /api/v2/food-partners/orders/:orderNumber
// @desc    One of the diner's own orders, for the tracking screen
// @access  Customer session (owner only)
const getMyOrder = async (req, res, next) => {
  try {
    if (!isUp()) return dbDown(res);

    /* Filtered on the customer as well as the number. An order number is six
       digits and is read down a phone line — guessing one must not be enough
       to read a stranger's address. */
    const order = await FoodOrder.findOne({
      customerId: req.customer.customerId,
      orderNumber: String(req.params.orderNumber || '').trim().toUpperCase(),
    }).lean();

    if (!order) return fail(res, 404, 'NOT_FOUND', 'We could not find that order.');

    return res.json({ success: true, data: customerView(order, await riderPosition(order)) });
  } catch (error) {
    logError('reading a customer order', error);
    return next(error);
  }
};

// @route   PATCH /api/v2/food-partners/orders/:orderNumber/cancel
// @desc    A diner cancels, while the kitchen has not started
// @access  Customer session (owner only)
const cancelMyOrder = async (req, res, next) => {
  try {
    if (!isUp()) return dbDown(res);

    const order = await FoodOrder.findOne({
      customerId: req.customer.customerId,
      orderNumber: String(req.params.orderNumber || '').trim().toUpperCase(),
    });

    if (!order) return fail(res, 404, 'NOT_FOUND', 'We could not find that order.');

    /* Only before the food is being cooked. Past that the ingredients are
       committed and cancelling is a conversation with the restaurant, not a
       button — the commercial terms the partner signed say the same.

       Note that a rider already being assigned does NOT block this: the food
       has not been cooked, so nothing has been wasted, and the rider is simply
       freed below. It is the KITCHEN's state that decides, not the rider's. */
    if (!['placed', 'accepted'].includes(order.status)) {
      return fail(
        res, 409, 'TOO_LATE_TO_CANCEL',
        'The kitchen has already started this order. Call the restaurant if something is wrong.',
      );
    }

    const reason = String((req.body || {}).reason || '').trim().slice(0, 200);
    order.status = 'cancelled';
    order.statusHistory.push({
      status: 'cancelled', at: new Date(), by: 'customer', note: reason,
    });

    /* The rider comes off before the save, so one write covers both. */
    const strandedDriverId = order.delivery && order.delivery.driverId;
    if (strandedDriverId) {
      order.delivery.driverId = '';
      order.delivery.assignedAt = null;
    }
    order.dispatch.state = 'idle';
    await order.save();

    /* ── Everything the cancellation has to unwind ────────────────────── */

    // eslint-disable-next-line global-require
    const dispatch = require('../drivers/foodDispatch.service');
    // eslint-disable-next-line global-require
    const realtime = require('../../infrastructure/realtime/realtime');

    /* Stops the cascade and tells whichever rider is mid-countdown. Without
       this their screen runs to zero on an order that no longer exists and
       they tap Accept into a refusal — which reads as the app being broken
       rather than as the order being gone. */
    await dispatch.cancelDispatch(order.orderNumber, 'Cancelled by the customer');

    if (strandedDriverId) {
      // eslint-disable-next-line global-require
      const Driver = require('../drivers/driver.model');
      await Driver.updateOne(
        { driverId: strandedDriverId },
        { $set: { isAvailable: true, currentOrderNumber: null } },
      );
      realtime.toDriver(strandedDriverId, 'delivery_cancelled', {
        orderNumber: order.orderNumber,
        message: 'The customer cancelled this delivery.',
      });
    }

    /* Prepaid money is flagged as owed back rather than refunded from here —
       see `markForRefund`, which explains why a cancel button must not move
       real money on its own. */
    await markForRefund(order, 'the customer cancelled');

    realtime.toOrderParties(order, 'dispatch_update', dispatch.dispatchUpdate(order));

    console.log(`${BADGE} [Order Cancelled] ${order.orderNumber} by the customer`);

    return res.json({ success: true, data: customerView(order) });
  } catch (error) {
    logError('cancelling an order', error);
    return next(error);
  }
};

module.exports = { placeOrder, listMyOrders, getMyOrder, cancelMyOrder };
