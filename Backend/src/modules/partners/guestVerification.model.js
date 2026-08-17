/* ══════════════════════════════════════════════════════════════════════════
   A one-time code sent to a GUEST, so an owner can prove the walk-in in front
   of them is reachable on the number they just typed.

   ## Why this is not one of the three auth flows

   `app_customers`, `app_partners` and `visitrequests` all issue codes too, and
   all three of them create or open an ACCOUNT. This one must not. The person
   receiving this code is a walk-in the owner is logging by hand: they have no
   Lampose account, they are not signing in, and issuing them one as a side
   effect of an owner filling in a form would be an account nobody asked for
   and nobody controls.

   So the code lives here, on its own, and proves exactly one thing: that the
   number typed into the Add Customer form reaches the person standing there.

   The hashing, the pepper, the ten-minute window and the attempt ceiling are
   all `visits/otp.util` unchanged — the same primitives the other three use,
   because three implementations of the same thing means the one nobody tests
   is the one that drifts.

   ## It expires by itself

   A TTL index on `expiresAt` clears the row once the window closes. These are
   disposable by nature: an owner who abandons the form halfway leaves a
   challenge behind, and there is nothing worth keeping in it — the code is a
   hash, and the phone number is on the booking if the form was ever finished.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const guestVerificationSchema = new mongoose.Schema(
  {
    /* Whose form this belongs to. Every read and every verify is scoped by it,
       so one owner can never consume another owner's challenge. */
    partnerPhoneDigits: { type: String, required: true, index: true },

    /* The guest's number, E.164. Indexed with the partner so the pair is one
       lookup — an owner re-sending to the same guest reuses this row rather
       than accumulating one per tap. */
    guestPhone: { type: String, required: true },

    /*
     * Not `required`, and that is load bearing rather than lax.
     *
     * Both are blanked the moment a code is accepted, so the same six digits
     * cannot be replayed while the response is still in flight — but the ROW
     * has to survive that, because it is the proof the create-booking call
     * looks up a minute later. A `required: true` here made `save()` throw a
     * ValidationError at exactly that point, so a correct code came back as
     * a 400 and no walk-in could ever be saved.
     *
     * An empty pair therefore means "spent"; `verifiedAt` says whether it was
     * spent successfully.
     */
    hash: { type: String, default: '' },
    salt: { type: String, default: '' },
    attempts: { type: Number, default: 0 },
    resends: { type: Number, default: 0 },
    lastSentAt: { type: Date, default: Date.now },

    /*
     * Set once the code comes back correct, and the only thing the booking
     * endpoint will accept as proof.
     *
     * Kept AFTER verification rather than deleted, so the create-booking call
     * that follows can find it — the two are separate requests and the owner
     * may take a minute over the rest of the form. The TTL still collects it.
     */
    verifiedAt: { type: Date, default: null },

    /* When the code stops working. Extended past the code's own window once
       verified, so the proof outlives the code and the form has time to be
       finished. */
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, collection: 'partner_guest_verifications' },
);

/** One live challenge per owner+guest pair. */
guestVerificationSchema.index({ partnerPhoneDigits: 1, guestPhone: 1 }, { unique: true });

/** Mongo drops the row itself once `expiresAt` passes. */
guestVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.PartnerGuestVerification
  || mongoose.model('PartnerGuestVerification', guestVerificationSchema, 'partner_guest_verifications');
