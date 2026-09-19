/* ══════════════════════════════════════════════════════════════════════════
   The `food_restaurants` collection — restaurants and meat shops onboarded
   through the Food-Partner app.

   One document is one kitchen: who owns it, where it is, when it cooks, what
   it charges to deliver, where it is paid, and which papers it produced. Its
   menu lives next door in `food_products`, joined by the `restaurantId`
   STRING rather than an ObjectId ref — see that file for why.

   ## A FIFTH identity system, and why it is none of the other four

     admins            v1, /api/v1/admin/login           the onboarding console
     scriper_users     v2, /api/v2/auth/login            staff, the leads panel
     app_customers     v2, /api/v2/customers/auth/…      students, the User App
     app_partners      v2, /api/v2/partners/auth/…       owners, Stay Partner
     food_restaurants  v2, /api/v2/food-partners/auth/…  restaurants, Food-Partner

   A restaurant is not a property owner. `app_partners` exists to answer "which
   listings carry this phone number" and holds no password at all; the account
   here sells food, is settled into a bank account weekly, and signs a
   commission contract. Sharing `app_partners` would mean one collection where
   a bed's availability switch and an FSSAI licence sit on the same document,
   and one token that opens both a landlord's payouts and a kitchen's. The
   first bug in that arrangement is somebody reading somebody else's money.

   They share one signing secret because they share one process, which means a
   token from any of the five will `jwt.verify` against the others. What keeps
   them apart is the payload: every food-partner token carries
   `typ: 'foodpartner'` and the middleware refuses anything without it, exactly
   as `customers/customerAuth.middleware.js` asserts `typ: 'customer'`. A
   separate secret per audience was considered there and rejected for the same
   reason it is rejected here — it is a second secret to configure, rotate and
   get wrong in a deployment, and the claim gets the same result with none of
   that.

   ## The collection name, and the collision it avoids

   Pinned as the third argument to `mongoose.model()`, not left to the
   pluraliser, and prefixed for the reason `scriper.model.js` sets out: several
   apps share one database and an unprefixed name is one careless rename from
   colliding. The specific collisions avoided here are real, not hypothetical:

     · `partners` is ALREADY `app_partners` — property owners on the Stay
       Partner app. A restaurant called a "partner" in conversation is not a
       partner in this database.
     · `restaurants` is unprefixed and would be the one name a future
       food-ordering module, a franchise importer or a scraped-leads table
       would each reach for first.

   The name lives inside this file, so renaming the folder never touches the
   database.

   ## Unlike the customer and stay-partner apps, this account HAS a password

   Both of those deliberately have none: a number is the account, an OTP is the
   proof, and there is nothing to forget. A restaurant is different. The
   website's food-partner onboarding already collects a password for the
   "partner dashboard", the account is shared between an owner and a manager
   rather than tied to one handset, and it is signed into from a laptop in an
   office as often as from the phone in the kitchen.

   So: `passwordHash` — bcrypt, `select: false`, never the plaintext, and the
   plaintext never assigned to a document even for a moment. There is
   deliberately NO pre-save hook that hashes whatever it finds, unlike
   `admins/admin.model.js`: that pattern works only while exactly one field
   holds both meanings, and the moment a controller hashes first (which this
   module's does) an auto-hook silently bcrypts the bcrypt. `hashPassword` and
   `verifyPassword` below are the supported way in and out.

   Login is by `ownerEmail` OR `ownerPhone`, so both are unique.

   ## What the app may never set

   `verificationStatus`, `verifiedAt`, `verificationNote`, `isActive`,
   `ratingAvg` and `ratingCount` are server-decided. A partner who could PATCH
   their own `verificationStatus` to `approved` would list an unverified
   kitchen; one who could write `ratingAvg` would be five stars by lunchtime.
   The rule is ENFORCED in the controller, which whitelists the operations
   fields a PATCH may touch — it is restated here because this file is where
   the next reader will look for it, and a schema cannot tell who is writing.
   Same reasoning as `support/ticket.model.js`: a client that sets its own
   status can mark its own dispute resolved.

   ## Approved is not the same as listed

   `verificationStatus: 'approved'` means a human checked the papers.
   `isActive` means it should appear in the app right now. They are separate
   because they are separated in practice: an approved kitchen is switched off
   for a fortnight while the owner is away, then back on, and none of that is a
   re-verification. The listing query requires both.

   ## Where phone proof lives, which is not here

   There is no `otp` sub-document, on purpose. The Food-Partner OTP is sent
   BEFORE this document exists — `/auth/otp/start` and `/auth/otp/verify` prove
   a number so an application may be submitted at all, and they hand back a
   short-lived verification token that the application route checks. There is
   nowhere on a restaurant to put a code for a restaurant that has not been
   created yet, and inventing a half-document to hold one would put unverified
   junk in the collection every time somebody abandoned the form.
   ══════════════════════════════════════════════════════════════════════════ */
const crypto = require('crypto');

const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

/* The cuisines the website's onboarding form offers — kept in step with
   `Frontend/src/data/partner.js` CUISINE_OPTIONS, which is what a partner is
   actually shown. NOT an enum on the field: a kitchen that types "Andhra
   Meals" should be stored and then discussed, not refused mid-application with
   a validation error about a list it never saw. The array is exported so the
   listing screen's filter chips and the app's picker read the same fifteen,
   and anything outside it is a real value that simply has no chip. */
const CUISINE_TYPES = [
  'North Indian', 'South Indian', 'Chinese', 'Italian', 'Bakery',
  'Fast Food', 'Street Food', 'Continental', 'Mexican', 'Japanese',
  'Thai', 'Healthy', 'Desserts', 'Beverages', 'Mughlai',
];

const DELIVERY_FEE_TYPES = ['flat', 'distance_based', 'free_above'];
const VERIFICATION_STATUSES = ['pending', 'approved', 'rejected'];

/*
 * The manual override on the schedule.
 *
 *   auto     the opening hours decide, minute by minute
 *   open     open regardless of the schedule
 *   closed   closed regardless of the schedule
 *
 * Three states rather than a boolean, because a boolean cannot express "follow
 * the schedule". A kitchen that taps "temporarily closed" at 8pm on a Tuesday
 * must beat its own hours until somebody taps it back — and tapping it back
 * must restore the schedule, not pin it open until Friday.
 */
const OPEN_STATES = ['auto', 'open', 'closed'];

const PARTNER_TYPES = ['food', 'meat'];

const DOCUMENT_KINDS = ['fssai', 'gst', 'pan', 'cheque', 'menu_sheet'];

/* Full names, Monday first, matching `Frontend/src/data/partner.js` DAYS and
   the `weekday: 'long'` output of the formatter below. Full names rather than
   0–6 because an opening-hours row is read by a person in three consoles, and
   nobody has ever been sure whether 0 is Sunday or Monday. */
const WEEKDAYS = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
];

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * The last ten digits of a number.
 *
 * The same helper, and the same reasoning, as `partners/partner.model.js`:
 * hand-typed numbers in this database are spelled several ways — `+91 98765
 * 43210`, `+919704726252`, `09704726252` — and ten digits is the part every
 * spelling agrees on, unique per handset in the only country this product
 * operates in. It is what a login by phone number is matched against, so it
 * has to survive however the number was typed on the day it was registered.
 *
 * Copied rather than imported. `require`-ing the Stay Partner model for three
 * lines of string handling would register the `AppPartner` mongoose model as a
 * side effect of loading a restaurant, and would tie this module's login
 * lookup to a helper that exists to work around a data-quality problem in
 * `properties`. The two are free to diverge; today they agree.
 */
const phoneKey = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : '';
};

/*
 * Crockford-ish: the full alphabet minus I, O, 0 and 1.
 *
 * The same set `support/ticket.model.js` uses, for the same reason — this id is
 * read down a phone line to a partner who then types it back, and the four
 * characters left out are the four that get typed as each other. 256 is a whole
 * multiple of 32, so `byte % 32` is uniform.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * The public id: `FP-` and eight characters.
 *
 * Not the Mongo `_id`, for the reason every other identity in this process has
 * a string id of its own: the app stores this on the device, and an ObjectId in
 * AsyncStorage invites somebody to go looking for it in `properties` or
 * `app_partners`. Random rather than a counter, because a counter needs a
 * second collection or a findAndModify per create, and it publishes how many
 * restaurants Lampose has signed to anybody who signs up twice.
 *
 * 32^8 is about 1.1 x 10^12; the `unique` index is what actually decides, and
 * the caller retries on a duplicate-key error.
 */
const makeRestaurantId = () => {
  const bytes = crypto.randomBytes(8);
  let body = '';
  for (let i = 0; i < 8; i += 1) body += ALPHABET[bytes[i] % ALPHABET.length];
  return `FP-${body}`;
};

/* ── Sub-schemas ─────────────────────────────────────────────────────────── */

/* Cloudinary's two halves. `publicId` is kept beside the URL because deleting
   an image needs it, and a URL a controller has to parse a public id back out
   of is a URL that breaks the day the folder layout changes. */
const imageSchema = new mongoose.Schema(
  {
    url: { type: String, default: '', trim: true },
    publicId: { type: String, default: '', trim: true },
  },
  { _id: false },
);

/*
 * GeoJSON. The coordinate order is [LONGITUDE, LATITUDE].
 *
 * That order is MongoDB's, not a choice made here, and getting it backwards is
 * the classic bug in this file: it does not throw, it returns nothing. A
 * `$near` around a point 500km out to sea matches no restaurant and the listing
 * screen renders an empty state, which looks exactly like "no restaurants near
 * you" rather than like a fault.
 *
 * Note what the range check below CANNOT catch. Hyderabad is lng 78.4, lat
 * 17.4; swapped, that is lng 17.4, lat 78.4 — both inside the legal ranges,
 * both accepted, and the shop is now in the Arctic Ocean. Anywhere in India
 * both numbers sit inside each other's valid range, so validation buys nothing
 * against the swap and the only defences are that the controller names its
 * inputs `lat`/`lng` explicitly and that this comment exists.
 *
 * The whole path defaults to `undefined` rather than to an empty object,
 * deliberately: a document carrying `{ type: 'Point' }` and no coordinates is
 * rejected by the 2dsphere index at insert time ("Point must be an array"),
 * which would refuse every restaurant that had not yet dropped a pin.
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
        message: 'location.coordinates must be [longitude, latitude] and in range.',
      },
    },
  },
  { _id: false },
);

/*
 * One serving window.
 *
 * A day may appear MORE THAN ONCE, and that is the normal case rather than an
 * edge one: a kitchen serving 11:00–15:00 and 19:00–23:00 closes between meals,
 * and squashing that into one open and one close per day would show it as
 * serving at four in the afternoon. So this is a flat array of slots rather
 * than a map keyed by day.
 *
 * `closeTime` less than `openTime` means the slot crosses midnight — a kitchen
 * serving until 01:00 is ordinary. See `isOpenNow`, which is the only place
 * that rule is implemented.
 */
const openingHourSchema = new mongoose.Schema(
  {
    day: { type: String, enum: WEEKDAYS, required: true },
    /* "HH:MM", 24-hour. A string rather than minutes-since-midnight because it
       is round-tripped through three form controls and read in two consoles,
       and 1140 is not a time anybody recognises at a glance. */
    openTime: { type: String, required: true, match: HHMM },
    closeTime: { type: String, required: true, match: HHMM },
  },
  { _id: false },
);

/*
 * A paper, as a document rather than as a number on the restaurant.
 *
 * `fssaiLicenseNumber` and friends stay on the parent because they are queried
 * and printed; this array is what was actually uploaded, with its own expiry
 * and its own file. It follows the field spec's own v2 recommendation, and the
 * reason is that a number alone cannot be checked by a human, cannot expire
 * independently of the licence it belongs to, and cannot record that a partner
 * re-uploaded a clearer scan of the same licence in March.
 */
/*
 * A bank account a restaurant can be paid into.
 *
 * ## Why this is a LIST when `payout` below is a single object
 *
 * `payout` is where the money actually goes, and it stays exactly what it
 * was: one object, read by the staff approval queue
 * (`foodAdmin.controller.js` selects `+payout.bankAccountNumber`) and by the
 * application completeness tally in `foodPartner.util.js`. Nothing that reads
 * it had to change.
 *
 * This array is the owner's ADDRESS BOOK. Exactly one entry carries
 * `isActive`, and activating an entry copies it into `payout`. So there is
 * still one answer to "where does this restaurant's money go", and it is
 * still in the field every existing reader already looks at — the list is a
 * convenience on top, not a second source of truth. A reader that consulted
 * the array and picked the active one itself would be that second source, and
 * the first time the two disagreed the money would go somewhere nobody chose.
 *
 * ## The number is never stored twice over
 *
 * `bankAccountNumber` is `select: false` here exactly as it is on `payout`,
 * and `toJSON` deletes it from every entry for the one path that selects it
 * on purpose. `accountLast4` is written when the account is added, so every
 * screen has something to show without asking for the number back.
 */
const payoutAccountSchema = new mongoose.Schema(
  {
    accountId: { type: String, required: true },
    /* What the owner calls it — "HDFC current", "the old one". Optional; the
       bank name is not asked for because the IFSC already names the branch
       and a second field for the same fact is a second field to get wrong. */
    label: { type: String, default: '', trim: true },
    accountHolderName: { type: String, default: '', trim: true },
    bankAccountNumber: { type: String, default: '', trim: true, select: false },
    accountLast4: { type: String, default: '', trim: true },
    ifscCode: { type: String, default: '', trim: true, uppercase: true },
    accountType: { type: String, enum: ['savings', 'current'], default: 'current' },
    upiId: { type: String, default: '', trim: true },
    /* Exactly one entry is true. The controller enforces it on every write
       rather than an index doing it, because "exactly one" across an array is
       not something Mongo can assert. */
    isActive: { type: Boolean, default: false },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const verificationDocumentSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: DOCUMENT_KINDS, required: true },
    number: { type: String, default: '', trim: true },
    expiry: { type: Date, default: null },
    url: { type: String, default: '', trim: true },
    publicId: { type: String, default: '', trim: true },
    fileName: { type: String, default: '', trim: true },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

/* ── The restaurant ──────────────────────────────────────────────────────── */

const foodRestaurantSchema = new mongoose.Schema(
  {
    restaurantId: { type: String, required: true, unique: true, index: true },

    /* ── A. Basic ───────────────────────────────────────────────────────── */

    restaurantName: { type: String, required: true, trim: true },
    ownerName: { type: String, required: true, trim: true },

    /* E.164, normalised before it ever reaches here. Unique, because it IS half
       the login: a second document for the same number would leave the login
       route choosing between two accounts, and it would choose wrong half the
       time. This is the OWNER's number — the one that proved an OTP and the one
       Lampose rings about a payout. It is not the number printed in the app;
       see `contactNumber`. */
    ownerPhone: { type: String, required: true, unique: true, index: true, trim: true },

    /* Derived from `ownerPhone` in the pre-validate hook below, never set by
       hand at a call site. Stored rather than computed on read because it is
       what a login by phone number is matched against, and a regex across the
       collection on every sign-in is fine at eight restaurants and is the whole
       latency budget at eight thousand. */
    phoneKey: { type: String, default: '', index: true },

    ownerEmail: {
      type: String, required: true, unique: true, index: true, lowercase: true, trim: true,
    },

    /* bcrypt. `select: false` so it is absent from every ordinary read — the
       login route is the one place that asks for it, with an explicit
       `.select('+passwordHash')`, and `toJSON` deletes it even then in case
       somebody adds a second such place. */
    /* NOT required, and the absence is meaningful.
     *
     * An application filled in by a Lampose onboarding employee, sitting with
     * the owner, has nobody in the room who should be choosing the owner's
     * password — so those documents are written without one and the owner sets
     * it before their first sign-in.
     *
     * A missing hash is a CLOSED door, not an open one: `verifyPassword` below
     * returns false when there is nothing to compare against, so such an
     * account cannot be signed into until a credential is set on it. Storing a
     * hash of `''` instead would be an account whose password is the empty
     * string, which is the failure this is written to avoid. */
    passwordHash: { type: String, required: false, select: false },

    logoImage: { type: imageSchema, default: () => ({}) },
    coverBannerImage: { type: imageSchema, default: () => ({}) },

    /* The one-line tagline under the name on the listing card. Short by
       convention rather than by validator — the card truncates. */
    description: { type: String, default: '', trim: true },

    /* Indexed: this is what the listing screen's filter chips query on, on
       every open of the Restaurant Listing screen. */
    cuisineTypes: { type: [String], default: [], index: true },

    /* Required because a kitchen may not legally sell food without one. The
       number is stored here for search and printing; the scan of it is a
       `verificationDocuments` entry of kind `fssai`. */
    fssaiLicenseNumber: { type: String, required: true, trim: true },
    /* The name the LICENCE is held in, which is not always `restaurantName`.
       A licence is issued to the registered entity — "Bhargavi Foods Pvt Ltd"
       against a board reading "Bhargavi Home Foods" — and the FoSCoS lookup
       matches on this one. Collected by the Onboard console, so like
       `panNumber` it is checked for shape and never for presence: the
       Food-Partner app's own signup has no such field. */
    fssaiCompanyName: { type: String, default: '', trim: true },
    fssaiExpiry: { type: Date, default: null },

    /* Optional, and `gstExempt` is why: the composition scheme and small
       turnovers are ordinary, and a required GST number would have forced every
       one of them to type something false. The flag records that the absence
       was declared rather than skipped. */
    gstNumber: { type: String, default: '', trim: true },
    gstExempt: { type: Boolean, default: false },
    panNumber: { type: String, default: '', trim: true, uppercase: true },

    /*
     * The owner's Aadhaar, and the mobile it is registered against.
     *
     * Collected by the Onboard console, which is the only surface that asks
     * for it. `validateApplication` therefore checks its SHAPE and never its
     * presence, exactly the way it treats `panNumber` — the Food-Partner
     * app's own signup predates this field, and a presence rule there would
     * refuse every client that has not shipped it yet.
     *
     * `verifiedAt` is DERIVED SERVER-SIDE from the proof token that
     * `/auth/otp/verify` issues for `phone`, and is never read from the
     * request body. The same reasoning as `hasCompletedOnboarding` on a
     * rider: a client that could set this could file an application against
     * a stranger's Aadhaar by sending one boolean.
     *
     * `number` is `select: false`, like `payout.bankAccountNumber` and
     * `passwordHash`. An Aadhaar number is the most restricted identifier
     * this platform stores, and nothing on an ordinary read — a listing, the
     * partner's dashboard, the admin queue — has a reason to receive it.
     * `last4` is stored plainly beside it so a queue can SHOW which document
     * was given without the full number leaving the database.
     */
    aadhaar: {
      number: { type: String, default: '', trim: true, select: false },
      last4: { type: String, default: '', trim: true },
      phone: { type: String, default: '', trim: true },
      verifiedAt: { type: Date, default: null },
    },

    /* ── B. Location & contact ──────────────────────────────────────────── */

    address: {
      line1: { type: String, default: '', trim: true },
      line2: { type: String, default: '', trim: true },
      city: { type: String, default: '', trim: true },
      state: { type: String, default: '', trim: true },
      /* The FoSCoS district, which is NOT always a revenue district: the
         portal's own list carries municipal corporations ("Greater Hyderabad
         Municipal Corporation") beside ordinary districts, and a licence is
         looked up against whichever of those it was issued under. Stored as
         the words the agent picked rather than a code, because the only thing
         that ever reads it is a human typing it back into that portal. */
      district: { type: String, default: '', trim: true },
      pincode: { type: String, default: '', trim: true },
      /* What a delivery rider is actually told. "Opposite the Reliance Fresh"
         finds a door that a pincode never will. */
      landmark: { type: String, default: '', trim: true },
    },

    location: { type: pointSchema, default: undefined },

    /*
     * The customer-facing number, which is NOT `ownerPhone`.
     *
     * Two fields because they are two numbers in practice: the owner signs in
     * on their personal handset and the shop answers a landline or a counter
     * phone. Merging them would print an owner's private number in the app the
     * first time somebody decided they were the same thing.
     */
    contactNumber: { type: String, default: '', trim: true },

    /* ── C. Operations ──────────────────────────────────────────────────── */

    openingHours: { type: [openingHourSchema], default: [] },

    openState: { type: String, enum: OPEN_STATES, default: 'auto' },

    /* Minutes. Feeds the ETA on the listing card; a per-item override lives on
       `food_products.preparationTime`. */
    avgPreparationTime: { type: Number, default: 0, min: 0 },

    deliveryRadiusKm: { type: Number, default: 0, min: 0 },
    minOrderValue: { type: Number, default: 0, min: 0 },
    packagingCharge: { type: Number, default: 0, min: 0 },

    /*
     * How delivery is charged. One shape covering three schemes, because a
     * partner switches between them and separate fields per scheme would leave
     * whichever they abandoned lying around to be read by mistake:
     *
     *   flat            `amount` per order
     *   distance_based  `perKm` × the distance
     *   free_above      free over `freeAboveValue`, `amount` under it
     *
     * The unused members are left at 0 rather than cleared, so switching back
     * does not lose what was typed. Which one is authoritative is decided by
     * `type` and nothing else — a checkout must never add two of them.
     *
     * `type` as a field name inside a schema definition is the one Mongoose
     * gotcha worth naming: it is read as a nested path here, exactly as the
     * GeoJSON `type` above is, because its value is itself a type declaration.
     */
    deliveryFee: {
      type: { type: String, enum: DELIVERY_FEE_TYPES, default: 'flat' },
      amount: { type: Number, default: 0, min: 0 },
      perKm: { type: Number, default: 0, min: 0 },
      freeAboveValue: { type: Number, default: 0, min: 0 },
    },

    acceptsOnlinePayment: { type: Boolean, default: true },
    acceptsCod: { type: Boolean, default: true },

    /* ── D. Payout ──────────────────────────────────────────────────────── */

    /*
     * Where settlement money goes.
     *
     * The field spec says the account number is encrypted, and it is NOT
     * encrypted here. Hand-rolling that would be worse than not doing it: a key
     * in the same `.env` as the connection string, decrypted in process on
     * every read, is a longer path to the same plaintext plus a false sense
     * that something was done. What this needs before it holds real settlement
     * data is MongoDB Atlas client-side field-level encryption (CSFLE) on
     * `payout.bankAccountNumber`, keyed outside the database — a deployment
     * change, not a schema one.
     *
     * Until then the defence is narrowness, stated plainly so that nobody
     * mistakes it for encryption:
     *
     *   · `select: false` keeps the number out of every ordinary read. Nothing
     *     in this module ever selects it back; only a settlement job would.
     *   · `accountLast4` is what the app and the console display, so no screen
     *     in the product has a reason to ask for the full number.
     *   · `toJSON` deletes it even if a caller selected it.
     *   · This module's own logger prints it as "ending NNNN" and never in
     *     full, because a backend console is frequently screen-shared.
     *
     * One gap, named rather than papered over: `shared/middleware/
     * requestLogger.js` redacts by FIELD NAME, and its pattern
     * (`pass|token|secret|otp|hash|salt|…`) does not match `bankAccountNumber`.
     * The arrival log of a raw application body is therefore the one place the
     * full number can still appear in a console. Adding `bankaccountnumber` to
     * that regex is a one-word change in a file this module does not own; it
     * should be made.
     */
    payout: {
      accountHolderName: { type: String, default: '', trim: true },
      bankAccountNumber: { type: String, default: '', trim: true, select: false },
      /* Written by the controller from the number at the moment it arrives, so
         every screen has something to show without selecting the number back. */
      accountLast4: { type: String, default: '', trim: true },
      ifscCode: { type: String, default: '', trim: true, uppercase: true },
      accountType: { type: String, enum: ['savings', 'current'], default: 'current' },
      upiId: { type: String, default: '', trim: true },
    },

    /* The owner's saved accounts. `payout` above remains the active one — see
       `payoutAccountSchema`. Empty on every restaurant onboarded before this
       existed; `restaurantAdmin.controller.js` backfills the first entry from
       `payout` the first time an owner opens the screen, so nothing is lost
       and no migration had to run. */
    payoutAccounts: { type: [payoutAccountSchema], default: [] },

    /* ── E. Verification & system ───────────────────────────────────────── */

    verificationDocuments: { type: [verificationDocumentSchema], default: [] },

    /* Server-decided. See the header: the app may never set this, and the
       whitelist that stops it is in the controller. */
    /*
     * Handsets signed in to this restaurant, for the order alert.
     *
     * An array because a kitchen is not one phone: the counter has a tablet,
     * the owner has a mobile, and a new order has to ring on whichever is
     * being watched. Bounded and upserted by token — the app registers on
     * every launch, so appending would grow this without limit and send one
     * order six copies of the same alert.
     */
    devices: {
      type: [{
        token: { type: String, required: true, trim: true },
        platform: { type: String, default: 'unknown' },
        registeredAt: { type: Date, default: Date.now },
      }],
      default: [],
      select: false,
    },

    verificationStatus: {
      type: String, enum: VERIFICATION_STATUSES, default: 'pending', index: true,
    },

    /* Why it was rejected, in words a partner can act on. Shown to them —
       "rejected" with no reason is a support call, every time. */
    verificationNote: { type: String, default: '', trim: true },
    verifiedAt: { type: Date, default: null },

    /*
     * Default FALSE, and not the same thing as approved — see the header. False
     * on creation means an application that arrives at 2am is not live at 2am;
     * a human turns it on.
     */
    isActive: { type: Boolean, default: false },

    /* Derived from orders that do not exist yet — there is no ordering module
       in this process — so both stay 0 until one writes them. Zero means "no
       ratings", and the app renders "New" rather than a one-star kitchen.
       Never settable from a request body. */
    ratingAvg: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0, min: 0 },

    /*
     * The commercial terms as accepted, captured at acceptance.
     *
     * `commission` and `platformFee` are stored on the document rather than
     * read from a config at settlement time, because they are negotiable per
     * partner (the public page says 15%, "negotiable for high-volume
     * partners"). A rate held anywhere else would silently re-price every
     * historical partner the day it changed.
     *
     * `signature` is the typed name from the contract step. It is a record of
     * what was accepted and by whom, not a cryptographic signature, and nothing
     * should treat it as one.
     */
    /*
     * `refundPolicyAccepted` is its own flag rather than part of `accepted`.
     *
     * The merchant agreement is accepted once, by signature, at the end of the
     * onboarding form. The refund and cancellation rule is ticked separately,
     * on the screen that prints it in full beside the bank details it will be
     * deducted from — and the dispute this record exists for ("nobody told us
     * we would be charged for a late cancellation") turns on exactly which of
     * those two the owner was read. One boolean covering both could not
     * answer it.
     *
     * Not required by `validateApplication`, the same way `panNumber` is not:
     * a rule there refuses every client that predates the field. The Onboard
     * console insists on it, which is where it is asked for.
     */
    contract: {
      accepted: { type: Boolean, default: false },
      signature: { type: String, default: '', trim: true },
      acceptedAt: { type: Date, default: null },
      commission: { type: Number, default: 0, min: 0 },
      platformFee: { type: Number, default: 0, min: 0 },
      refundPolicyAccepted: { type: Boolean, default: false },
      refundPolicyAcceptedAt: { type: Date, default: null },
    },

    /*
     * Food or meat. One collection for both, because they differ in the
     * catalogue they choose categories from and in nothing else — same licence,
     * same payout, same hours, same delivery maths. Two collections would
     * duplicate every one of those, and the first field added to one and not
     * the other would split the listing screen in half.
     */
    partnerType: { type: String, enum: PARTNER_TYPES, default: 'food', index: true },
  },
  {
    timestamps: true,
    collection: 'food_restaurants',
    /* On. The PATCH routes hand a whitelisted object to the document, but a
       whitelist is a controller's promise and this is the schema's. */
    strict: true,
  },
);

/* ── Indexes ─────────────────────────────────────────────────────────────── */

/* The listing screen's floor: nothing unapproved or switched off is ever
   returned, on any query, so this pair leads every one of them. */
foodRestaurantSchema.index({ isActive: 1, verificationStatus: 1, createdAt: -1 });

/* `?lat&lng&radiusKm` on the Restaurant Listing screen. Documents with no
   `location` are simply not in this index, which is the wanted behaviour: a
   kitchen that never dropped a pin cannot be near anybody. */
foodRestaurantSchema.index({ location: '2dsphere' });

/* The menu-and-detail path reads a restaurant by its public id; `restaurantId`
   is already uniquely indexed above, so nothing further is declared for it.

   There is deliberately no `text` index on the name. The listing screen
   combines `?search` with `?lat&lng` — search near me — and MongoDB refuses
   `$text` in the same query as `$near`. A text index would therefore serve
   exactly the case (search with no location) that a case-insensitive regex on
   `restaurantName` also serves, while quietly failing the case the screen
   actually sends. The regex is the honest choice at this size; a search that
   outgrows it wants Atlas Search, not `$text`. */

/* ── Hooks ───────────────────────────────────────────────────────────────── */

/** `phoneKey` is derived, so it is never set by hand at a call site. */
foodRestaurantSchema.pre('validate', function derivePhoneKey(next) {
  if (this.ownerPhone) this.phoneKey = phoneKey(this.ownerPhone);
  return next();
});

/* ── Opening hours ───────────────────────────────────────────────────────── */

/*
 * IST, always, whatever the process's own clock says.
 *
 * Opening hours are typed by a partner standing in their kitchen and mean local
 * time. The production host runs UTC; a laptop runs whatever it runs. Using the
 * server's clock would show every kitchen in the country closed for five and a
 * half hours a day in production and correct in development, which is the
 * hardest kind of bug to be told about.
 *
 * `hourCycle: 'h23'` rather than `hour12: false`: some ICU builds render
 * midnight as "24" under the latter, and "24:00" is 1440 minutes, which is
 * after every closing time there is.
 */
const IST_CLOCK = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata',
  weekday: 'long',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const istNow = (at) => {
  const parts = IST_CLOCK.formatToParts(at);
  const value = (type) => (parts.find((part) => part.type === type) || {}).value || '';
  return {
    weekday: value('weekday'),
    minutes: (Number(value('hour')) * 60) + Number(value('minute')),
  };
};

/** "HH:MM" to minutes since midnight, or null if it is not a time. */
const toMinutes = (hhmm) => {
  if (typeof hhmm !== 'string' || !HHMM.test(hhmm)) return null;
  const [hours, mins] = hhmm.split(':');
  return (Number(hours) * 60) + Number(mins);
};

/**
 * Is this kitchen serving right now?
 *
 * Exported as a plain function over a plain object as well as being the
 * `isCurrentlyOpen` virtual, because `GET /restaurants?openNow=true` filters
 * `.lean()` results — lean documents have no virtuals, and the alternative is
 * the listing controller re-implementing the midnight rule below and getting it
 * subtly different.
 *
 * The rules, in order:
 *
 *   1. `openState: 'open'` or `'closed'` wins outright. The override is the
 *      whole point of the field; a schedule that could beat it would mean a
 *      partner tapping "temporarily closed" and still taking orders.
 *   2. `'auto'` with no hours is CLOSED. Nothing may claim to be open on the
 *      strength of a schedule nobody has filled in.
 *   3. `'auto'` compares now against today's slots — and against YESTERDAY's
 *      slots that cross midnight. A slot whose `closeTime` is less than its
 *      `openTime` runs into the next day: Monday 18:00–01:00 means Tuesday
 *      00:30 is open, and checking only today's rows is exactly how the last
 *      hour of trade goes missing every night.
 *
 * `openTime === closeTime` is treated as a zero-length slot, that is, closed. It
 * is genuinely ambiguous — some systems read "00:00–00:00" as all day — and a
 * kitchen that never shuts should say 00:00–23:59 or set `openState: 'open'`
 * rather than depend on this file guessing.
 */
const isOpenNow = (restaurant, at = new Date()) => {
  if (!restaurant) return false;

  const state = restaurant.openState || 'auto';
  if (state === 'open') return true;
  if (state === 'closed') return false;

  const slots = Array.isArray(restaurant.openingHours) ? restaurant.openingHours : [];
  if (slots.length === 0) return false;

  const { weekday, minutes } = istNow(at);
  const index = WEEKDAYS.indexOf(weekday);
  /* An unrecognised weekday means the formatter returned something this file
     does not know. Guessing a day would report the wrong hours; closed is the
     safe answer, and the listing simply omits the kitchen. */
  if (index < 0) return false;
  const yesterday = WEEKDAYS[(index + 6) % 7];

  return slots.some((slot) => {
    const opens = toMinutes(slot && slot.openTime);
    const closes = toMinutes(slot && slot.closeTime);
    if (opens === null || closes === null || opens === closes) return false;

    if (closes > opens) {
      return slot.day === weekday && minutes >= opens && minutes < closes;
    }

    /* Crosses midnight: tonight's opening, or the tail of yesterday's slot. */
    if (slot.day === weekday && minutes >= opens) return true;
    return slot.day === yesterday && minutes < closes;
  });
};

/*
 * Derived on read, never stored.
 *
 * A persisted `isCurrentlyOpen` column is stale the moment nobody writes to it:
 * it would need a cron ticking every kitchen's boundary minute, and the first
 * time that job died every restaurant in the app would be frozen open or frozen
 * shut with nothing in the logs to say so. The derivation costs one `Intl`
 * format and a walk of at most a dozen slots.
 */
foodRestaurantSchema.virtual('isCurrentlyOpen').get(function currentlyOpen() {
  return isOpenNow(this);
});

/* ── Passwords ───────────────────────────────────────────────────────────── */

/** bcrypt, cost 10 — the cost the rest of this process already uses. */
foodRestaurantSchema.statics.hashPassword = (plain) => bcrypt.hash(String(plain), 10);

/**
 * Check a submitted password.
 *
 * Returns false rather than throwing when the hash was not selected, so a
 * forgotten `.select('+passwordHash')` fails closed — a login that answers
 * "wrong password" is a bug somebody reports; one that answers "correct"
 * because there was nothing to compare against is not.
 */
foodRestaurantSchema.methods.verifyPassword = function verifyPassword(plain) {
  if (!this.passwordHash || !plain) return Promise.resolve(false);
  return bcrypt.compare(String(plain), this.passwordHash);
};

/* ── What may leave the process ──────────────────────────────────────────── */

/*
 * `toJSON` is what `res.json()` calls, so this is the wire shape.
 *
 * Both deletions are belt AND braces: `passwordHash` and
 * `payout.bankAccountNumber` are already `select: false`, and this removes them
 * again for the one path that selected them on purpose — the login route loads
 * the hash and must not then return the document it just loaded.
 *
 * `toObject` is deliberately left untransformed: internal code needs the whole
 * document, and a transform there would strip fields from the copy a settlement
 * job was about to use. `.lean()` bypasses both, so a lean read that is about
 * to be serialised must project its fields explicitly.
 */
foodRestaurantSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    delete ret.__v;
    delete ret.passwordHash;
    if (ret.payout) delete ret.payout.bankAccountNumber;
    /* The same deletion for every saved account. The array arrives without
       them (`select: false`), so this is the belt to that braces — and it is
       the line that matters on the one path that selects them on purpose. */
    if (Array.isArray(ret.payoutAccounts)) {
      ret.payoutAccounts.forEach((entry) => { if (entry) delete entry.bankAccountNumber; });
    }
    return ret;
  },
});

const FoodRestaurant = mongoose.models.FoodRestaurant
  || mongoose.model('FoodRestaurant', foodRestaurantSchema, 'food_restaurants');

module.exports = FoodRestaurant;

module.exports.phoneKey = phoneKey;
/**
 * An id for a saved payout account — `FPA-XXXXXXXX`.
 *
 * Unique within one restaurant's array rather than globally, which is all it
 * has to be: it is only ever looked up as `payoutAccounts.accountId` under a
 * restaurant already chosen by the session's token. The same alphabet as
 * `makeRestaurantId` so the two read as one family.
 */
const makePayoutAccountId = () => {
  const bytes = crypto.randomBytes(8);
  let body = '';
  for (let i = 0; i < 8; i += 1) body += ALPHABET[bytes[i] % ALPHABET.length];
  return `FPA-${body}`;
};

module.exports.makeRestaurantId = makeRestaurantId;
module.exports.makePayoutAccountId = makePayoutAccountId;
module.exports.isOpenNow = isOpenNow;
module.exports.CUISINE_TYPES = CUISINE_TYPES;
module.exports.DELIVERY_FEE_TYPES = DELIVERY_FEE_TYPES;
module.exports.VERIFICATION_STATUSES = VERIFICATION_STATUSES;
module.exports.OPEN_STATES = OPEN_STATES;
module.exports.PARTNER_TYPES = PARTNER_TYPES;
module.exports.DOCUMENT_KINDS = DOCUMENT_KINDS;
module.exports.WEEKDAYS = WEEKDAYS;
