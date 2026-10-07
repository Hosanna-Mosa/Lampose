/* ══════════════════════════════════════════════════════════════════════════
   A rider asking for their wallet to be paid out, and what came of it.

     requested → paid       a Super Admin sent the money and gave the reference
     requested → rejected   refused with a reason; the money goes back to the
                            wallet as a `withdrawal_reversed` ledger row

   Nothing here moves money. A member of Lampose staff makes the transfer
   themselves and records it — the same arrangement as restaurant payouts
   (`foodPayout.model.js`), with the same three states for the same reason.

   ## The money leaves the wallet at the REQUEST

   Asking writes a `withdrawal` row onto the ledger straight away, so the
   wallet shows what is still free and the same rupee cannot be asked for
   twice. Paying changes nothing on the ledger; refusing puts it back.

   ## One open request per rider

   A partial unique index on `{ driverId }` where `status: 'requested'` — so
   two taps at once cannot open two, whatever the app does.

   ## The account is a SNAPSHOT

   Where the money was to go, as it was when the rider asked. A rider who
   changes their bank details afterwards does not change where an earlier
   request was paid. The full account number is `select: false`, as on the
   rider — it is read only by the Super Admin who is paying it.
   ══════════════════════════════════════════════════════════════════════════ */
const crypto = require('crypto');
const mongoose = require('mongoose');

const WITHDRAWAL_STATUSES = ['requested', 'paid', 'rejected'];

/* The alphabet the rest of the product's public ids use — no I, O, 0 or 1,
   because these are read down a phone line to support. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const makeWithdrawalId = () => {
  const bytes = crypto.randomBytes(8);
  let body = '';
  for (let i = 0; i < 8; i += 1) body += ALPHABET[bytes[i] % ALPHABET.length];
  return `RWD-${body}`;
};

const riderWithdrawalSchema = new mongoose.Schema(
  {
    withdrawalId: { type: String, required: true, unique: true },
    /* Indexed by `{ driverId, requestedAt }` below, not on its own — a second
       plain index on the same key would clash with the partial unique one. */
    driverId: { type: String, required: true },
    driverName: { type: String, default: '' },
    driverPhone: { type: String, default: '' },
    amountPaise: { type: Number, required: true, min: 1 },
    status: { type: String, enum: WITHDRAWAL_STATUSES, default: 'requested' },

    account: {
      accountHolderName: { type: String, default: '' },
      bankAccountNumber: { type: String, default: '', select: false },
      accountLast4: { type: String, default: '' },
      ifscCode: { type: String, default: '' },
      bankName: { type: String, default: '' },
      upiId: { type: String, default: '' },
    },

    requestedAt: { type: Date, default: Date.now },
    /* Paid: the bank / UPI reference, required. Rejected: the reason, shown
       to the rider. Both name the administrator off their own token. */
    paidAt: { type: Date, default: null },
    reference: { type: String, default: '', maxlength: 120 },
    rejectedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: '', maxlength: 500 },
    decidedBy: { type: String, default: '' },
  },
  { collection: 'rider_withdrawals', versionKey: false, timestamps: true },
);

riderWithdrawalSchema.index(
  { driverId: 1 },
  { unique: true, partialFilterExpression: { status: 'requested' }, name: 'one_open_withdrawal_per_rider' },
);
riderWithdrawalSchema.index({ status: 1, requestedAt: 1 });
riderWithdrawalSchema.index({ driverId: 1, requestedAt: -1 });

const RiderWithdrawal = mongoose.model('RiderWithdrawal', riderWithdrawalSchema);

module.exports = RiderWithdrawal;
module.exports.WITHDRAWAL_STATUSES = WITHDRAWAL_STATUSES;
module.exports.makeWithdrawalId = makeWithdrawalId;
