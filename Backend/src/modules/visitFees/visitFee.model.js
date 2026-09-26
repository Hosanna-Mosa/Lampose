/* ══════════════════════════════════════════════════════════════════════════
   `visit_fee_settings` — what an assisted visit costs, per layout.

   ONE document (`_id: 'current'`). The fee used to be a single env variable
   (`VISIT_ASSISTED_AMOUNT_PAISE`, ₹199 for every bachelor room); it is now a
   table keyed by layout tier, edited by a Super Admin in the console, so a
   price change is a form and not a deploy.

   Only the amounts live here. Which tiers exist, their labels and the rule
   that maps a listing's free-text layout onto one are code, in
   `visitFees.service.js` — a tier the code cannot produce is a price nobody
   can ever be charged, so the table cannot invent one.

   Every change is also written to `admin_audit_log` with the before and the
   after (`visit_fees.changed`). `updatedBy` here is a convenience for the
   console's "last changed by" line, not the record.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const visitFeeSettingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: 'current' },
    /* tier key → paise. `Mixed` rather than a fixed sub-schema so a tier added
       in code later does not need a migration; the service fills the gaps
       from its defaults. */
    tiers: { type: mongoose.Schema.Types.Mixed, default: {} },
    updatedBy: {
      adminId: { type: String, default: '' },
      name: { type: String, default: '' },
      email: { type: String, default: '' },
    },
  },
  { timestamps: true, collection: 'visit_fee_settings', minimize: false },
);

module.exports = mongoose.models.VisitFeeSettings
  || mongoose.model('VisitFeeSettings', visitFeeSettingsSchema);
