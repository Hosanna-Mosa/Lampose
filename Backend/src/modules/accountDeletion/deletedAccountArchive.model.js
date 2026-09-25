/* ══════════════════════════════════════════════════════════════════════════
   `deleted_account_archives` — what an account held at the moment it was
   deleted.

   Deleting an account is immediate (see `accountDeletion.eraser.js`): the
   person is signed out, the account stops existing for them, and the live row
   is emptied of everything that identifies them. Before that happens, the row
   as it stood — and the side records the eraser removes outright (payout
   methods, staff, notifications, a kitchen's dishes) — is copied here, once.

   Kept apart from the live collections on purpose: nothing a customer-facing
   route reads ever looks in here, so an archived number cannot reappear in a
   login, a listing or a search. It is read by people, through the database,
   when an order, payout or dispute needs the account that was behind it.

   Credentials are NOT copied (`STRIPPED_FIELDS`): a password hash, a pending
   OTP or a device's push token is a way into or at the account, not a fact
   about it, and keeping it would only be keeping a risk.

   `status` is `pending` from the moment the copy is written until the live
   row has been erased, then `completed`. A `pending` row older than a few
   seconds is an erase that failed half way: the live account still holds its
   data and still works, the person was shown an error, and asking again
   writes a fresh copy and completes the deletion.
   ══════════════════════════════════════════════════════════════════════════ */

const mongoose = require('mongoose');

/** Top-level account fields never copied into an archive. These are the only
    places the four account models keep a credential or a device token. */
const STRIPPED_FIELDS = ['passwordHash', 'passwordSetup', 'otp', 'devices', 'sessionVersion'];

const deletedAccountArchiveSchema = new mongoose.Schema(
  {
    /* customer | partner | restaurant | driver — the AUDIENCES key. */
    app: { type: String, required: true, index: true },
    /* The account's public id (customerId, partnerId, restaurantId, driverId). */
    accountId: { type: String, required: true, index: true },
    /* The live row's _id, which orders and bookings may point at. */
    accountObjectId: { type: mongoose.Schema.Types.ObjectId, index: true },
    /* The real number, so a person can be found by the number they quote. */
    phone: { type: String, default: '', index: true },
    name: { type: String, default: '' },

    /* The live row, as it was, minus `STRIPPED_FIELDS`. */
    account: { type: mongoose.Schema.Types.Mixed, required: true },
    /* The side records the eraser deletes, by name: { paymentMethods: [...] }. */
    related: { type: mongoose.Schema.Types.Mixed, default: {} },
    /* Bookings or orders still open at the moment of deletion. */
    openWork: { type: mongoose.Schema.Types.Mixed, default: {} },

    source: { type: String, default: '' },
    reason: { type: String, default: '' },
    contactEmail: { type: String, default: '' },

    status: { type: String, enum: ['pending', 'completed'], default: 'pending', index: true },
    deletedAt: { type: Date, required: true, index: true },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true, minimize: false },
);

const stripCredentials = (doc) => {
  const copy = { ...doc };
  for (const field of STRIPPED_FIELDS) delete copy[field];
  return copy;
};

module.exports = mongoose.models.DeletedAccountArchive
  || mongoose.model('DeletedAccountArchive', deletedAccountArchiveSchema, 'deleted_account_archives');
module.exports.stripCredentials = stripCredentials;
module.exports.STRIPPED_FIELDS = STRIPPED_FIELDS;
