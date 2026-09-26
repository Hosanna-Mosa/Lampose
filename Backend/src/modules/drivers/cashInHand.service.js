/* ══════════════════════════════════════════════════════════════════════════
   How much cash each rider is holding.

       collected at doors  − handed over  =  in hand

   Both halves are summed from their own records every time — cash-on-delivery
   orders marked `collection.method: 'cash'` by the rider who took it, and
   `driver_cash_deposits` rows recorded by an administrator. Nothing is
   stored as a running total; see `driverCashDeposit.model.js` for why.

   Paise throughout, the same unit `collection.amountPaise` and every Razorpay
   figure already use, so no sum is ever rounded along the way.
   ══════════════════════════════════════════════════════════════════════════ */
const FoodOrder = require('../foodpartners/foodOrder.model');
const DriverCashDeposit = require('./driverCashDeposit.model');

const cashCollectedMatch = (driverIds) => ({
  'collection.method': 'cash',
  'collection.collectedBy': Array.isArray(driverIds) ? { $in: driverIds } : driverIds,
});

const sumBy = async (Model, match, field, key) => {
  const rows = await Model.aggregate([
    { $match: match },
    { $group: { _id: `$${key}`, total: { $sum: `$${field}` }, n: { $sum: 1 } } },
  ]);
  return new Map(rows.map((row) => [row._id, { total: row.total || 0, n: row.n || 0 }]));
};

/**
 * Cash in hand for many riders at once — two aggregations, however many.
 *
 * @param {string[]} driverIds
 * @returns {Promise<Map<string, { collectedPaise, depositedPaise, inHandPaise, cashOrders }>>}
 */
const cashInHandFor = async (driverIds) => {
  const ids = [...new Set((driverIds || []).filter(Boolean))];
  if (!ids.length) return new Map();

  const [collected, deposited] = await Promise.all([
    sumBy(FoodOrder, cashCollectedMatch(ids), 'collection.amountPaise', 'collection.collectedBy'),
    sumBy(DriverCashDeposit, { driverId: { $in: ids } }, 'amountPaise', 'driverId'),
  ]);

  return new Map(ids.map((id) => {
    const c = collected.get(id) || { total: 0, n: 0 };
    const d = deposited.get(id) || { total: 0, n: 0 };
    return [id, {
      collectedPaise: c.total,
      depositedPaise: d.total,
      inHandPaise: c.total - d.total,
      cashOrders: c.n,
    }];
  }));
};

/**
 * One rider's cash, with the recent entries on both sides.
 *
 * `inHandPaise` can go below zero only if more was recorded as handed over
 * than was ever collected — which the deposit route refuses, so a negative
 * number here means a record was changed by hand and is shown, not hidden.
 */
const cashLedgerFor = async (driverId, { limit = 20 } = {}) => {
  const [totals, collections, deposits] = await Promise.all([
    cashInHandFor([driverId]),
    FoodOrder.find(cashCollectedMatch(driverId))
      .select('orderNumber collection.amountPaise collection.collectedAt')
      .sort({ 'collection.collectedAt': -1 })
      .limit(limit)
      .lean(),
    DriverCashDeposit.find({ driverId }).sort({ recordedAt: -1 }).limit(limit).lean(),
  ]);

  return {
    ...(totals.get(driverId) || {
      collectedPaise: 0, depositedPaise: 0, inHandPaise: 0, cashOrders: 0,
    }),
    collections: collections.map((order) => ({
      orderNumber: order.orderNumber,
      amountPaise: order.collection?.amountPaise || 0,
      at: order.collection?.collectedAt || null,
    })),
    deposits: deposits.map((row) => ({
      id: String(row._id),
      amountPaise: row.amountPaise,
      method: row.method,
      reference: row.reference || '',
      note: row.note || '',
      recordedBy: row.recordedBy,
      at: row.recordedAt,
    })),
  };
};

module.exports = { cashInHandFor, cashLedgerFor };
