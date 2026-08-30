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
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const FoodOrder = require('./foodOrder.model');
const FoodProduct = require('./foodProduct.model');
const FoodRestaurant = require('./foodRestaurant.model');
const { notifyRestaurantOfOrder } = require('./foodOrder.notifier');
const { BADGE, logError, startTimer } = require('./foodPartner.log');

const { makeOrderNumber, PAYMENT_MODES } = FoodOrder;
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

    /* ── Write it ───────────────────────────────────────────────────────── */
    const now = new Date();
    const order = await FoodOrder.create({
      orderNumber: makeOrderNumber(),
      restaurantId,
      customerId: req.customer?.customerId || '',
      customerName: String(body.customerName || req.customer?.name || '').trim(),
      customerPhone: String(req.customer?.phone || '').trim(),
      deliveryAddress: isPickup ? '' : String(body.deliveryAddress || '').trim().slice(0, 300),
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
         gateway says so, and no gateway is wired to this flow yet. Marking it
         paid here would put money in a settlement report that never arrived. */
      paymentStatus: 'pending',
      status: 'placed',
      statusHistory: [{ status: 'placed', at: now, by: 'customer' }],
      placedAt: now,
    });

    /* ── Ring the kitchen ───────────────────────────────────────────────── */
    console.log(
      `${BADGE} [New Order] ${order.orderNumber} · ${restaurant.restaurantName} · ` +
      `${lines.length} line(s) · ₹${grandTotal} · ${paymentMode} · ${isPickup ? 'pickup' : 'delivery'} ` +
      `(${timer.ms()}ms)`,
    );
    const alert = await notifyRestaurantOfOrder(order.toObject());

    return res.status(201).json({
      success: true,
      message: 'Your order is with the kitchen.',
      data: order.toJSON(),
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

    return res.json({ success: true, count: orders.length, data: orders });
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

    return res.json({ success: true, data: order });
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
       button — the commercial terms the partner signed say the same. */
    if (!['placed', 'accepted'].includes(order.status)) {
      return fail(
        res, 409, 'TOO_LATE_TO_CANCEL',
        'The kitchen has already started this order. Call the restaurant if something is wrong.',
      );
    }

    order.status = 'cancelled';
    order.statusHistory.push({
      status: 'cancelled',
      at: new Date(),
      by: 'customer',
      note: String((req.body || {}).reason || '').trim().slice(0, 200),
    });
    await order.save();

    console.log(`${BADGE} [Order Cancelled] ${order.orderNumber} by the customer`);

    return res.json({ success: true, data: order.toJSON() });
  } catch (error) {
    logError('cancelling an order', error);
    return next(error);
  }
};

module.exports = { placeOrder, listMyOrders, getMyOrder, cancelMyOrder };
