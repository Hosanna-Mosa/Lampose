/* ══════════════════════════════════════════════════════════════════════════
   The `app_customers` collection — students using the mobile app.

   ## Why this is not `scriper_users`

   That collection holds Lampose staff: an email, a bcrypt password and a role
   of ADMIN or EMPLOYEE, used by the leads panel and the onboarding app. A
   customer has none of those. They have a phone number, they never choose a
   password, and they have no role because there is nothing in this system
   they administer.

   Putting them together would mean one collection where half the documents
   have no password and no email and a `role` that means nothing — and one
   login endpoint that has to work out which kind of account it is looking at
   before it can decide whether a password is required. That is the shape of
   bug where a customer record ends up with staff privileges.

   The prefix follows the rule scriper.model.js sets out and for the same
   reason: three apps share one database, and a collection called `customers`
   is one careless rename away from colliding with something.

   ## No password, ever

   There is no password field and there is not going to be one. A password is
   a thing to forget, reset over an email address we may not have, and be
   locked out of at the exact moment a bed is about to go. The number is also
   the thing an owner needs in order to call, so asking for it is not an extra
   step — it is the step.

   ## The code is never stored

   `otp.hash` is a salted SHA-256, peppered from a process secret, compared in
   constant time — the same utility the visit-request flow uses. A dump of
   this collection must not hand anyone a working code for a session somebody
   is halfway through.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema(
  {
    /* A stable public id. `_id` would work, but every other identity in this
       process has a string id of its own and the app stores this one on the
       device — a Mongo ObjectId in AsyncStorage invites somebody to try
       looking it up in `properties`. */
    customerId: { type: String, required: true, unique: true, index: true },

    /* E.164, normalised before it ever reaches here. Unique, because it IS
       the account: a second document for the same number would mean a
       student who signs in twice has two histories and sees neither. */
    phone: { type: String, required: true, unique: true, index: true, trim: true },

    /* Empty until they say. A signed-in customer with no name is a real and
       ordinary state — they signed in to browse, not to introduce
       themselves — and the app asks for one when an owner is about to need
       it. Required-with-a-default would have written "" and pretended. */
    name: { type: String, default: '', trim: true },

    /* Optional to us, required by the visit-request endpoint, which is where
       the agreement and the receipts go. Not unique: two siblings sharing one
       family address is not a conflict worth refusing an account over. */
    email: { type: String, default: '', lowercase: true, trim: true },

    /* The category the feed is showing, mirrored off the device so a
       reinstall or a second phone does not re-ask the entry question. The
       device copy stays the source of truth — a guest has no account and must
       still browse. */
    category: {
      type: String,
      enum: ['PG_HOSTEL', 'BACHELOR', 'COLIVE', 'HOTEL', ''],
      default: '',
    },

    /* Set the first time a code comes back correct, and never cleared. It is
       what separates "somebody typed this number into a form" from "somebody
       holding this number proved it". */
    phoneVerifiedAt: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },

    /*
     * When the alerts screen was last cleared — a watermark, not a per-item
     * flag.
     *
     * Notifications are DERIVED from this customer's visit requests rather
     * than stored, so there is no row to carry a `read` boolean on. One
     * timestamp answers the two questions the screen actually asks: how many
     * are unread (events after it) and mark-all-read (set it to now).
     *
     * The thing it cannot express is one item read while others stay unread.
     * That is a real limitation and the screen is built to match it — tapping
     * an alert opens what it is about and does not claim to mark it read.
     * Per-item state needs a collection of its own, and would be worth adding
     * the moment notifications come from anywhere other than visit requests.
     */
    notificationsReadAt: { type: Date, default: null },

    /*
     * Where to reach this account's handsets.
     *
     * An array because one person signs in on a phone and a tablet, and both
     * must buzz — a single field would silently mean "the most recent device
     * wins", which is exactly the bug where somebody stops getting alerts
     * after logging in somewhere else once.
     *
     * A token identifies a device INSTALLATION, not a person: it is reissued
     * on reinstall and revoked when the app is removed. So it is written by a
     * session-guarded route, and dropped the moment Expo reports
     * DeviceNotRegistered rather than retried forever against a wiped phone.
     */
    devices: {
      type: [
        {
          _id: false,
          /* `ExponentPushToken[...]`, validated before it is stored. */
          token: { type: String, required: true },
          platform: { type: String, enum: ['ios', 'android', 'web', 'unknown'], default: 'unknown' },
          /* Moved on every sign-in, so a stale device can be pruned by age
             without having to ask Expo about it. */
          lastSeenAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },


    /*
     * The shortlist.
     *
     * `rentWhenSaved` is the reason this is a sub-document rather than a bare
     * array of ids. The saved list's job is comparison, and its best column —
     * "₹500 cheaper since you saved it" — needs the figure that was on screen
     * at the moment somebody decided to keep the place. Recording the id
     * alone makes that column impossible to ever build, because the old price
     * is gone the instant the panel edits it.
     *
     * On the account rather than the device: a shortlist that does not
     * survive a reinstall is a shortlist somebody rebuilds by scrolling, and
     * they will not.
     */
    saved: {
      type: [
        {
          _id: false,
          listingId: { type: String, required: true },
          /* Null where the listing had no rent set when it was saved — an
             owner who has not named a price is a real case, and 0 would read
             as "it was free then". */
          rentWhenSaved: { type: Number, default: null },
          savedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },

    /* Not an enum with a `deleted` member: a deletion request has legal
       retention consequences that are handled where bookings live, and this
       flag exists only so support can stop an abusive number from ordering
       SMS at our expense. */
    status: { type: String, enum: ['active', 'blocked'], default: 'active' },

    otp: {
      hash: { type: String, default: null },
      salt: { type: String, default: null },
      expiresAt: { type: Date, default: null },
      attempts: { type: Number, default: 0 },
      resends: { type: Number, default: 0 },
      lastSentAt: { type: Date, default: null },
      /* The gateway's campaign id — the only handle on a message once it has
         left, so "the code never arrived" can be traced rather than guessed. */
      campId: { type: String, default: null },
      /* When the code was locked after too many wrong tries. The lock is on
         the code, not on the person: asking for a new one clears it. */
      lockedUntil: { type: Date, default: null },
    },
  },
  { timestamps: true, collection: 'app_customers', strict: true },
);

/**
 * What may leave the process.
 *
 * Note what is absent: the whole `otp` sub-document, including the attempt
 * count. A client that could read `attempts` could not do much with it, but
 * the hash and salt beside it are the two things that make an offline
 * brute-force of a six-digit code cheap, and the safe way to keep them out of
 * a response is to project a whitelist rather than delete from a copy.
 */
customerSchema.methods.toPublic = function toPublic() {
  return {
    id: this.customerId,
    phone: this.phone,
    name: this.name || '',
    email: this.email || '',
    category: this.category || null,
    phoneVerifiedAt: this.phoneVerifiedAt,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.models.AppCustomer
  || mongoose.model('AppCustomer', customerSchema);
