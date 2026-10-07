/* ══════════════════════════════════════════════════════════════════════════
   A rider's money, one movement per row.

   A rider has two balances, and they point in opposite directions:

     wallet        what Lampose owes the rider — earnings from orders the
                   diner paid online, or by UPI on the doorstep QR.
     outstanding   what the rider owes Lampose — the cash they took at a door,
                   less the earning they kept out of it.

   The ₹500 cash order of which ₹30 is the rider's: the rider keeps ₹30 out
   of the notes in their hand, and `outstanding` goes up by ₹470. The same
   order paid online: `wallet` goes up by ₹30 and nothing is owed.

   ## One ledger, and the balance is its last row

   `driver.model.js` explains why this codebase keeps no counters beside a
   ledger: a counter and a ledger that disagree is the worst bug a money
   screen can have. This keeps that rule. There is no balance on the rider —
   each row carries the balances AFTER it (`walletAfterPaise`,
   `outstandingAfterPaise`), so the current balance is simply the newest row,
   and the history explains it to the paisa.

   ## Why `seq`, and why it is unique

   Two movements for one rider can be written at the same moment (a delivery
   and a withdrawal, two parallel retries). Each writer reads the newest row,
   adds its change, and inserts with `seq + 1`. `{ driverId, seq }` is unique,
   so of two writers that read the same newest row, exactly one insert lands;
   the other gets a duplicate-key error and starts again from the new newest
   row. That is the whole concurrency story — no transactions (production has
   no replica set, see tests/helpers/db.js), no locks.

   ## Why `key`

   One delivery is one earning, however many times it is posted — the live
   path, the sweep that backs it up, and a retry may all try. `key` is unique
   where present (`delivered:<orderNumber>`, `opening:<driverId>`, …), so the
   second post of the same thing finds the first instead of paying twice.

   Rows are never edited or deleted. A mistake is corrected by a new row.
   Paise throughout.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

/*
 *   opening              balances carried over when the ledger started
 *   earning              a delivery paid online / by UPI QR — wallet + earning
 *   cash_order           a delivery paid in cash — outstanding + (cash − earning)
 *   auto_adjust          wallet used to clear outstanding, both − the same amount
 *   cash_deposit         cash handed to Lampose, recorded in the console
 *   repayment            outstanding paid by the rider by UPI in the app
 *   withdrawal           wallet paid out to the rider's bank (held on request)
 *   withdrawal_reversed  a refused withdrawal, back into the wallet
 *   correction           an administrator's adjustment, with a reason
 */
const ENTRY_KINDS = [
  'opening', 'earning', 'cash_order', 'auto_adjust', 'cash_deposit',
  'repayment', 'withdrawal', 'withdrawal_reversed', 'correction',
];

const riderLedgerEntrySchema = new mongoose.Schema(
  {
    driverId: { type: String, required: true },
    seq: { type: Number, required: true, min: 1 },
    kind: { type: String, enum: ENTRY_KINDS, required: true },

    /* The change this row makes, signed. */
    walletPaise: { type: Number, default: 0 },
    outstandingPaise: { type: Number, default: 0 },
    /* The balances after it. Never negative — `post` refuses a row that would
       make either so. */
    walletAfterPaise: { type: Number, required: true, min: 0 },
    outstandingAfterPaise: { type: Number, required: true, min: 0 },

    /* For order rows: what the order was worth to the rider and, for cash,
       what they took at the door — so the history can say "₹500 collected,
       ₹30 kept as your earning" without looking the order up. */
    orderNumber: { type: String, default: '' },
    earningPaise: { type: Number, default: 0, min: 0 },
    collectedPaise: { type: Number, default: 0, min: 0 },

    /* Idempotency — see the header. Absent on rows that are not "the" row of
       some one thing (an automatic adjustment, a correction). */
    key: { type: String },
    /* A reference somebody can find the money by — a Razorpay payment id, a
       bank UTR, a withdrawal id. */
    reference: { type: String, default: '', maxlength: 120 },
    note: { type: String, default: '', maxlength: 500 },
    /* 'system', 'rider', or the administrator's name off their own token. */
    by: { type: String, default: 'system' },
    at: { type: Date, default: Date.now },
  },
  { collection: 'rider_ledger', versionKey: false },
);

riderLedgerEntrySchema.index({ driverId: 1, seq: -1 }, { unique: true });
riderLedgerEntrySchema.index(
  { key: 1 },
  { unique: true, partialFilterExpression: { key: { $type: 'string' } } },
);
riderLedgerEntrySchema.index({ orderNumber: 1 });
riderLedgerEntrySchema.index({ kind: 1, at: -1 });

const RiderLedgerEntry = mongoose.model('RiderLedgerEntry', riderLedgerEntrySchema);

module.exports = RiderLedgerEntry;
module.exports.ENTRY_KINDS = ENTRY_KINDS;
