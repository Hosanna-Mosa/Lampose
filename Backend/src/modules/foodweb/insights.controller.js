/* ══════════════════════════════════════════════════════════════════════════
   The two summaries on the orders page.

   Replaces the fixture's `USUALS` and `SPEND`.

     GET /usuals   what this diner reaches for, most-ordered first
     GET /spend    what they have spent this month

   ## Both are computed, neither is stored

   There is no `customer_food_stats` collection and this file does not add
   one. Both answers are aggregations over `food_orders`, which is the record
   that already exists and is already correct — a counter maintained beside it
   would be a second source that drifts the first time an order is refunded.

   The cost is one aggregation per page load, over one customer's orders, on
   an indexed field. That is cheap, and it is the right trade until somebody
   actually measures it being otherwise.

   ## What counts, and what does not

   Only orders that were actually FULFILLED — `delivered` and `picked_up`.
   A cancelled order is not a usual, and a refused one is not spending. The
   fixture's numbers were free of this question because it had no lifecycle;
   the moment these are real, "what counts" is the whole of the honesty.
   ══════════════════════════════════════════════════════════════════════════ */
const FoodOrder = require('../foodpartners/foodOrder.model');
const FoodProduct = require('../foodpartners/foodProduct.model');
const { rupees, dishCard } = require('./foodWeb.shape');
const { DISH_FIELDS } = require('./dishes.controller');

/*
 * The orders that count towards either summary.
 *
 * `picked_up` is included alongside `delivered` because a collected order is
 * a completed one — the diner ate it and paid for it, and leaving it out
 * would quietly under-report every pickup-only kitchen.
 */
const FULFILLED = ['delivered', 'picked_up'];

/**
 * What this diner orders most.
 *
 * Ranked by how many times a dish appears across their orders, which is the
 * only ranking the phrase "your usual" can honestly carry.
 *
 * The dish is re-read from `food_products` rather than served out of the
 * order line, because the order line is a SNAPSHOT — it holds the price and
 * the name as they were on the day. A "usual" is something to order AGAIN, so
 * it has to carry today's price, today's availability and today's add-ons.
 *
 * A dish that has since been deleted from the menu simply drops out of the
 * list. That is correct: it cannot be reordered.
 *
 * @route   GET /api/v2/food-web/usuals
 * @access  customer session required
 *
 * Query:
 *   limit  1–10, default 3 — the fixture showed three
 */
const listUsuals = async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 3, 1), 10);

    const rows = await FoodOrder.aggregate([
      { $match: { customerId: req.customer.customerId, status: { $in: FULFILLED } } },
      { $unwind: '$lines' },
      /* Lines written before `productId` was recorded carry '' and cannot be
         re-read, so they are dropped rather than grouped into one phantom
         "usual" with an empty id. */
      { $match: { 'lines.productId': { $nin: ['', null] } } },
      {
        $group: {
          _id: '$lines.productId',
          /* Times ORDERED, not units bought. Somebody who buys four idli
             plates once has not made it their usual. */
          times: { $sum: 1 },
          lastAt: { $max: '$placedAt' },
        },
      },
      /* `lastAt` breaks ties towards the thing they had more recently. */
      { $sort: { times: -1, lastAt: -1 } },
      { $limit: limit },
    ]);

    if (!rows.length) {
      return res.json({ success: true, data: { usuals: [], count: 0 } });
    }

    const docs = await FoodProduct.find({ productId: { $in: rows.map((row) => row._id) } })
      .select(DISH_FIELDS)
      .lean();

    const byId = new Map(docs.map((doc) => [doc.productId, doc]));

    /* Mapped over `rows` rather than over `docs`, so the ranking survives —
       `find` returns whatever order Mongo chose. */
    const usuals = rows
      .filter((row) => byId.has(row._id))
      .map((row) => ({
        dishId: row._id,
        times: row.times,
        dish: dishCard(byId.get(row._id)),
      }));

    return res.json({ success: true, data: { usuals, count: usuals.length } });
  } catch (error) {
    return next(error);
  }
};

/**
 * What this diner has spent this calendar month.
 *
 * Calendar month, not a rolling thirty days: the label says "this month" and
 * a figure that silently meant "since the 21st of last month" would not match
 * what anybody counts on their own fingers.
 *
 * `grandTotal` is what they were actually charged, so packaging, delivery and
 * any discount are already inside it.
 *
 * @route   GET /api/v2/food-web/spend
 * @access  customer session required
 */
const getSpend = async (req, res, next) => {
  try {
    const now = new Date();

    /* The first instant of this month IN INDIA. `new Date(y, m, 1)` builds it
       in the server's zone, which on a UTC host puts the boundary five and a
       half hours late — an order placed at 2am on the 1st would be counted
       against LAST month. IST has no daylight saving, so a fixed +05:30 offset
       is exact. */
    const [year, month] = now
      .toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
      .split('-')
      .map(Number);
    const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
    const monthStart = new Date(Date.UTC(year, month - 1, 1) - IST_OFFSET_MS);

    const [summary] = await FoodOrder.aggregate([
      {
        $match: {
          customerId: req.customer.customerId,
          status: { $in: FULFILLED },
          placedAt: { $gte: monthStart },
        },
      },
      { $group: { _id: null, total: { $sum: '$grandTotal' }, orders: { $sum: 1 } } },
    ]);

    const total = rupees(summary && summary.total);
    const orders = rupees(summary && summary.orders);

    return res.json({
      success: true,
      data: {
        monthLabel: 'this month',
        month: now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }),
        total,
        orders,
        /* Guarded: a diner with no orders this month would otherwise get
           NaN here, and NaN renders as "₹NaN" on the card. */
        average: orders ? Math.round(total / orders) : 0,
      },
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = { listUsuals, getSpend, FULFILLED };
