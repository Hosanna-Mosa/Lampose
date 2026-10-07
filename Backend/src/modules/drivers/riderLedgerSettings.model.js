/* ══════════════════════════════════════════════════════════════════════════
   The rider ledger's one settings document.

     startedAt            when the ledger opened. A delivery is posted to the
                          ledger only if it was delivered at or after this —
                          everything before is carried in as one `opening`
                          row per rider by `scripts/open-rider-ledger.js`, so
                          no order is counted twice and none is missed. Null
                          means the ledger has not been opened, and nothing
                          is posted.
     codLimitPaise        at or above this much outstanding, a rider is not
                          offered cash-on-delivery orders.
     minWithdrawalPaise   the smallest wallet withdrawal a rider may ask for.

   One document (`_id: 'rider_ledger'`), the same shape as
   `visit_fee_settings`: a row, not environment variables, so the console can
   change the limit and the change is on record.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const SETTINGS_ID = 'rider_ledger';

const DEFAULTS = Object.freeze({
  startedAt: null,
  codLimitPaise: 2000 * 100,
  minWithdrawalPaise: 100 * 100,
});

const riderLedgerSettingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: SETTINGS_ID },
    startedAt: { type: Date, default: DEFAULTS.startedAt },
    codLimitPaise: { type: Number, default: DEFAULTS.codLimitPaise, min: 0 },
    minWithdrawalPaise: { type: Number, default: DEFAULTS.minWithdrawalPaise, min: 0 },
    updatedBy: { type: String, default: '' },
  },
  { collection: 'rider_ledger_settings', versionKey: false, timestamps: true },
);

const RiderLedgerSettings = mongoose.model('RiderLedgerSettings', riderLedgerSettingsSchema);

module.exports = RiderLedgerSettings;
module.exports.SETTINGS_ID = SETTINGS_ID;
module.exports.DEFAULTS = DEFAULTS;
