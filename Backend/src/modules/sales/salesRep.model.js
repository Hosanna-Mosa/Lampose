/* ══════════════════════════════════════════════════════════════════════════
   The `app_sales_reps` collection — the sales team's own accounts.

   ## A SEVENTH identity system, and why it is not one of the other six

     admins            v1, /api/v1/admin/login           the onboarding console
     scriper_users     v2, /api/v2/auth/login             staff, the leads panel
     app_customers     v2, /api/v2/customers/auth/…       students, the User App
     app_partners      v2, /api/v2/partners/auth/…        owners, Stay Partner
     food_restaurants  v2, /api/v2/food-partners/auth/…   restaurants, Food-Partner
     app_drivers       v2, /api/v2/drivers/auth/…         riders, the Driver app
     app_sales_reps    v2, /api/v2/sales/auth/…           sales, the Tracker app

   `scriper_users` looks like the closest fit — it already carries
   `onboarding-login` for field agents who visit properties — but a sales rep
   answers "am I online right now" and eventually "where has this rep been
   today", neither of which is a question any of the six existing accounts
   ever has to answer, and widening a staff login built for the leads panel
   to also carry a live position is exactly the "one guard understands two
   audiences" mistake every other module in this codebase was built to avoid.
   A new, narrow collection is one more identity system, but it is one whose
   guard only ever has to answer one question.

   The prefix follows the rule `scriper.model.js` sets out and every
   collection after it repeats: unprefixed `sales_reps` is a name a future
   feature collides with.

   ## Duty and position, now that the tracking half is scoped

   Same shape `driver.model.js` uses, and for the same reasons — see that
   file's own header. `onDuty` is the rep's own choice, survives an app
   restart, and gates everything else: `currentLocation` is only ever
   written while it is true, and turning it off does not erase the last
   known position, it just stops updating it. `locationUpdatedAt` is what
   makes a position a FACT WITH AN AGE rather than a trap — the admin panel's
   map reads it to say "last seen 4 minutes ago" rather than presenting a
   three-hour-old fix as current.

   The PATH ("where he started and where he goes") is not on this document
   at all — seeing it would mean scanning one rep's growing array on every
   read of the whole roster. It lives in `salesLocationPing.model.js`
   instead, one row per fix, exactly the choice `food_orders` makes for a
   delivery's own trail rather than embedding it in the order.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

/** `SR-` plus eight hex, matching the `DR-`/`FP-` shape the rest of the app uses. */
const makeSalesRepId = () => `SR-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

/*
 * GeoJSON, [LONGITUDE, LATITUDE] — MongoDB's order, not a choice made here.
 * The same schema and the same warning `driver.model.js`/`foodRestaurant.
 * model.js` carry: getting this backwards does not throw, it silently
 * matches nothing (or, for a map, silently draws the wrong country). The
 * only defences are that the controller names its inputs `lat`/`lng`
 * explicitly and that this comment exists.
 */
const pointSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: (pair) => Array.isArray(pair) && pair.length === 2
          && Number.isFinite(pair[0]) && Number.isFinite(pair[1])
          && Math.abs(pair[0]) <= 180 && Math.abs(pair[1]) <= 90,
        message: 'currentLocation.coordinates must be [longitude, latitude] and in range.',
      },
    },
  },
  { _id: false },
);

const salesRepSchema = new mongoose.Schema(
  {
    /* The stable public id. Everything that will ever point at a rep — a
       token's `sub`, a future location-history row — uses this string, never
       the Mongo `_id`, matching every other identity in this process. */
    salesRepId: { type: String, required: true, unique: true, index: true },

    name: { type: String, required: true, trim: true },

    /* The account. Unique and lower-cased so one address cannot register
       twice under two different capitalisations. */
    email: {
      type: String, required: true, unique: true, index: true, lowercase: true, trim: true,
    },

    /* bcrypt, `select: false` — the same treatment every password in this
       process gets: absent from every ordinary read, asked for explicitly by
       the one route that checks it, and unable to leak through serialisation
       because `toPublic` below is a whitelist rather than a deletion. */
    passwordHash: { type: String, required: true, select: false },

    /* Not an enum with a `deleted` member, matching `app_partners.status` —
       deactivating a rep (they left the company) should end their sessions
       without erasing whatever gets attached to this id later. */
    status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },

    /* Carried in the token as `ver` and compared on every request — "sign out
       everywhere" bumps this and every token so far stops working on its next
       use, the same revocation `app_partners`/`app_drivers` already have. */
    sessionVersion: { type: Number, default: 0 },

    lastLoginAt: { type: Date, default: null },

    /* The rep's own choice, survives an app restart. Nothing on the server
       writes this to true — only `PATCH /me/duty` with the rep's own token
       can, matching every other duty switch in this process. */
    onDuty: { type: Boolean, default: false, index: true },
    /* When the CURRENT session started. Cleared to null on going offline, so
       "how long have they been out" is a subtraction rather than a second
       flag that could disagree with `onDuty`. */
    dutyStartedAt: { type: Date, default: null },

    currentLocation: { type: pointSchema, default: undefined },
    /* Written on every position update, and on nothing else — see the
       header on why a position without this is treated as absent. */
    locationUpdatedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'app_sales_reps', strict: true },
);

/* The roster query the admin panel's list runs — everyone currently on
   duty, most recently seen first. */
salesRepSchema.index({ onDuty: 1, locationUpdatedAt: -1 });
salesRepSchema.index({ currentLocation: '2dsphere' });

/**
 * What may leave the process. A whitelist, not a deletion from a copy — the
 * same reasoning `partner.model.js`/`driver.model.js` give: `passwordHash` is
 * `select: false` already, and this is the belt to that brace.
 */
salesRepSchema.methods.toPublic = function toPublic() {
  return {
    id: this.salesRepId,
    name: this.name,
    email: this.email,
    status: this.status,
    onDuty: this.onDuty,
    dutyStartedAt: this.dutyStartedAt,
    createdAt: this.createdAt,
  };
};

/**
 * What the ADMIN roster sees — everything `toPublic` shows a rep about
 * themselves, plus the position `toPublic` deliberately leaves out because a
 * rep's own app already knows where the rep is; the admin panel does not.
 *
 * `[lng, lat]` unswapped, the same rule every map in this codebase follows —
 * the caller flips it where it draws, this method does not guess.
 */
salesRepSchema.methods.toAdminSummary = function toAdminSummary() {
  return {
    ...this.toPublic(),
    currentLocation: this.currentLocation
      ? { coordinates: this.currentLocation.coordinates }
      : null,
    locationUpdatedAt: this.locationUpdatedAt,
  };
};

/** bcrypt, cost 10 — the cost every other password in this process uses. */
salesRepSchema.statics.hashPassword = (plain) => bcrypt.hash(String(plain), 10);

/**
 * Fails CLOSED. A route that forgot `.select('+passwordHash')` hands this
 * method a document where the field is simply missing, and that must answer
 * false rather than compare against undefined and let anything through.
 */
salesRepSchema.methods.verifyPassword = function verifyPassword(plain) {
  if (!this.passwordHash || !plain) return Promise.resolve(false);
  return bcrypt.compare(String(plain), this.passwordHash);
};

const SalesRep = mongoose.models.SalesRep
  || mongoose.model('SalesRep', salesRepSchema, 'app_sales_reps');

module.exports = SalesRep;
module.exports.makeSalesRepId = makeSalesRepId;
