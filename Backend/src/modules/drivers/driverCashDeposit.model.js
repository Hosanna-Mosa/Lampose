/* ══════════════════════════════════════════════════════════════════════════
   Cash a rider has handed back to Lampose.

   A rider collecting cash-on-delivery orders ends a shift holding money that
   is not theirs. Each row here is one hand-over of that money — counted at an
   office, or paid into Lampose's account — recorded by the administrator who
   received it.

   ## What this is NOT: a balance

   There is no "cash in hand" field on the rider and none here. What a rider
   holds is DERIVED every time it is asked for, by `cashInHand.service.js`:

       cash collected at doors  (food_orders, collection.method = 'cash')
     − cash handed over         (this collection)

   For the reason `driver.model.js` gives about earnings: a counter and a
   ledger that disagree is the worst bug a money screen can have, and the only
   way they cannot disagree is for there to be one of them.

   Rows are never edited or deleted by the product. A mistake is corrected by
   a new row, which leaves the mistake and its correction both on record.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

/* How the money reached Lampose. `cash` is notes counted at an office;
   `bank` and `upi` are a transfer into Lampose's own account. */
const DEPOSIT_METHODS = ['cash', 'bank', 'upi'];

const driverCashDepositSchema = new mongoose.Schema(
  {
    driverId: { type: String, required: true, index: true },
    amountPaise: { type: Number, required: true, min: 1 },
    method: { type: String, enum: DEPOSIT_METHODS, default: 'cash' },
    /* A bank or UPI reference, a receipt number — whatever lets somebody find
       this money again in a statement. */
    reference: { type: String, default: '', maxlength: 120 },
    note: { type: String, default: '', maxlength: 500 },
    /* Who received it, off their own admin token — never off a request body. */
    recordedBy: { type: String, required: true },
    recordedAt: { type: Date, default: Date.now, index: true },
  },
  { collection: 'driver_cash_deposits', versionKey: false },
);

driverCashDepositSchema.index({ driverId: 1, recordedAt: -1 });

const DriverCashDeposit = mongoose.model('DriverCashDeposit', driverCashDepositSchema);

module.exports = DriverCashDeposit;
module.exports.DEPOSIT_METHODS = DEPOSIT_METHODS;
