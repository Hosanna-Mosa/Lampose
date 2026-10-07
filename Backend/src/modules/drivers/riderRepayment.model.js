/* ══════════════════════════════════════════════════════════════════════════
   A rider paying back what they owe Lampose, by UPI, from the rider app.

   The rider taps "Pay ₹X" on their outstanding; this row is made with a
   Razorpay payment link for that amount, and the app opens the link in the
   rider's UPI app. When Razorpay says it was paid — the webhook, or the
   app's status check asking Razorpay directly — the row turns `paid` and a
   `repayment` row goes onto the ledger. See `riderRepayment.service.js`.

   This row is the attempt; the ledger is the money. A row that never gets
   paid moved nothing and simply ends `expired` or `superseded`.

     created      link open, waiting for the rider to pay
     paid         Razorpay confirmed it; the ledger has been credited
     superseded   the rider asked again (a different amount) — the old link
                  was cancelled. If it is paid anyway, it still settles.
     expired      the link ran out unpaid
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const REPAYMENT_STATUSES = ['created', 'paid', 'superseded', 'expired'];

const riderRepaymentSchema = new mongoose.Schema(
  {
    repaymentId: { type: String, required: true, unique: true }, // RPY-xxxxxxxx
    driverId: { type: String, required: true, index: true },
    amountPaise: { type: Number, required: true, min: 100 },
    status: { type: String, enum: REPAYMENT_STATUSES, default: 'created' },

    linkId: { type: String, default: '', index: true },
    linkUrl: { type: String, default: '' },
    expiresAt: { type: Date, default: null },

    paymentId: { type: String, default: '' },
    paidPaise: { type: Number, default: 0, min: 0 },
    paidAt: { type: Date, default: null },
    /* When the `repayment` ledger row was written. Null on a paid row means
       the posting failed and the sweep still owes it. */
    ledgerPostedAt: { type: Date, default: null },
  },
  { collection: 'rider_repayments', versionKey: false, timestamps: true },
);

riderRepaymentSchema.index({ driverId: 1, createdAt: -1 });

const RiderRepayment = mongoose.model('RiderRepayment', riderRepaymentSchema);

module.exports = RiderRepayment;
module.exports.REPAYMENT_STATUSES = REPAYMENT_STATUSES;
