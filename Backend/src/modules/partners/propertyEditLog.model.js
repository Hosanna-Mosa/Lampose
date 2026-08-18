/* ══════════════════════════════════════════════════════════════════════════
   `partner_property_edit_logs` — the paper trail for propertyEdit.controller.js.

   Owner edits from the Stay Partner app write straight to `properties` with
   no administrator review (see the header of propertyEdit.controller.js for
   why that is a deliberate product decision, not an oversight). That removes
   the one check the v1 onboarding surface has always had before a listing's
   facts change, so this collection is the replacement for it: not a gate,
   because nothing here blocks the write, but a record of exactly what an
   owner changed and when, so a bad edit — a fat-fingered rent, a rewritten
   address — can be found and reasoned about after the fact instead of being
   indistinguishable from how the property always looked.

   `before`/`after` are the whole document, not a diff of the touched fields.
   A diff is smaller, but computing "what changed" instead of "what shape did
   this listing have at this moment" is exactly the kind of derived value that
   goes stale the first time someone reads it a year from now and cannot
   reconstruct the fields that only ever moved as a side effect of another
   field's write.

   No admin-console reader exists for this yet — that is real, follow-on work
   the moment a support case needs "who changed this listing", not a promise
   this file makes on its own.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const propertyEditLogSchema = new mongoose.Schema(
  {
    property: {
      type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true, index: true,
    },
    /* Both id and the phone digits at the time of the edit — the id survives
       a phone number changing later, the digits survive the partner account
       itself being gone. */
    partnerId: { type: String, required: true, index: true },
    partnerPhoneDigits: { type: String, default: '' },
    before: { type: mongoose.Schema.Types.Mixed, default: {} },
    after: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, collection: 'partner_property_edit_logs', strict: true },
);

propertyEditLogSchema.index({ property: 1, createdAt: -1 });

module.exports = mongoose.models.PartnerPropertyEditLog
  || mongoose.model('PartnerPropertyEditLog', propertyEditLogSchema);
