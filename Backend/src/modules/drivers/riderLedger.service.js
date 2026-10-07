/* ══════════════════════════════════════════════════════════════════════════
   Posting to a rider's ledger — see `riderLedgerEntry.model.js` for the shape
   and for why the balance is the newest row.

     post(driverId, build)     the one way a row is written
     postDelivery(order)       a delivered order → earning or cash_order
     autoAdjust(driverId)      wallet clears outstanding, as far as it reaches
     recordDeposit(...)        cash handed over, checked against outstanding
     sweepUnposted()           the backstop for a delivery the live path missed
     openLedger(...)           start the ledger, carrying old cash in

   ## What a delivery posts

     paid online, or by UPI on the doorstep QR
         wallet       + earning
     paid in cash at the door (₹500 collected, ₹30 earning)
         outstanding  + 470       the rider kept their ₹30 out of the notes

   and then, either way, `autoAdjust`: if the rider has both a wallet and an
   outstanding, the smaller of the two comes off both. A rider who is owed
   ₹300 and owes ₹470 ends up owed nothing and owing ₹170.

   ## It never fails a delivery

   The delivery is the diner's food at the door; the ledger is bookkeeping
   about it. `postDelivery` is called after the order is saved, its failure
   is logged, and `sweepUnposted` (every two minutes, from server.js) posts
   anything delivered that has no `delivery.ledgerPostedAt` yet. `key` makes
   the two paths safe to overlap.
   ══════════════════════════════════════════════════════════════════════════ */
const FoodOrder = require('../foodpartners/foodOrder.model');
const RiderLedgerEntry = require('./riderLedgerEntry.model');
const RiderLedgerSettings = require('./riderLedgerSettings.model');
const DriverCashDeposit = require('./driverCashDeposit.model');

const { SETTINGS_ID, DEFAULTS } = RiderLedgerSettings;

const LOG = '📒 [rider-ledger]';

/** Attempts at one row before giving up on a rider under heavy contention. */
const MAX_TRIES = 20;

/** A refusal the caller turns into a 4xx — not a fault. */
class LedgerRefusal extends Error {
  constructor(code, message, status = 409) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const rupeesToPaise = (rupees) => Math.round((Number(rupees) || 0) * 100);

/* ── Settings ─────────────────────────────────────────────────────────── */

const getSettings = async () => {
  const row = await RiderLedgerSettings.findById(SETTINGS_ID).lean();
  return { ...DEFAULTS, ...(row || {}) };
};

/* ── Balances ─────────────────────────────────────────────────────────── */

const EMPTY = Object.freeze({ walletPaise: 0, outstandingPaise: 0, seq: 0 });

const balanceOf = (row) => (row
  ? { walletPaise: row.walletAfterPaise, outstandingPaise: row.outstandingAfterPaise, seq: row.seq }
  : { ...EMPTY });

const latestRow = (driverId) => RiderLedgerEntry.findOne({ driverId }).sort({ seq: -1 }).lean();

/** One rider's balances. */
const balanceFor = async (driverId) => balanceOf(await latestRow(driverId));

/**
 * Balances for many riders in one aggregation — the matcher and the console
 * list ask for a page of riders at a time.
 *
 * @returns {Promise<Map<string, { walletPaise, outstandingPaise, seq }>>}
 */
const balancesFor = async (driverIds) => {
  const ids = [...new Set((driverIds || []).filter(Boolean))];
  if (!ids.length) return new Map();
  const rows = await RiderLedgerEntry.aggregate([
    { $match: { driverId: { $in: ids } } },
    { $sort: { driverId: 1, seq: -1 } },
    { $group: { _id: '$driverId', row: { $first: '$$ROOT' } } },
  ]);
  const found = new Map(rows.map((r) => [r._id, balanceOf(r.row)]));
  return new Map(ids.map((id) => [id, found.get(id) || { ...EMPTY }]));
};

/**
 * Riders who owe at least the cash limit (₹2,000 by default) — not offered
 * cash-on-delivery orders until they pay some of it back. Online and
 * already-paid orders still reach them.
 *
 * Every rider's newest row, filtered on its `outstandingAfterPaise` — one
 * aggregation down the `{ driverId, seq }` index, however large the fleet,
 * so the matcher can exclude them inside its own query rather than after
 * its broadcast limit has already been spent on them.
 *
 * @returns {Promise<string[]>} empty while the ledger is not open
 */
const codBlockedDriverIds = async ({ settings } = {}) => {
  const current = settings || await getSettings();
  if (!current.startedAt) return [];
  const rows = await RiderLedgerEntry.aggregate([
    { $sort: { driverId: 1, seq: -1 } },
    { $group: { _id: '$driverId', outstanding: { $first: '$outstandingAfterPaise' } } },
    { $match: { outstanding: { $gte: current.codLimitPaise } } },
  ]);
  return rows.map((row) => row._id);
};

/** Is this one rider at or over the cash limit? */
const isCodBlocked = async (driverId, { settings } = {}) => {
  const current = settings || await getSettings();
  if (!current.startedAt) return false;
  const { outstandingPaise } = await balanceFor(driverId);
  return outstandingPaise >= current.codLimitPaise;
};

/* ── Writing a row ────────────────────────────────────────────────────── */

/* The unique indexes ARE the concurrency control, so they must exist before
   the first write — scripts connect with autoIndex off (guard.js), and a
   fresh database has none yet. `createIndexes` is a no-op once they do. */
let indexesReady = null;
const ensureIndexes = () => {
  if (!indexesReady) {
    indexesReady = RiderLedgerEntry.createIndexes().catch((error) => {
      indexesReady = null;
      throw error;
    });
  }
  return indexesReady;
};

const duplicateOn = (error, field) => Boolean(
  error && error.code === 11000 && error.keyPattern && field in error.keyPattern,
);

/**
 * Write one row for a rider.
 *
 * `build(balance)` is given the rider's balances as they stand and returns
 * the row to write — `{ kind, walletPaise, outstandingPaise, key?, … }` — or
 * null for "nothing to do", or throws a LedgerRefusal. It is called again
 * with fresh balances if another row landed first, so it must be a pure
 * function of what it is given.
 *
 * @returns {Promise<{ entry: object|null, balance: object, duplicate?: boolean }>}
 */
const post = async (driverId, build) => {
  if (!driverId) throw new Error('rider ledger: a row needs a driverId');
  await ensureIndexes();

  for (let attempt = 0; attempt < MAX_TRIES; attempt += 1) {
    const before = balanceOf(await latestRow(driverId));
    const change = build(before);
    if (!change) return { entry: null, balance: before };

    if (change.key) {
      const existing = await RiderLedgerEntry.findOne({ key: change.key }).lean();
      if (existing) return { entry: existing, balance: before, duplicate: true };
    }

    const walletPaise = Math.round(change.walletPaise || 0);
    const outstandingPaise = Math.round(change.outstandingPaise || 0);
    const after = {
      walletPaise: before.walletPaise + walletPaise,
      outstandingPaise: before.outstandingPaise + outstandingPaise,
      seq: before.seq + 1,
    };
    if (after.walletPaise < 0) {
      throw new LedgerRefusal('NOT_ENOUGH_IN_WALLET', 'There is not that much in the wallet.');
    }
    if (after.outstandingPaise < 0) {
      throw new LedgerRefusal('MORE_THAN_OUTSTANDING', 'That is more than the amount outstanding.');
    }

    try {
      const entry = await RiderLedgerEntry.create({
        ...change,
        driverId,
        seq: after.seq,
        walletPaise,
        outstandingPaise,
        walletAfterPaise: after.walletPaise,
        outstandingAfterPaise: after.outstandingPaise,
      });
      return { entry: entry.toObject(), balance: after };
    } catch (error) {
      if (duplicateOn(error, 'key')) {
        const existing = await RiderLedgerEntry.findOne({ key: change.key }).lean();
        return { entry: existing, balance: balanceOf(await latestRow(driverId)), duplicate: true };
      }
      if (duplicateOn(error, 'seq')) continue; // another row landed first — read again
      throw error;
    }
  }
  throw new Error(`rider ledger: gave up writing for ${driverId} after ${MAX_TRIES} attempts`);
};

/**
 * Use the wallet to clear what is outstanding, as far as it reaches.
 * Nothing to do (and no row) when either side is zero.
 */
const autoAdjust = (driverId) => post(driverId, (balance) => {
  const amount = Math.min(balance.walletPaise, balance.outstandingPaise);
  if (amount <= 0) return null;
  return {
    kind: 'auto_adjust',
    walletPaise: -amount,
    outstandingPaise: -amount,
    note: 'Wallet used to clear the amount outstanding',
  };
});

/* ── Deliveries ───────────────────────────────────────────────────────── */

/** What one delivered order does to its rider's balances. Pure. */
const deliveryChange = (order) => {
  const driverId = order.delivery && order.delivery.driverId;
  const earningPaise = rupeesToPaise(order.delivery && order.delivery.earnings);
  const tookCash = order.collection
    && order.collection.method === 'cash'
    && order.collection.collectedBy === driverId;

  const base = {
    orderNumber: order.orderNumber,
    earningPaise,
    key: `delivered:${order.orderNumber}`,
    at: (order.delivery && order.delivery.deliveredAt) || new Date(),
  };

  if (!tookCash) {
    return { ...base, kind: 'earning', walletPaise: earningPaise, outstandingPaise: 0 };
  }

  const collectedPaise = order.collection.amountPaise || rupeesToPaise(order.grandTotal);
  const owed = collectedPaise - earningPaise;
  /* An earning bigger than the whole order (a tiny order with the rider's
     minimum) leaves the rider owed the difference rather than owing. */
  return {
    ...base,
    kind: 'cash_order',
    collectedPaise,
    walletPaise: owed < 0 ? -owed : 0,
    outstandingPaise: owed > 0 ? owed : 0,
  };
};

const isPostable = (order, settings) => Boolean(
  order
  && order.status === 'delivered'
  && order.delivery && order.delivery.driverId
  && order.delivery.deliveredAt
  && settings.startedAt
  && new Date(order.delivery.deliveredAt) >= new Date(settings.startedAt),
);

/**
 * Post a delivered order to its rider's ledger, once.
 *
 * Skips (and says why) an order with no rider, one delivered before the
 * ledger opened — its cash is in that rider's `opening` row — or any order
 * while the ledger has not been opened at all.
 *
 * @returns {Promise<{ posted: boolean, reason?: string, entry?: object }>}
 */
const postDelivery = async (order, { settings } = {}) => {
  const current = settings || await getSettings();
  if (!current.startedAt) return { posted: false, reason: 'ledger not opened' };
  if (!isPostable(order, current)) return { posted: false, reason: 'not postable' };

  const driverId = order.delivery.driverId;
  const change = deliveryChange(order);
  const { entry, duplicate } = await post(driverId, () => change);

  await FoodOrder.updateOne(
    { orderNumber: order.orderNumber, 'delivery.ledgerPostedAt': null },
    { $set: { 'delivery.ledgerPostedAt': new Date() } },
  );
  await autoAdjust(driverId);

  if (!duplicate) {
    const what = change.kind === 'cash_order'
      ? `₹${change.collectedPaise / 100} cash, ₹${change.earningPaise / 100} kept, `
        + `₹${change.outstandingPaise / 100} outstanding`
      : `₹${change.earningPaise / 100} to wallet`;
    console.log(`${LOG} ${order.orderNumber} · ${driverId} · ${what}`);
  }
  return { posted: !duplicate, entry };
};

/**
 * Post every delivered rider order the live path missed. Run on the server's
 * two-minute sweep; matches nothing in the ordinary case.
 *
 * @returns {Promise<{ posted: number, failed: number }>}
 */
const sweepUnposted = async ({ limit = 200 } = {}) => {
  const settings = await getSettings();
  if (!settings.startedAt) return { posted: 0, failed: 0 };

  const orders = await FoodOrder.find({
    status: 'delivered',
    'delivery.ledgerPostedAt': null,
    'delivery.deliveredAt': { $gte: settings.startedAt },
    'delivery.driverId': { $nin: ['', null] },
  }).sort({ 'delivery.deliveredAt': 1 }).limit(limit).lean();

  let posted = 0;
  let failed = 0;
  for (const order of orders) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const result = await postDelivery(order, { settings });
      if (result.posted) posted += 1;
    } catch (error) {
      failed += 1;
      console.error(`${LOG} could not post ${order.orderNumber}: ${error.message}`);
    }
  }
  return { posted, failed };
};

/* ── Cash handed over in the console ──────────────────────────────────── */

/**
 * Cash a rider handed to Lampose, taken off what they owe.
 *
 * Refused above the outstanding amount — checked inside `post`, against the
 * balance as it stands at the write, so two hand-overs entered at once
 * cannot both pass the way a read-then-write check would let them.
 */
const recordDeposit = async (driverId, {
  amountPaise, depositId, method, reference = '', note = '', by,
}) => {
  const { entry, balance } = await post(driverId, (current) => {
    if (amountPaise > current.outstandingPaise) {
      throw new LedgerRefusal(
        'MORE_THAN_IN_HAND',
        `The rider owes ₹${(current.outstandingPaise / 100).toFixed(2)}. A hand-over cannot be more than that.`,
      );
    }
    return {
      kind: 'cash_deposit',
      walletPaise: 0,
      outstandingPaise: -amountPaise,
      key: `deposit:${depositId}`,
      reference,
      note: note || `Handed over (${method})`,
      by,
    };
  });
  return { entry, balance };
};

/* ── Reading ──────────────────────────────────────────────────────────── */

const entryView = (row) => ({
  id: String(row._id),
  seq: row.seq,
  kind: row.kind,
  walletPaise: row.walletPaise,
  outstandingPaise: row.outstandingPaise,
  walletAfterPaise: row.walletAfterPaise,
  outstandingAfterPaise: row.outstandingAfterPaise,
  orderNumber: row.orderNumber || '',
  earningPaise: row.earningPaise || 0,
  collectedPaise: row.collectedPaise || 0,
  reference: row.reference || '',
  note: row.note || '',
  by: row.by || 'system',
  at: row.at,
});

/**
 * A rider's balances, the COD limit, and their newest rows — what both the
 * rider app and the console show. `beforeSeq` pages backwards.
 */
const statementFor = async (driverId, { limit = 30, beforeSeq } = {}) => {
  const filter = { driverId };
  if (Number.isFinite(beforeSeq)) filter.seq = { $lt: beforeSeq };
  const [settings, balance, rows] = await Promise.all([
    getSettings(),
    balanceFor(driverId),
    RiderLedgerEntry.find(filter).sort({ seq: -1 }).limit(Math.min(Math.max(limit, 1), 100)).lean(),
  ]);
  return {
    opened: Boolean(settings.startedAt),
    walletPaise: balance.walletPaise,
    outstandingPaise: balance.outstandingPaise,
    codLimitPaise: settings.codLimitPaise,
    codBlocked: balance.outstandingPaise >= settings.codLimitPaise,
    minWithdrawalPaise: settings.minWithdrawalPaise,
    entries: rows.map(entryView),
  };
};

/* ── Opening the ledger ───────────────────────────────────────────────── */

/**
 * What each rider carries into the ledger, as of `asOf`:
 *
 *   outstanding   cash collected at doors before `asOf`, less cash handed
 *                 over before it — exactly what `cashInHand.service` shows
 *                 today, so no rider's figure jumps on the day it opens
 *   wallet        (only with `withEarnings`) earnings on deliveries before
 *                 `asOf`, which have never been paid through the app. Off
 *                 by default: whether they were paid some other way is a
 *                 decision for a person, not this function.
 */
const openingBalances = async (asOf, { withEarnings = false } = {}) => {
  const [collected, deposited, earned] = await Promise.all([
    FoodOrder.aggregate([
      { $match: { 'collection.method': 'cash', 'collection.collectedAt': { $lt: asOf } } },
      { $group: { _id: '$collection.collectedBy', total: { $sum: '$collection.amountPaise' }, n: { $sum: 1 } } },
    ]),
    DriverCashDeposit.aggregate([
      { $match: { recordedAt: { $lt: asOf } } },
      { $group: { _id: '$driverId', total: { $sum: '$amountPaise' } } },
    ]),
    withEarnings
      ? FoodOrder.aggregate([
        {
          $match: {
            status: 'delivered',
            'delivery.driverId': { $nin: ['', null] },
            'delivery.deliveredAt': { $lt: asOf },
          },
        },
        { $group: { _id: '$delivery.driverId', total: { $sum: '$delivery.earnings' }, n: { $sum: 1 } } },
      ])
      : [],
  ]);

  const byId = new Map();
  const at = (id) => {
    if (!byId.has(id)) {
      byId.set(id, {
        driverId: id, collectedPaise: 0, depositedPaise: 0, cashOrders: 0, earnedPaise: 0, trips: 0,
      });
    }
    return byId.get(id);
  };
  for (const row of collected) if (row._id) Object.assign(at(row._id), { collectedPaise: row.total || 0, cashOrders: row.n });
  for (const row of deposited) if (row._id) at(row._id).depositedPaise = row.total || 0;
  for (const row of earned) if (row._id) Object.assign(at(row._id), { earnedPaise: rupeesToPaise(row.total), trips: row.n });

  return [...byId.values()]
    .map((r) => ({
      ...r,
      outstandingPaise: Math.max(0, r.collectedPaise - r.depositedPaise),
      walletPaise: r.earnedPaise,
    }))
    .filter((r) => r.outstandingPaise > 0 || r.walletPaise > 0);
};

/**
 * Open the ledger: stamp `startedAt`, then write one `opening` row per rider.
 *
 * `startedAt` is claimed first, with a conditional write, so two runs cannot
 * both open it — and from that instant the live path posts every new
 * delivery, while this carries in everything before it. The two meet at one
 * timestamp, so nothing is counted twice and nothing falls between.
 *
 * Without `run` it only reports what it would write.
 */
const openLedger = async ({
  run = false, withEarnings = false, by = 'script', now = new Date(),
} = {}) => {
  const existing = await getSettings();
  if (existing.startedAt) {
    return { opened: false, alreadyOpenedAt: existing.startedAt, riders: [] };
  }

  if (!run) {
    return { opened: false, dryRun: true, riders: await openingBalances(now, { withEarnings }) };
  }

  const claimed = await RiderLedgerSettings.findOneAndUpdate(
    { _id: SETTINGS_ID, startedAt: null },
    { $set: { startedAt: now, updatedBy: by }, $setOnInsert: { _id: SETTINGS_ID } },
    { upsert: true, new: true },
  ).catch((error) => {
    if (error.code === 11000) return null; // another run opened it a moment ago
    throw error;
  });
  if (!claimed || claimed.startedAt.getTime() !== now.getTime()) {
    const after = await getSettings();
    return { opened: false, alreadyOpenedAt: after.startedAt, riders: [] };
  }

  const riders = await openingBalances(now, { withEarnings });
  for (const rider of riders) {
    // eslint-disable-next-line no-await-in-loop
    await post(rider.driverId, () => ({
      kind: 'opening',
      walletPaise: rider.walletPaise,
      outstandingPaise: rider.outstandingPaise,
      key: `opening:${rider.driverId}`,
      note: `Carried over: ${rider.cashOrders} cash order(s)`
        + (withEarnings ? `, ${rider.trips} delivery earning(s)` : ''),
      by,
      at: now,
    }));
    // eslint-disable-next-line no-await-in-loop
    if (withEarnings) await autoAdjust(rider.driverId);
  }
  return { opened: true, startedAt: now, riders };
};

module.exports = {
  LedgerRefusal,
  getSettings,
  balanceFor,
  balancesFor,
  codBlockedDriverIds,
  isCodBlocked,
  post,
  autoAdjust,
  deliveryChange,
  postDelivery,
  sweepUnposted,
  recordDeposit,
  statementFor,
  openingBalances,
  openLedger,
};
