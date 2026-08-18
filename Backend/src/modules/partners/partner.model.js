/* ══════════════════════════════════════════════════════════════════════════
   The `app_partners` collection — property owners using the Stay Partner app.

   ## A FOURTH identity system, and why it is not one of the other three

     admins          v1, /api/v1/admin/login        the onboarding console
     scriper_users   v2, /api/v2/auth/login         Lampose staff, leads panel
     app_customers   v2, /api/v2/customers/auth/…   students, the User App
     app_partners    v2, /api/v2/partners/auth/…    owners, the Stay Partner app

   An owner is not a customer. They are on the other side of every transaction
   in the product: a customer requests a bed, an owner grants it; a customer
   pays, an owner is paid. Sharing `app_customers` would mean one collection
   where a `saved` shortlist and a bank account live on the same document, and
   one token that opens both a student's booking history and a landlord's
   payouts. The first bug in that arrangement is somebody reading somebody
   else's money.

   The prefix follows the rule `scriper.model.js` sets out and for the same
   reason: three apps share one database, and an unprefixed `partners` is one
   careless rename from colliding.

   ## The phone IS the link to their properties

   There is no `propertyIds` array here, deliberately. `Property.ownerMobile`
   already records whose property it is, and it was filled in by a field agent
   during onboarding — months before this app existed. Copying those ids onto
   the partner document would create a second answer to "whose is this", and
   the two would drift the first time the panel reassigns a property.

   So ownership is DERIVED: a partner who proves a phone number sees the
   properties carrying that number. `phoneKey` below is what makes that
   matching survive the data as it actually is — see the note on it.

   ## No password, ever

   Same as the customer app, and for the same reasons. The number is also how
   Lampose already contacts owners on WhatsApp, so asking for it is not an
   extra step.

   ## The code is never stored

   `otp.hash` is a salted SHA-256, peppered from a process secret, compared in
   constant time — the same utility the visit-request and customer flows use.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

/**
 * The last ten digits of a number, and the only safe way to match an owner to
 * their properties.
 *
 * `VisitRequest.ownerMobile` is clean E.164 (`+919398334115`). `Property.
 * ownerMobile` is not: the live collection holds `"+91 98765 43210"`,
 * `"+919704726252"` and `undefined` side by side, because it has been typed in
 * by hand by field agents for as long as the product has existed.
 *
 * Matching on the stored string would therefore show an owner some of their
 * properties and not others, with no pattern they could see. Ten digits is the
 * part every one of those spellings agrees on, and it is unique per handset in
 * the only country this product operates in.
 *
 * This is a workaround for a data-quality problem, not a solution to it. The
 * fix is to normalise `ownerMobile` on write in the onboarding flow and
 * backfill the collection; until then this keeps the app honest.
 */
const phoneKey = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : '';
};

const partnerSchema = new mongoose.Schema(
  {
    /* A stable public id. `_id` would work, but every other identity in this
       process has a string id of its own and the app stores this one on the
       device — a Mongo ObjectId in AsyncStorage invites somebody to try
       looking it up in `properties`. */
    partnerId: { type: String, required: true, unique: true, index: true },

    /* E.164, normalised before it ever reaches here. Unique, because it IS the
       account and it is also the key to their properties. */
    phone: { type: String, required: true, unique: true, index: true, trim: true },

    /*
     * The last ten digits, stored rather than computed on every read.
     *
     * It is what `Property.ownerMobile` and `VisitRequest.ownerMobile` are
     * matched against, and those matches happen on every screen in the app. A
     * regex over a collection on each request is the kind of thing that is
     * fine at eight properties and is the whole latency budget at eight
     * thousand.
     */
    phoneDigits: { type: String, required: true, index: true },

    /* Empty until profile setup. A partner who has proved their number but not
       finished the form is a real, ordinary state — the app shows the setup
       screen for exactly that case, and `profileCompletedAt` is how it knows. */
    name: { type: String, default: '', trim: true },
    email: { type: String, default: '', lowercase: true, trim: true },

    /* What they trade as, where it differs from their own name. Shown to
       Lampose staff rather than to customers — a listing carries the property's
       name, not the owner's business. */
    businessName: { type: String, default: '', trim: true },

    /* Set the first time a code comes back correct, and never cleared. It is
       what separates "somebody typed this number into a form" from "somebody
       holding this number proved it" — and, because ownership is derived from
       the number, it is also what makes reading their properties safe. */
    phoneVerifiedAt: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },

    /* When the name was first supplied. The app routes to profile setup while
       this is null, so it is a gate rather than a statistic. */
    profileCompletedAt: { type: Date, default: null },

    /* Their read watermark on the requests screen — the same shape the
       customer app uses for alerts, and for the same reason: the alerts are
       derived from visit requests rather than stored, so there is no per-item
       row to carry a flag. */
    requestsReadAt: { type: Date, default: null },

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


    /* Not an enum with a `deleted` member: an owner's records have retention
       consequences that are handled where bookings live. This flag exists so
       support can stop an abusive number ordering SMS at our expense. */
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
         the code, not the person: a new code clears it. */
      lockedUntil: { type: Date, default: null },
    },
  },
  { timestamps: true, collection: 'app_partners', strict: true },
);

/** `phoneDigits` is derived, so it is never set by hand at a call site. */
partnerSchema.pre('validate', function derivePhoneDigits(next) {
  if (this.phone) this.phoneDigits = phoneKey(this.phone);
  return next();
});

/**
 * What may leave the process.
 *
 * Note what is absent: the whole `otp` sub-document. A client that could read
 * `attempts` could not do much with it, but the hash and salt beside it are
 * what make an offline brute-force of a six-digit code cheap, and the safe way
 * to keep them out of a response is to project a whitelist rather than delete
 * from a copy.
 */
partnerSchema.methods.toPublic = function toPublic() {
  return {
    id: this.partnerId,
    phone: this.phone,
    name: this.name || '',
    email: this.email || '',
    businessName: this.businessName || '',
    phoneVerifiedAt: this.phoneVerifiedAt,
    /* The app routes on this: null means show profile setup, a date means go
       to the dashboard. Sent as a boolean too, because that is the question
       being asked and a client should not have to know that null is falsy. */
    profileCompletedAt: this.profileCompletedAt,
    profileComplete: Boolean(this.profileCompletedAt),
    createdAt: this.createdAt,
  };
};

const Partner = mongoose.models.AppPartner || mongoose.model('AppPartner', partnerSchema);

Partner.phoneKey = phoneKey;

module.exports = Partner;
