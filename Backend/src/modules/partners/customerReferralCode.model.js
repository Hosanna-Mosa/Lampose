/* ══════════════════════════════════════════════════════════════════════════
   A one-time invite code for ONE guest — how a partner refers a customer.

   This replaces an earlier design (one static code printed per property) that
   was rejected for being open to anyone who ever saw it. Every row here is
   minted only after the guest's own phone is proven — either just now, via
   the same `GuestVerification` OTP the Add Customer form uses, or earlier, by
   reusing the proof already sitting on an existing `PartnerBooking` — so a
   code that leaks is still only redeemable by the exact phone it was issued
   to. See `customerReferral.controller.js`.

   ## Why a code, not a link

   The codes this app already has (the owner↔owner referral code) are typed
   in by hand, and an invite handed to someone in person — on a slip, over
   WhatsApp, read aloud — is the same shape of thing. A deep link would need
   the User App installed to resolve at all, which is backwards for a person
   who is being invited to install it.

   ## Expiry is the guardrail

   Seven days from minting, fixed. A code an owner generated and never handed
   over, or one that leaked, goes stale on its own rather than staying
   redeemable indefinitely — see the header note in
   `customerReferral.controller.js` for the rest of the abuse-resistance
   story.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const customerReferralCodeSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, index: true },

    /* Whose invite this is, and which listing it credits. `propertyName` is
       denormalised so the owner's invite list and the customer's "referred by"
       messaging never have to join back to `properties` to read something
       this small. */
    partnerPhoneDigits: { type: String, required: true, index: true },
    propertyId: { type: String, required: true },
    propertyName: { type: String, required: true },

    /* Who it was issued to. `guestPhone` is what redemption is actually
       checked against — see `redeemCustomerReferralCode` — `guestName` is
       display only. */
    guestName: { type: String, default: '' },
    guestPhone: { type: String, required: true, index: true },

    expiresAt: { type: Date, required: true },

    /* Both null until redeemed, and never cleared afterwards — a used code
       stays used rather than becoming available again. */
    usedAt: { type: Date, default: null },
    usedByCustomerId: { type: String, default: null },
  },
  { timestamps: true, collection: 'partner_customer_referral_codes' },
);

module.exports = mongoose.models.CustomerReferralCode
  || mongoose.model('CustomerReferralCode', customerReferralCodeSchema, 'partner_customer_referral_codes');
