/* ══════════════════════════════════════════════════════════════════════════
   The partner's orders — list, read one, and move one forward.

   Behind a food-partner session, and scoped to `req.foodPartner.restaurantId`
   exactly as the menu handlers are: every lookup filters on the restaurantId
   FROM THE TOKEN as well as the order number, never on the number alone. An
   order number is six digits and is read down a phone line, which is what
   makes it a poor secret — guessing one must not be enough to read somebody
   else's customer's address.

   ## Nothing writes orders here yet, and that is the honest state

   The customer-facing ordering flow does not reach this backend, so
   `food_orders` is currently empty. These handlers therefore return an empty
   list and the app shows an empty state saying so. That is deliberate: a
   partner app that invented a few orders to look alive would be teaching a
   restaurant to trust a number that is not real, and the first thing they
   would do with it is try to cook one.

   ## A restaurant may only make the moves that are its own

   `ALLOWED_PARTNER_TRANSITIONS` in the model is the whole rule, and it is
   enforced here rather than trusted from the body. `picked_up` and `delivered`
   belong to the rider; `cancelled` belongs to the customer. A kitchen that
   could set them would be reporting a hand-over that never happened.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const FoodOrder = require('./foodOrder.model');
const { logError } = require('./foodPartner.log');

const { ALLOWED_PARTNER_TRANSITIONS, ORDER_STATUSES } = FoodOrder;

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
    const filter = { restaurantId };

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
       Cheap: it is one grouped count over an indexed field. */
    const grouped = await FoodOrder.aggregate([
      { $match: { restaurantId } },
      { $group: { _id: '$status', n: { $sum: 1 } } },
    ]);
    const counts = grouped.reduce((acc, row) => ({ ...acc, [row._id]: row.n }), {});

    return res.json({ success: true, count: orders.length, counts, data: orders });
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

    return res.json({ success: true, data: order });
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

    const order = await FoodOrder.findOne({ restaurantId, orderNumber });
    if (!order) return notFound(res);

    const allowed = ALLOWED_PARTNER_TRANSITIONS[order.status] || [];
    if (!allowed.includes(next_)) {
      /* Naming both the current state and what IS possible from it, because
         "forbidden" alone leaves the app with nothing to show a cook who has
         just tapped a button that did nothing. */
      const message = allowed.length
        ? `An order that is "${order.status}" can only move to: ${allowed.join(', ')}.`
        : `An order that is "${order.status}" cannot be changed from the restaurant.`;
      return fail(res, 409, 'INVALID_TRANSITION', message);
    }

    order.status = next_;
    if (next_ === 'rejected') {
      order.rejectionReason = String((req.body || {}).reason || '').trim().slice(0, 300);
    }
    if (next_ === 'accepted') {
      const minutes = Number((req.body || {}).promisedMinutes);
      if (Number.isFinite(minutes) && minutes > 0) order.promisedMinutes = Math.min(minutes, 240);
    }
    order.statusHistory.push({ status: next_, at: new Date(), by: 'partner' });

    await order.save();

    return res.json({ success: true, data: order.toJSON() });
  } catch (error) {
    logError('me/orders/:orderNumber/status', error);
    return next(error);
  }
};

module.exports = { listMyOrders, getMyOrder, setOrderStatus };
