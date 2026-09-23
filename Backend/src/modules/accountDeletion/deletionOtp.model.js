/* ══════════════════════════════════════════════════════════════════════════
   `account_deletion_otps` — the one-time code behind the public delete page.

   Its own collection rather than each account's `otp` sub-document, for two
   reasons:

     · `food_restaurants` has no `otp` sub-document at all — its sign-in code
       is proved before the document exists — so there was nowhere to put one.
     · A code sent to DELETE an account should not also be a valid code to
       SIGN IN to it, and sharing the sign-in slot made it both.

   One row per (audience, phone). A row is only ever written for a number that
   has an account in that audience — the controller answers every other
   number with the same reply and writes nothing — so this collection is not a
   list of numbers somebody typed into a public form.

   Rows age out on their own a day after their last change: long enough to
   carry a cooldown and a lock, short enough that nothing here outlives its use.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const deletionOtpSchema = new mongoose.Schema(
  {
    audience: { type: String, required: true },
    phone: { type: String, required: true },
    hash: { type: String, default: null },
    salt: { type: String, default: null },
    expiresAt: { type: Date, default: null },
    attempts: { type: Number, default: 0 },
    lastSentAt: { type: Date, default: null },
    campId: { type: String, default: null },
    lockedUntil: { type: Date, default: null },
  },
  { timestamps: true, collection: 'account_deletion_otps', strict: true },
);

deletionOtpSchema.index({ audience: 1, phone: 1 }, { unique: true });
deletionOtpSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

module.exports = mongoose.models.AccountDeletionOtp
  || mongoose.model('AccountDeletionOtp', deletionOtpSchema);
