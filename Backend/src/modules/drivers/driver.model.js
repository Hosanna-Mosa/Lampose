/* ══════════════════════════════════════════════════════════════════════════
   The `app_drivers` collection — riders who carry food orders.

   ## Why a sixth collection and not a role on one of the five

   There are five identity systems in this process already, and the rule they
   were built under (see `customerAuth.middleware.js`) is that an account type
   with different fields, a different login and a different lifecycle gets its
   own collection rather than a `role` column. A rider has a vehicle, a
   licence, a duty switch and a live position; a diner has none of those and a
   restaurant has none of those either. One collection holding all three would
   be one collection where two thirds of every document is null, and one login
   endpoint that has to work out what it is looking at before it can decide
   what to ask for.

   The prefix follows the same rule as `app_customers` and `food_orders`:
   three apps share one database and `drivers` unprefixed is exactly the kind
   of name a second feature collides with a year later.

   ## Duty is two booleans, not one, and they mean different things

     isOnline     the rider pressed "go online". Their choice, and it survives
                  an app restart.
     isAvailable  the dispatcher may offer them work right now. The SERVER's
                  choice — set false while they are carrying an order and true
                  again when it finishes.

   Collapsing them into one field is the bug where a rider who finishes a
   delivery is silently taken off duty, or where a rider carrying an order is
   offered a second one. Both are states that only show up under load.

   ## The position is a fact with an age

   `currentLocation` alone is a trap: a rider who closed the app three hours
   ago still has coordinates, and a dispatcher that reads them offers an order
   to somebody who is asleep. So every write moves `locationUpdatedAt`, and
   `driverMatch.service.js` filters on it. A stale position is treated as no
   position — the rider is skipped, not offered.

   ## Two levels of verdict, and they are not the same one

     documents[].status   one document, one decision, one reason. `rejected`
                          here means "photograph this again", and the rider is
                          shown the sentence that says which and why.
     status               the ACCOUNT. `approved` is a person deciding this
                          rider may work, made once the documents underneath
                          read cleanly.

   Collapsing them was the first version of this schema and it could only ever
   reject a whole application over one blurred PAN card. Nothing on the driver
   router writes either — `documents[].status` is an approver's, and `status`
   is an approver's; the rider's own routes may only submit and resubmit.

   ## Nothing here stores earnings

   A payout is derived from `food_orders` (the `delivery.earnings` on each
   delivered order), not accumulated into a counter here. A counter and a
   ledger that disagree is the single worst bug this product could have, and
   the only way they cannot disagree is for there to be one of them.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');
const crypto = require('crypto');

const { addressSchema } = require('../../shared/utils/address');

/** Onboarding, then whether an administrator has let them work. */
const DRIVER_STATUSES = ['pending', 'approved', 'rejected', 'suspended'];

/** What a rider may be asked to carry. Only one of them exists today. */
const SERVICES = ['food'];

const VEHICLE_TYPES = ['bike', 'scooter', 'cycle', 'auto'];

/*
 * ## Documents are a LIST of decisions, not a bag of URLs
 *
 * The first version of this schema held three scalars — a licence number and
 * two image URLs — and one `submittedAt` for all of them. That shape cannot
 * express the thing the approval queue exists to do: an administrator rejects
 * ONE document with ONE reason, and the rider has to be told which of the five
 * to photograph again. With three scalars the only decision available is
 * "reject the whole account", which sends somebody back to the beginning
 * because the glare on their PAN card made the number unreadable.
 *
 * So each document carries its own `status` and its own `reason`, and the
 * account-level `status` is a separate, higher decision that an administrator
 * makes once the documents underneath it read cleanly.
 *
 * A LIST rather than a fixed object with five keys, matching
 * `foodRestaurant.model.js`'s `verificationDocuments`: a sixth kind (a police
 * verification, say) is then an enum entry rather than a schema migration, and
 * a rider who onboarded before it existed simply has no row for it.
 */
const DOCUMENT_KINDS = ['licence', 'rc', 'aadhaar', 'pan', 'insurance'];

/*
 * The three without which nobody may be approved.
 *
 * A licence says they may ride, an RC says the vehicle is theirs, and an
 * Aadhaar says who they are — that is the legal floor for putting a stranger
 * on the road with somebody's dinner. PAN is needed for a payout above the TDS
 * threshold and insurance is needed eventually, and both are collected, but
 * neither blocks a first shift: a rider who cannot start earning until their
 * PAN is verified is a rider who leaves.
 */
const REQUIRED_DOCUMENT_KINDS = ['licence', 'rc', 'aadhaar'];

/** What a document is, from a rider's side and then from an approver's. */
const DOCUMENT_STATUSES = ['pending', 'verified', 'rejected'];

/** The human name for each kind, so app, console and log all say the same word. */
const DOCUMENT_LABELS = {
  licence: 'Driving licence',
  rc: 'Vehicle registration (RC)',
  aadhaar: 'Aadhaar card',
  pan: 'PAN card',
  insurance: 'Vehicle insurance',
};

const documentSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: DOCUMENT_KINDS, required: true },
    /* The number printed on it. Upper-cased on write so one licence is one
       string however the rider typed it. */
    number: { type: String, default: '', trim: true, uppercase: true },
    /* Both scans, because an RC and a licence are two-sided and an approver
       reading only the front cannot check the expiry. `backUrl` is optional —
       an Aadhaar sent as one image is an ordinary case. */
    frontUrl: { type: String, default: '' },
    backUrl: { type: String, default: '' },
    expiresAt: { type: Date, default: null },

    status: { type: String, enum: DOCUMENT_STATUSES, default: 'pending' },
    /* Required to reject, and shown to the rider verbatim. "Rejected" with no
       sentence is a rider who resubmits the same photograph. */
    reason: { type: String, default: '', trim: true },

    submittedAt: { type: Date, default: Date.now },
    reviewedAt: { type: Date, default: null },
    /* The administrator's name, for the audit trail. Never shown to the rider
       — a decision comes from Lampose, not from a person they could go and
       find. */
    reviewedBy: { type: String, default: '' },
  },
  { _id: false },
);

/**
 * A position older than this is not a position.
 *
 * Five minutes is chosen against how the driver app behaves rather than
 * against how fast a scooter moves: it broadcasts every fifteen seconds while
 * online, so five minutes means twenty consecutive misses. Anything that
 * quiet is a phone that has lost signal, gone to sleep or been closed, and
 * offering it an order burns a full dispatch timeout on somebody who will
 * never see it.
 */
const LOCATION_MAX_AGE_MS = 5 * 60 * 1000;

/*
 * GeoJSON, [LONGITUDE, LATITUDE] — MongoDB's order, not a choice made here.
 *
 * The same schema and the same warning as `foodRestaurant.model.js`: getting
 * this backwards does not throw, it silently matches nothing. A rider in
 * Hyderabad (lng 78.4, lat 17.4) written the other way round is in the Arctic
 * Ocean, both numbers are inside each other's legal range, and the dispatcher
 * reports "no riders nearby" rather than a fault. The only defences are that
 * the controller names its inputs `lat`/`lng` explicitly and that this comment
 * exists.
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

/** `DR-` plus eight hex, matching the `FP-`/`LO` shape the rest of the app uses. */
const makeDriverId = () => `DR-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

const driverSchema = new mongoose.Schema(
  {
    /* The stable public id. Everything that points at a rider — an order's
       `delivery.driverId`, a socket room, the token's `sub` — uses this
       string, never the Mongo `_id`. Same rule as every other id in the
       module: a join written against the wrong one of the two returns nothing
       rather than erroring. */
    driverId: { type: String, required: true, unique: true, index: true },

    /* E.164, normalised before it gets here. Unique, because it IS the
       account — the same rule `app_customers` follows. */
    phone: { type: String, required: true, unique: true, index: true, trim: true },
    name: { type: String, default: '', trim: true },
    email: { type: String, default: '', lowercase: true, trim: true },

    /* ── Who they are ────────────────────────────────────────────────────
       Collected during onboarding and read by an approver beside the ID
       scans: the whole check is "does this name and this date of birth match
       the Aadhaar in the next panel". A date rather than an age, because an
       age stored is an age that is wrong a year later. */
    dateOfBirth: { type: Date, default: null },
    /* The city they work. Free text rather than an enum: Lampose operates in
       one city today and an enum would be a deploy every time it opens
       another. */
    city: { type: String, default: '', trim: true },
    /* A face, so the restaurant handing over food and the diner at the gate
       are looking at the same person the licence shows. */
    profilePhotoUrl: { type: String, default: '' },

    /*
     * Where the rider lives.
     *
     * Read by an approver beside the ID scans — an address that does not match
     * the one on the Aadhaar is the second most common reason an application
     * is refused. Singular, and NOT required by `onboardingProgress`: making it
     * a completeness rule would stop every already-approved rider working
     * until they filled it in. See the note there.
     */
    address: { type: addressSchema, default: undefined },

    vehicle: {
      type: { type: String, enum: VEHICLE_TYPES, default: 'bike' },
      model: { type: String, default: '', trim: true },
      /* Shown to the diner so they can identify the rider at the gate. Stored
         upper-cased and unspaced so two spellings of one plate are one string. */
      plate: { type: String, default: '', trim: true, uppercase: true },
    },

    /* What an administrator checks before approving — one row per document,
       each with its own verdict. See `documentSchema` above for why this is a
       list and not a bag of URLs. The scans themselves go to Cloudinary
       through `driverUpload.controller.js`; only the URLs live here. */
    documents: { type: [documentSchema], default: [] },

    /*
     * Where the money goes.
     *
     * The same shape, and the same narrowness, as `foodRestaurant.payout`:
     * the full account number is `select: false` and deleted by `toJSON` even
     * if something selects it back, `accountLast4` is written beside it at the
     * moment it arrives, and every screen in the product — the rider's own
     * profile and the admin console alike — reads the last four. Nothing here
     * is encryption and it is not claimed to be; it is the number never
     * leaving the process by any ordinary read.
     */
    payout: {
      accountHolderName: { type: String, default: '', trim: true },
      bankAccountNumber: { type: String, default: '', trim: true, select: false },
      accountLast4: { type: String, default: '', trim: true },
      ifscCode: { type: String, default: '', trim: true, uppercase: true },
      bankName: { type: String, default: '', trim: true },
      accountType: { type: String, enum: ['savings', 'current'], default: 'savings' },
      upiId: { type: String, default: '', trim: true },
    },

    /* Nothing this rider does reaches a diner until an administrator moves
       this to `approved`. No route in the driver module can set it — the same
       rule that makes `verificationStatus` mean something for restaurants. */
    status: { type: String, enum: DRIVER_STATUSES, default: 'pending', index: true },
    statusReason: { type: String, default: '', trim: true },

    /* Which kinds of work they have opted into. Today there is exactly one,
       and it is defaulted rather than required so a rider who onboarded before
       the field existed is not silently excluded from every dispatch — the
       matcher treats an empty array as "has not chosen", not as "wants
       nothing". */
    services: { type: [String], enum: SERVICES, default: ['food'] },

    /* ── Duty. Two booleans, and they are not the same one — see the header ─ */
    isOnline: { type: Boolean, default: false, index: true },
    isAvailable: { type: Boolean, default: true },
    onlineSince: { type: Date, default: null },
    /* The order they are carrying, by number. Null between jobs. Denormalised
       from `food_orders` on purpose: "what am I doing right now" is the query
       the app runs on every open, and it must not be a scan of the orders
       collection. `driverOrder.controller.js` is the only writer and it sets
       both sides in the same handler. */
    currentOrderNumber: { type: String, default: null },

    currentLocation: { type: pointSchema, default: undefined },
    /* Written on every position update. A position without one of these is
       treated as absent — see the header. */
    locationUpdatedAt: { type: Date, default: null },
    /* Degrees from north, relayed to the diner's map so the marker points the
       way the scooter is actually facing. Optional: a phone without a
       compass is an ordinary case. */
    heading: { type: Number, default: null },

    /*
     * Where to reach this rider's handsets.
     *
     * The same sub-document shape and the same reasoning as `app_customers`:
     * an array because one person signs in on two phones, session-guarded
     * because a push token is a capability, and pruned when Expo says the
     * installation is gone.
     */
    devices: {
      type: [
        {
          _id: false,
          token: { type: String, required: true },
          platform: { type: String, enum: ['ios', 'android', 'web', 'unknown'], default: 'unknown' },
          lastSeenAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },

    phoneVerifiedAt: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },

    /*
     * Finished setting up. NOT set by the client asking for it.
     *
     * `driver.controller.js` derives this from `onboardingProgress` below —
     * the app may say "I am done", and the server checks. The flag gates the
     * duty switch, so a client that could set it at will is a client that
     * could put an unidentified rider on the road by sending one boolean.
     */
    hasCompletedOnboarding: { type: Boolean, default: false },

    /* Where the rider stopped, so the app reopens the form where they left it
       rather than at step one. A hint for the UI only — nothing is authorised
       by it, and `onboardingProgress` is what actually decides completeness. */
    onboardingStep: {
      type: String,
      enum: ['personal', 'vehicle', 'documents', 'bank', 'done'],
      default: 'personal',
    },

    /* Identical to `app_customers.otp`, deliberately: it is the same six
       digits from the same DLT-registered template going to the same
       gateway, hashed by the same `otp.util.js`. Two OTP implementations in
       one process would drift, and the one that drifted would be the one
       nobody was testing. */
    otp: {
      hash: { type: String, default: null },
      salt: { type: String, default: null },
      expiresAt: { type: Date, default: null },
      attempts: { type: Number, default: 0 },
      resends: { type: Number, default: 0 },
      lastSentAt: { type: Date, default: null },
      campId: { type: String, default: null },
      lockedUntil: { type: Date, default: null },
    },
  },
  { timestamps: true, collection: 'app_drivers', strict: true },
);

/*
 * The dispatcher's query, and the only index that has to be fast.
 *
 * `$geoNear` must come first in its pipeline and needs a 2dsphere index of its
 * own; the compound index below serves the `query` predicate it carries
 * (online, available, approved) so the geo stage filters against an index
 * rather than every document that happens to be nearby.
 */
driverSchema.index({ currentLocation: '2dsphere' });
driverSchema.index({ isOnline: 1, isAvailable: 1, status: 1, locationUpdatedAt: -1 });

/*
 * Sweep out the carcass of the OLD `documents` shape, once, on the next write.
 *
 * `documents` used to be an object. Mongoose casts a stored object into this
 * array field by wrapping it — producing one sub-document with every real path
 * empty and `kind` absent — and `kind` is required, so the rider becomes
 * UNSAVEABLE: every `PATCH /me` and every document submission fails validation
 * with a message about `documents.0.kind` that names nothing the caller sent.
 * A rider who signed up before this change could therefore never edit their
 * profile again, and the error would look like a bug in whichever field they
 * happened to be editing.
 *
 * A pre-validate hook rather than a migration script because it is exactly as
 * correct and needs nobody to remember to run it: the wrapped row carries no
 * information (`readDocuments` has already extracted anything real for the
 * read path), so dropping it loses nothing, and the first write a legacy rider
 * makes leaves the document in the new shape for good.
 */
driverSchema.pre('validate', function dropLegacyDocuments(next) {
  if (Array.isArray(this.documents) && this.documents.some((doc) => !doc || !doc.kind)) {
    this.documents = this.documents.filter((doc) => doc && doc.kind);
  }
  next();
});

/**
 * What may leave the process.
 *
 * The whole `otp` sub-document goes, for the reason `customer.model.js` gives:
 * the hash and the salt beside it are what make an offline brute-force of six
 * digits cheap. `devices` goes too — a push token is a capability, and the
 * client that registered it already has it.
 */
driverSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.otp;
    delete ret.devices;
    delete ret.__v;
    /* `select: false` already keeps this out of every ordinary read; deleting
       it here as well is the belt to that brace, for the day somebody adds a
       `.select('+payout.bankAccountNumber')` for a settlement job and returns
       the document by accident. `accountLast4` is what every screen shows. */
    if (ret.payout) delete ret.payout.bankAccountNumber;
    return ret;
  },
});

/**
 * Is this rider's position recent enough to dispatch against?
 *
 * Exported rather than inlined at the two call sites (the matcher and the
 * driver's own `/me`) so the app can show "we cannot see where you are" using
 * exactly the rule that will decide whether they get offered work.
 */
const hasFreshLocation = (driver, now = Date.now()) => Boolean(
  driver
  && driver.currentLocation
  && Array.isArray(driver.currentLocation.coordinates)
  && driver.locationUpdatedAt
  && (now - new Date(driver.locationUpdatedAt).getTime()) <= LOCATION_MAX_AGE_MS,
);

/**
 * `documents` as a list, whatever shape is actually in the database.
 *
 * This field used to be an OBJECT — `{ licenceNumber, licenceImageUrl,
 * idProofImageUrl, submittedAt }` — and riders who signed up before it became
 * a list still hold one. Mongoose does not rewrite a document on read, so the
 * first `.map()` over it threw, and because `documentChecklist` is the first
 * thing `queueRow` calls, ONE legacy rider took down the entire approval queue
 * with a 500. Nobody could be approved, including the riders whose rows were
 * perfectly fine.
 *
 * So the old shape is read rather than merely survived. A licence number and
 * its scan become the `licence` row; an ID-proof scan becomes the `aadhaar`
 * row. Both come back `pending`, which is the truth about them: they were
 * submitted and never decided on, because there was nothing that could decide
 * on one document at a time when they arrived.
 *
 * Nothing here writes. The forward-migration happens naturally the next time
 * that rider submits anything, because `submitDocument` writes the new shape;
 * until then this is what an approver sees, and it is the same data.
 */
const readDocuments = (driver) => {
  const raw = driver && driver.documents;
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== 'object') return [];

  const legacy = [];
  if (raw.licenceNumber || raw.licenceImageUrl) {
    legacy.push({
      kind: 'licence',
      number: raw.licenceNumber || '',
      frontUrl: raw.licenceImageUrl || '',
      backUrl: '',
      expiresAt: null,
      status: 'pending',
      reason: '',
      submittedAt: raw.submittedAt || null,
      reviewedAt: null,
    });
  }
  if (raw.idProofImageUrl) {
    legacy.push({
      kind: 'aadhaar',
      number: '',
      frontUrl: raw.idProofImageUrl,
      backUrl: '',
      expiresAt: null,
      status: 'pending',
      reason: '',
      submittedAt: raw.submittedAt || null,
      reviewedAt: null,
    });
  }
  return legacy;
};

/**
 * The rider's documents as a COMPLETE checklist, one row per known kind.
 *
 * The app renders a five-row list whether or not anything has been uploaded,
 * and the console shows the same five so an approver can see at a glance that
 * an insurance certificate is absent rather than merely scrolling past where
 * it would have been. Building that list in one place means the app and the
 * console cannot disagree about what "missing" looks like.
 *
 * A kind with no stored row comes back as `status: 'missing'` — which is
 * deliberately NOT one of `DOCUMENT_STATUSES`, because it is not a decision
 * anybody made. Nothing is ever written with it.
 */
const documentChecklist = (driver) => {
  const stored = new Map(
    readDocuments(driver).map((doc) => [doc.kind, doc]),
  );

  return DOCUMENT_KINDS.map((kind) => {
    const doc = stored.get(kind);
    return {
      kind,
      label: DOCUMENT_LABELS[kind],
      required: REQUIRED_DOCUMENT_KINDS.includes(kind),
      number: (doc && doc.number) || '',
      frontUrl: (doc && doc.frontUrl) || '',
      backUrl: (doc && doc.backUrl) || '',
      expiresAt: (doc && doc.expiresAt) || null,
      status: doc ? doc.status : 'missing',
      reason: (doc && doc.reason) || '',
      submittedAt: (doc && doc.submittedAt) || null,
      reviewedAt: (doc && doc.reviewedAt) || null,
    };
  });
};

/**
 * What is still missing before this rider can be put in front of an approver.
 *
 * The ONE definition of "finished onboarding", read by three callers that must
 * not disagree: `PATCH /me` when the app claims to be done, `GET /me` so the
 * app can list what is left, and the admin console so an approver is told why
 * an application is not yet reviewable rather than approving an empty one.
 *
 * Note what is NOT required: a verified document. Verification is the thing an
 * approver does AFTER the rider finishes; requiring it here would be a rider
 * who cannot complete onboarding until somebody approves the onboarding.
 */
const onboardingProgress = (driver) => {
  const missing = [];
  if (!driver) return { complete: false, missing: ['everything'], documents: [] };

  if (!String(driver.name || '').trim()) missing.push('your name');
  if (!driver.dateOfBirth) missing.push('your date of birth');
  if (!String(driver.city || '').trim()) missing.push('your city');

  const vehicle = driver.vehicle || {};
  if (!vehicle.type) missing.push('your vehicle type');
  /* A cycle has no plate, and demanding one is how a bicycle rider is stopped
     at step three of a form they cannot finish. */
  if (vehicle.type !== 'cycle' && !String(vehicle.plate || '').trim()) {
    missing.push('your registration number');
  }

  const checklist = documentChecklist(driver);
  checklist
    .filter((doc) => doc.required && (doc.status === 'missing' || !doc.frontUrl))
    .forEach((doc) => missing.push(doc.label));

  const payout = driver.payout || {};
  /* Either a bank account or a UPI id — one way to be paid is enough, and
     insisting on both is a step riders abandon. */
  if (!payout.accountLast4 && !String(payout.upiId || '').trim()) {
    missing.push('where to pay you');
  }

  return { complete: missing.length === 0, missing, documents: checklist };
};

/**
 * The rider as the DINER is allowed to see them.
 *
 * A name, a vehicle and a number to call. Not the licence, not the email, not
 * the position history — a diner needs to recognise somebody at a gate and
 * ring them if they cannot find the door, and nothing beyond that.
 */
const publicDriver = (driver) => (driver ? {
  driverId: driver.driverId,
  name: driver.name || 'Your rider',
  phone: driver.phone || '',
  vehicle: {
    type: (driver.vehicle && driver.vehicle.type) || 'bike',
    model: (driver.vehicle && driver.vehicle.model) || '',
    plate: (driver.vehicle && driver.vehicle.plate) || '',
  },
} : null);

const Driver = mongoose.models.Driver
  || mongoose.model('Driver', driverSchema, 'app_drivers');

module.exports = Driver;
module.exports.DRIVER_STATUSES = DRIVER_STATUSES;
module.exports.SERVICES = SERVICES;
module.exports.VEHICLE_TYPES = VEHICLE_TYPES;
module.exports.DOCUMENT_KINDS = DOCUMENT_KINDS;
module.exports.REQUIRED_DOCUMENT_KINDS = REQUIRED_DOCUMENT_KINDS;
module.exports.DOCUMENT_STATUSES = DOCUMENT_STATUSES;
module.exports.DOCUMENT_LABELS = DOCUMENT_LABELS;
module.exports.LOCATION_MAX_AGE_MS = LOCATION_MAX_AGE_MS;
module.exports.makeDriverId = makeDriverId;
module.exports.hasFreshLocation = hasFreshLocation;
module.exports.documentChecklist = documentChecklist;
module.exports.onboardingProgress = onboardingProgress;
module.exports.publicDriver = publicDriver;
