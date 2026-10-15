/* ══════════════════════════════════════════════════════════════════════════
   A rider's rating — the average of what diners said about their deliveries.

     recompute(driverId)   rebuild `app_drivers.rating` from the orders
     RATING_WINDOW_MS      how long after delivery a diner may still rate

   ## The orders are the ledger; the rider's figure is a cache of them

   Each rating lives on the order it is about (`food_orders.delivery.rating`).
   The rider's `rating.avg` / `rating.count` is recomputed from ALL of those
   after every new one — an aggregate over the rider's own delivered orders,
   which `delivery.driverId` is indexed for — rather than nudged with an `$inc`
   beside the write. An increment that lands without its order (or an order
   without its increment) is a number nobody can rebuild; a recompute is
   idempotent, and running it again always lands on the truth.

   The average is rounded to one decimal place, the precision every screen
   prints; `count` says how many orders it rests on.
   ══════════════════════════════════════════════════════════════════════════ */
const FoodOrder = require('../foodpartners/foodOrder.model');
const Driver = require('./driver.model');

/** A diner may rate a delivery for a week after it arrived. */
const RATING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const recompute = async (driverId) => {
  if (!driverId) return null;

  const [row] = await FoodOrder.aggregate([
    { $match: { 'delivery.driverId': driverId, 'delivery.rating.stars': { $gte: 1 } } },
    { $group: { _id: null, avg: { $avg: '$delivery.rating.stars' }, count: { $sum: 1 } } },
  ]);

  const rating = row
    ? { avg: Math.round(row.avg * 10) / 10, count: row.count }
    : { avg: null, count: 0 };

  await Driver.updateOne({ driverId }, { $set: { rating } });
  return rating;
};

module.exports = { recompute, RATING_WINDOW_MS };
