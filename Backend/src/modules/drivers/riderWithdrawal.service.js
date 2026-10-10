/* ══════════════════════════════════════════════════════════════════════════
   Paying a rider's wallet out — see `riderWithdrawal.model.js`.

     requestWithdrawal(driverId, { amountPaise })   the rider asks
     markPaid(withdrawalId, { reference, by })      a Super Admin paid it
     rejectWithdrawal(withdrawalId, { reason, by }) … or refused it

   ## When a rider may ask

     · the ledger is open
     · they owe nothing — `outstanding` is ₹0. The wallet clears outstanding
       automatically, so a rider with money in the wallet normally owes
       nothing anyway; this is the rule for the moment in between.
     · at least the minimum (settings, ₹100 by default) and no more than the
       wallet holds
     · a bank account or UPI id saved to be paid into
     · no other request still open

   The last three that touch money are checked inside `riderLedger.post`
   against the balance as it stands at the write, so two requests at once
   cannot both spend the same wallet; the one-open rule is a unique index.

   ## Order of writes

   The request row first (the unique index refuses a second open one), then
   the `withdrawal` ledger row. If the ledger refuses — not enough in the
   wallet by the time it is written — the request row is removed: it never
   held any money and nothing points at it. Paying is one conditional write
   on the request; refusing is that plus a `withdrawal_reversed` row, keyed
   so it can only ever be written once.
   ══════════════════════════════════════════════════════════════════════════ */
const Driver = require('./driver.model');
const RiderWithdrawal = require('./riderWithdrawal.model');
const riderLedger = require('./riderLedger.service');
const realtime = require('../../infrastructure/realtime/realtime');

const { LedgerRefusal } = riderLedger;
const { makeWithdrawalId } = RiderWithdrawal;

const LOG = '🏦 [rider-withdrawal]';

const rupees = (paise) => `₹${(paise / 100).toFixed(2)}`;

let indexesReady = null;
const ensureIndexes = () => {
  if (!indexesReady) {
    indexesReady = RiderWithdrawal.createIndexes().catch((error) => {
      indexesReady = null;
      throw error;
    });
  }
  return indexesReady;
};

/** What the rider and the console's list see. `full` adds the account number. */
const withdrawalView = (row, { full = false } = {}) => {
  const account = row.account || {};
  return {
    withdrawalId: row.withdrawalId,
    driverId: row.driverId,
    driverName: row.driverName || '',
    driverPhone: row.driverPhone || '',
    amountPaise: row.amountPaise,
    status: row.status,
    account: {
      accountHolderName: account.accountHolderName || '',
      accountLast4: account.accountLast4 || '',
      ifscCode: account.ifscCode || '',
      bankName: account.bankName || '',
      upiId: account.upiId || '',
      ...(full ? { bankAccountNumber: account.bankAccountNumber || '' } : {}),
    },
    requestedAt: row.requestedAt,
    paidAt: row.paidAt,
    reference: row.reference || '',
    rejectedAt: row.rejectedAt,
    rejectionReason: row.rejectionReason || '',
    decidedBy: row.decidedBy || '',
  };
};

const tellRider = async (driverId, extra = {}) => {
  try {
    realtime.toDriver(driverId, 'wallet_update', {
      ...(await riderLedger.statementFor(driverId, { limit: 10 })),
      ...extra,
    });
  } catch (error) {
    console.error(`${LOG} could not tell ${driverId}: ${error.message}`);
  }
};

/* ── The rider asks ───────────────────────────────────────────────────── */

/**
 * @returns {Promise<object>} the request view
 * @throws LedgerRefusal
 */
const requestWithdrawal = async (driverId, { amountPaise } = {}) => {
  const settings = await riderLedger.getSettings();
  if (!settings.startedAt) {
    throw new LedgerRefusal('LEDGER_NOT_OPEN', 'Withdrawals are not switched on yet.');
  }

  const driver = await Driver.findOne({ driverId })
    .select('+payout.bankAccountNumber').lean();
  const payout = (driver && driver.payout) || {};
  const hasBank = Boolean(payout.bankAccountNumber && payout.ifscCode);
  if (!hasBank && !payout.upiId) {
    throw new LedgerRefusal(
      'NO_PAYOUT_ACCOUNT',
      'Add your bank account or UPI id in Profile → Bank details first, so we know where to send it.',
    );
  }

  const balance = await riderLedger.balanceFor(driverId);
  const amount = amountPaise == null ? balance.walletPaise : Math.round(Number(amountPaise));
  if (!Number.isFinite(amount) || amount < settings.minWithdrawalPaise) {
    throw new LedgerRefusal(
      'BELOW_MINIMUM',
      `You can withdraw ${rupees(settings.minWithdrawalPaise)} or more.`,
      amountPaise == null ? 409 : 400,
    );
  }

  await ensureIndexes();
  const withdrawalId = makeWithdrawalId();
  let row;
  try {
    row = await RiderWithdrawal.create({
      withdrawalId,
      driverId,
      driverName: driver.name || '',
      driverPhone: driver.phone || '',
      amountPaise: amount,
      account: {
        accountHolderName: payout.accountHolderName || driver.name || '',
        bankAccountNumber: hasBank ? payout.bankAccountNumber : '',
        accountLast4: hasBank ? (payout.accountLast4 || String(payout.bankAccountNumber).slice(-4)) : '',
        ifscCode: hasBank ? payout.ifscCode : '',
        bankName: hasBank ? (payout.bankName || '') : '',
        upiId: payout.upiId || '',
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      throw new LedgerRefusal('ALREADY_REQUESTED', 'You already have a withdrawal waiting to be paid.');
    }
    throw error;
  }

  try {
    await riderLedger.post(driverId, (current) => {
      if (current.outstandingPaise > 0) {
        throw new LedgerRefusal(
          'OUTSTANDING_DUE',
          `Pay the ${rupees(current.outstandingPaise)} you owe Lampose first.`,
        );
      }
      if (amount > current.walletPaise) {
        throw new LedgerRefusal('NOT_ENOUGH_IN_WALLET', `Your wallet has ${rupees(current.walletPaise)}.`);
      }
      return {
        kind: 'withdrawal',
        walletPaise: -amount,
        outstandingPaise: 0,
        key: `withdrawal:${withdrawalId}`,
        reference: withdrawalId,
        note: 'Withdrawal requested — waiting to be paid',
        by: 'rider',
      };
    });
  } catch (error) {
    await RiderWithdrawal.deleteOne({ _id: row._id, status: 'requested' });
    throw error;
  }

  console.log(`${LOG} ${withdrawalId} · ${driverId} asked for ${rupees(amount)}`);
  await tellRider(driverId);
  return withdrawalView(row.toObject());
};

/* ── The console decides ──────────────────────────────────────────────── */

/**
 * Record that the money was sent. Requires the bank / UPI reference.
 * @throws LedgerRefusal
 */
const markPaid = async (withdrawalId, { reference, by }) => {
  const ref = String(reference || '').trim().slice(0, 120);
  if (!ref) {
    throw new LedgerRefusal('REFERENCE_REQUIRED', 'Enter the bank or UPI reference of the transfer.', 400);
  }
  const updated = await RiderWithdrawal.findOneAndUpdate(
    { withdrawalId, status: 'requested' },
    { $set: { status: 'paid', paidAt: new Date(), reference: ref, decidedBy: by } },
    { new: true },
  ).lean();
  if (!updated) throw await notOpen(withdrawalId);

  console.log(`${LOG} ${withdrawalId} PAID ${rupees(updated.amountPaise)} to ${updated.driverId} · ${ref} · by ${by}`);
  await tellRider(updated.driverId, { withdrawal: withdrawalView(updated) });
  return withdrawalView(updated);
};

/**
 * Refuse a request. The amount goes back into the rider's wallet.
 * @throws LedgerRefusal
 */
const rejectWithdrawal = async (withdrawalId, { reason, by }) => {
  const why = String(reason || '').trim().slice(0, 500);
  if (!why) {
    throw new LedgerRefusal('REASON_REQUIRED', 'Say why — the rider is shown it.', 400);
  }
  const updated = await RiderWithdrawal.findOneAndUpdate(
    { withdrawalId, status: 'requested' },
    { $set: { status: 'rejected', rejectedAt: new Date(), rejectionReason: why, decidedBy: by } },
    { new: true },
  ).lean();
  if (!updated) throw await notOpen(withdrawalId);

  await riderLedger.post(updated.driverId, () => ({
    kind: 'withdrawal_reversed',
    walletPaise: updated.amountPaise,
    outstandingPaise: 0,
    key: `withdrawal_reversed:${withdrawalId}`,
    reference: withdrawalId,
    note: `Withdrawal not paid: ${why}`,
    by,
  }));
  /* Back in the wallet, it clears anything the rider has come to owe since. */
  await riderLedger.autoAdjust(updated.driverId);

  console.log(`${LOG} ${withdrawalId} REJECTED for ${updated.driverId} · by ${by}: ${why}`);
  await tellRider(updated.driverId, { withdrawal: withdrawalView(updated) });
  return withdrawalView(updated);
};

const notOpen = async (withdrawalId) => {
  const row = await RiderWithdrawal.findOne({ withdrawalId }).select('status').lean();
  return row
    ? new LedgerRefusal('NOT_OPEN', `This withdrawal is already ${row.status}.`)
    : new LedgerRefusal('NOT_FOUND', 'No withdrawal with that reference.', 404);
};

/* ── Reading ──────────────────────────────────────────────────────────── */

/** A rider's own requests, newest first. */
const withdrawalsFor = async (driverId, { limit = 20 } = {}) => {
  const rows = await RiderWithdrawal.find({ driverId }).sort({ requestedAt: -1 }).limit(limit).lean();
  return rows.map((row) => withdrawalView(row));
};

/** The console's queue: by status, oldest request first for `requested`.
 *
 *  `search` (rider, phone, reference, UPI id) and `method` (`bank` / `upi`)
 *  narrow it on the server, because the list stops at a page and a search over
 *  one page silently misses the rest. `counts` stays the whole collection —
 *  the stat cards; `facets` counts each dimension under the OTHER filters, so
 *  a chip's number is what that chip would show. */
const listWithdrawals = async ({ status = 'requested', search = '', method = '', limit = 100 } = {}) => {
  const clauses = {};
  if (status && status !== 'all') clauses.status = { status };
  const q = String(search || '').trim();
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    clauses.search = {
      $or: [
        { withdrawalId: rx }, { driverId: rx }, { driverName: rx }, { driverPhone: rx },
        { 'account.upiId': rx }, { 'account.accountHolderName': rx }, { reference: rx },
      ],
    };
  }
  /* A request can carry both; it then counts under both. */
  if (method === 'bank') clauses.method = { 'account.accountLast4': { $nin: ['', null] } };
  else if (method === 'upi') clauses.method = { 'account.upiId': { $nin: ['', null] } };

  const where = (...skip) => {
    const parts = Object.entries(clauses).filter(([k]) => !skip.includes(k)).map(([, v]) => v);
    return parts.length ? { $and: parts } : {};
  };
  const byMethod = where('method');

  const sort = status === 'requested' ? { requestedAt: 1 } : { requestedAt: -1 };
  const [rows, counts, statusFacet, anyMethod, bank, upi, matching] = await Promise.all([
    RiderWithdrawal.find(where()).sort(sort).limit(Math.min(limit, 200)).lean(),
    RiderWithdrawal.aggregate([
      { $group: { _id: '$status', n: { $sum: 1 }, paise: { $sum: '$amountPaise' } } },
    ]),
    RiderWithdrawal.aggregate([{ $match: where('status') }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    RiderWithdrawal.countDocuments(byMethod),
    RiderWithdrawal.countDocuments({ ...byMethod, 'account.accountLast4': { $nin: ['', null] } }),
    RiderWithdrawal.countDocuments({ ...byMethod, 'account.upiId': { $nin: ['', null] } }),
    RiderWithdrawal.countDocuments(where()),
  ]);
  const byStatus = Object.fromEntries(counts.map((c) => [c._id, { count: c.n, amountPaise: c.paise }]));
  return {
    items: rows.map((row) => withdrawalView(row)),
    counts: byStatus,
    facets: {
      status: {
        ...Object.fromEntries(statusFacet.map((c) => [c._id, c.n])),
        all: statusFacet.reduce((sum, c) => sum + c.n, 0),
      },
      method: { all: anyMethod, bank, upi },
      matching,
    },
  };
};

/** One request; `full` (the payer) includes the account number. */
const getWithdrawal = async (withdrawalId, { full = false } = {}) => {
  const query = RiderWithdrawal.findOne({ withdrawalId });
  if (full) query.select('+account.bankAccountNumber');
  const row = await query.lean();
  return row ? withdrawalView(row, { full }) : null;
};

module.exports = {
  withdrawalView,
  requestWithdrawal,
  markPaid,
  rejectWithdrawal,
  withdrawalsFor,
  listWithdrawals,
  getWithdrawal,
};
