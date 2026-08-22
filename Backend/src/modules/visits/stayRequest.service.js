/* ══════════════════════════════════════════════════════════════════════════
   The stay request, as a state machine — and the only place it changes state.

   ## One shape, four callers, no read-then-write

   Four unrelated actors can end a pending request:

     the owner accepting          a tap in the Stay Partner app
     the owner declining          a tap in the Stay Partner app
     the student withdrawing      a tap in the User App
     the clock                    a worker on a five-second tick

   Any two of them can arrive in the same millisecond. The rule is that the
   FIRST VALID SERVER-SIDE TRANSITION THAT COMMITS WINS, and it is enforced by
   the filter of a single-document conditional update:

     { _id, status: 'pending_owner', expiresAt: { $gt: now } }  →  $set{...}

   Mongo applies concurrent updates to one document one at a time, so of two
   racing callers exactly one matches. The loser matches nothing, gets `null`
   back, and re-reads to find out who beat it — which is the only way to tell
   an owner "this expired" rather than "something went wrong".

   What this file must never contain is:

     const doc = await VisitRequest.findById(id);   // ← read
     if (doc.status !== 'pending_owner') return;    // ← check
     doc.status = 'confirmed'; await doc.save();    // ← write

   Two callers both pass the check before either writes, and both write. That
   is a student told they are confirmed for a bed another student also has.

   ## Why expiry is in the filter as well as in the worker

   Three independent things enforce the deadline, and the flow is correct if
   ANY ONE of them works:

     1. the worker    flips overdue rows and notifies, even with both apps dead
     2. this filter   refuses a late accept even if the worker has not run yet
     3. reads         settle an overdue row on the way past

   A worker alone would let an owner accept at 3:04 because nothing had got
   round to the row. The filter alone would leave a student waiting forever
   with no notification. Neither is sufficient; together they are hard to
   break.

   ## Acceptance takes the bed BEFORE the request, on purpose

   Two documents change and there are no transactions — the deployment is a
   single server, not a replica set. So the order is chosen for a survivable
   failure: take the scarce thing first, and give it back if the request is
   then lost. Giving a bed back is harmless. The other order is not — accept
   first, find no bed, and a student has already been told they are confirmed
   for something that does not exist.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const config = require('../../config/env');
const VisitRequest = require('./visitRequest.model');
const Partner = require('../partners/partner.model');
const { claimBed, releaseBed, bookedAtLabel } = require('../inventory/inventory.service');

const { phoneKey } = Partner;

/* One definition, in shared/constants/categories.js — these used to be
   three hand-synchronised copies. */
const {
  NIGHTLY_CATEGORIES, SIMPLE_PATH_CATEGORIES, TOKEN_CATEGORIES, normaliseCategory,
} = require('../../shared/constants/categories');

/* ------------------------------------------------------------------ *
 * Failures
 * ------------------------------------------------------------------ */

/**
 * A refusal the caller is meant to show somebody.
 *
 * Carries a machine-readable `code` and an HTTP status, because the two apps
 * branch on the code and never on the message text — the text is written for
 * a person and is expected to be rewritten.
 */
class StayRequestError extends Error {
  constructor(code, message, status = 409) {
    super(message);
    this.name = 'StayRequestError';
    this.code = code;
    this.status = status;
  }
}

/** What a terminal status means to whoever just tried to act on it. */
const CONFLICT_FOR = {
  confirmed: ['ALREADY_ACCEPTED', 'This request has already been accepted.'],
  declined: ['ALREADY_DECLINED', 'This request has already been declined.'],
  expired: ['REQUEST_EXPIRED', 'This request has expired.'],
  cancelled: ['REQUEST_CANCELLED', 'The student cancelled this request.'],
  otp_pending: ['REQUEST_NOT_SENT', 'This request has not been sent yet.'],
};

/**
 * Why the guarded update matched nothing.
 *
 * Called only after a transition has already failed, so the extra read costs
 * nothing on the happy path. It exists because "your update matched zero
 * documents" is useless to a person: an owner needs to know whether the clock
 * beat them or the student walked away, and those are different sentences and
 * different next actions.
 */
const explainFailure = async (requestId, ownerKey = null) => {
  const doc = await VisitRequest.findById(requestId).lean();

  if (!doc) throw new StayRequestError('NOT_FOUND', 'We could not find that request.', 404);

  /* Ownership is re-checked here rather than assumed from the caller, and the
     answer is a 404 rather than a 403 — the same reply as "does not exist", so
     an id cannot be used to discover whose requests exist. */
  if (ownerKey && phoneKey(doc.ownerMobile) !== ownerKey) {
    throw new StayRequestError('NOT_FOUND', 'We could not find that request.', 404);
  }

  if (doc.status !== 'pending_owner') {
    const [code, message] = CONFLICT_FOR[doc.status] || ['CONFLICT', 'This request can no longer be changed.'];
    throw new StayRequestError(code, message);
  }

  /* Still pending, so the only thing left in the filter is the clock. The row
     has not been flipped yet — the worker will get to it — but it is over. */
  throw new StayRequestError('REQUEST_EXPIRED', 'This request has expired.');
};

const requireDb = () => {
  if (mongoose.connection.readyState !== 1) {
    throw new StayRequestError(
      'DB_DISCONNECTED',
      'The server is running but not connected to the database.',
      503,
    );
  }
};

/* ------------------------------------------------------------------ *
 * The deadline
 * ------------------------------------------------------------------ */

/**
 * When a request made now must be answered by.
 *
 * The single source of the deadline. Both apps render `expiresAt`; neither
 * computes it, and neither may send one — a client-supplied expiry is a
 * client choosing how long it holds somebody else's bed.
 */
const deadlineFrom = (createdAt = new Date()) => new Date(
  createdAt.getTime() + config.booking.expiryMinutes * 60 * 1000,
);

/* ------------------------------------------------------------------ *
 * Create
 * ------------------------------------------------------------------ */

/**
 * A student asks an owner for a bed.
 *
 * Every refusal below is a REFUSAL AT CREATION rather than a request written
 * and left to rot. A row nobody can answer is worse than an error: it sits in
 * the student's app counting down for three minutes, expires, and tells them
 * an owner ignored them when in fact no owner was ever reachable.
 *
 * ## What is taken from the caller, and what is not
 *
 * Taken:      the listing, the sharing LABEL, the stay intent, the consent tick.
 * Never taken: the student's name, phone or id (the session says who they are),
 *              the owner's number (read off the property), any price (re-derived
 *              from the property), and `expiresAt` — a caller-supplied deadline
 *              is a caller deciding how long it holds somebody else's bed.
 *
 * ## No bed is held here
 *
 * Creation checks that one is free; it does not take it. Two students may both
 * have a live request on the last bed, which is the point — the owner sees
 * both and chooses. The bed is claimed at acceptance, and the loser is
 * auto-declined. Holding at creation would make the second request impossible
 * to send and take the choice away from the owner.
 */
const createStayRequest = async ({ customer, listingId, sharing, intent, consentedTerms, requestIp }) => {
  requireDb();

  /* Deferred to here rather than required at the top of the file: the
     inventory service already imports from this module's neighbours, and the
     listings module pulls in the formatter. Requiring at call time keeps the
     module graph acyclic without anything having to be moved. */
  const Property = require('../properties/property.model');
  const { findRequestableOption } = require('../inventory/inventory.service');
  const { validateIntent } = require('../listings/stayIntent.util');

  /* 1 — the listing exists. A bad id is a 404, never a cast error. */
  if (!mongoose.isValidObjectId(listingId)) {
    throw new StayRequestError('NOT_FOUND', 'We could not find that property.', 404);
  }
  const property = await Property.findById(listingId).lean();
  if (!property) {
    throw new StayRequestError('NOT_FOUND', 'We could not find that property.', 404);
  }

  /* 2 — it is still listed. `status` is the leads panel's own lifecycle flag
     and anything but active means it should not be taking requests. */
  if (property.status && property.status !== 'active') {
    throw new StayRequestError('PROPERTY_UNAVAILABLE', 'This property is not taking requests right now.', 422);
  }

  /*
   * 3 — the owner has a usable number on file.
   *
   * NORMALISED, not copied. `Property.ownerMobile` has been typed in by hand
   * by field agents for as long as the product has existed, and the live
   * collection holds `"+91 8639139906"`, `"+919704726252"` and `undefined`
   * side by side. `VisitRequest.ownerMobile` is documented as E.164 and every
   * owner-side query matches it as E.164 — so writing the property's spelling
   * through verbatim produces a request that exists, notifies its owner, and
   * is invisible in their list, because the feed queries `+919704726252` and
   * the row says `+91 9704 726252`.
   *
   * The web flow has always called `toE164` here. This one now does too.
   */
  const { toE164 } = require('../../infrastructure/twilio/twilio');
  const ownerMobile = toE164(property.ownerMobile);
  const ownerKey = phoneKey(ownerMobile);

  if (!ownerMobile || !ownerKey) {
    throw new StayRequestError(
      'OWNER_NOT_CONTACTABLE',
      'We do not have a contact number for this owner yet. Please try another property.',
      422,
    );
  }

  /* 4 — and they are on the Stay Partner app, with the number PROVED. An
     unverified row is somebody who typed a number into a login screen, not
     somebody holding the handset — sending them a student's details would be
     the whole point of the verification gate defeated. */
  const owner = await Partner.findOne({ phoneDigits: ownerKey, phoneVerifiedAt: { $ne: null } }).lean();
  if (!owner) {
    throw new StayRequestError(
      'OWNER_NOT_ONBOARDED',
      'This owner is not on Lampose Stay Partner yet, so they cannot receive requests.',
      422,
    );
  }
  if (owner.status === 'blocked') {
    throw new StayRequestError('OWNER_NOT_ELIGIBLE', 'This property is not taking requests right now.', 422);
  }

  /*
   * 5 — one request per listing per student, live OR already granted.
   *
   * Not per property per day as the web flow holds it: this one expires in
   * minutes, so a student whose owner did not answer should be able to ask
   * again immediately. Two things are refused instead:
   *
   *   pending    two clocks running on the same listing at once.
   *   confirmed  asking for a bed they have already been given here. The
   *              owner would be notified about a student they accepted an
   *              hour ago, and — if it was the last bed — the request would
   *              be refused as "full" by the student's own booking.
   *
   * Separate codes, because they need separate sentences: one is "wait", the
   * other is "you already have this".
   *
   * ## Why this is checked BEFORE the room and the beds
   *
   * A student holding the last bed at a property, asking again, used to be
   * told "every bed in this room type is taken" — true, and useless, because
   * the bed was taken by them. The most specific true answer wins, so the
   * question "do you already have this?" is asked before "is there room?".
   */
  const existing = await VisitRequest.findOne({
    channel: 'app',
    customerId: customer.customerId,
    listingId: String(property._id),
    $or: [
      { status: 'pending_owner', expiresAt: { $gt: new Date() } },
      { status: 'confirmed' },
    ],
  }).lean();

  if (existing && existing.status === 'confirmed') {
    throw new StayRequestError(
      'ALREADY_BOOKED',
      'You already have a confirmed booking at this property.',
      409,
    );
  }
  if (existing) {
    throw new StayRequestError(
      'ALREADY_REQUESTED',
      'You already have a request waiting on this property.',
      409,
    );
  }

  /* 6 — the sharing option is one the LISTING actually offers, resolved
     against the property rather than trusted. A crafted label would otherwise
     put a room type in front of an owner that the page never showed. */
  const option = await findRequestableOption(property, sharing);
  if (!option) {
    throw new StayRequestError('INVALID_SHARING', 'That room type is not offered here.', 422);
  }

  /* 7 — and it can actually be requested. Each reason gets its own message:
     "nobody recorded a count" and "every bed is taken" are different problems
     and only one of them is about being busy. */
  if (!option.requestable) {
    /* A taken room says WHEN it went. It shows the listing is live rather
       than stale, and tells someone whether they missed it by an hour or a
       month. Same wording as the website's form — one fact, one sentence. */
    const when = option.reason === 'NO_BEDS_FREE' ? await bookedAtLabel(option.shareTypeId) : null;
    const REASONS = {
      NO_INVENTORY_RECORDED: ['INVENTORY_NOT_SET', 'We do not have live availability for this room type yet.'],
      OWNER_PAUSED: ['INVENTORY_PAUSED', 'The owner has paused this room type.'],
      NO_BEDS_FREE: ['NO_BEDS_FREE', when
        ? `This room type was booked on ${when}.`
        : 'This room type is fully booked.'],
    };
    const [code, message] = REASONS[option.reason] || ['INVENTORY_UNAVAILABLE', 'This room type is not available.'];
    throw new StayRequestError(code, message, 422);
  }

  /* 8 — the stay itself is re-derived from the property's own figures. Nothing
     priced is taken from the body: `validateIntent` returns the intent rebuilt
     from the property's own numbers, so a posted rate is discarded rather than
     trusted. Same call, same arguments as the web controller makes — the two
     flows must not be able to accept different stays for the same listing. */
  const simplePath = SIMPLE_PATH_CATEGORIES.includes(normaliseCategory(property.category));
  /* A hotel is asked for a check-in and a check-out rather than a duration.
     `validateIntent` resolves the two dates into the same intent shape a short
     stay produces, so nothing past this line has to know. */
  const datesPath = NIGHTLY_CATEGORIES.includes(normaliseCategory(property.category));
  const checked = validateIntent({
    doc: property,
    intent: intent || null,
    /* The WHOLE option, not a two-field copy of it.
       `validateIntent` reads `rates` to price a hotel bed by the structure the
       guest picked, and the copy this used to build dropped that field — so
       every hotel request from the app came back NO_RATE for a bed the page
       had just shown a price for. */
    sharingOption: option,
    simplePath,
    datesPath,
  });
  if (!checked.ok) {
    throw new StayRequestError(checked.code || 'INVALID_INTENT', checked.message, 422);
  }

  /* 9 — consent. The legal record that the student agreed before their name
     and number were handed to a stranger, so it is required rather than
     assumed. */
  if (consentedTerms !== true) {
    throw new StayRequestError('CONSENT_REQUIRED', 'Please accept the terms before sending a request.', 422);
  }

  /* 10 — the account can answer for them. The session proves the phone; the
     name and email are what the owner and the agreement need. */
  if (!customer.name || !String(customer.name).trim()) {
    throw new StayRequestError('PROFILE_INCOMPLETE', 'Add your name to your profile before sending a request.', 422);
  }

  /* 11 & 12 — the server stamps both times, and only the server. */
  const createdAt = new Date();

  const request = await VisitRequest.create({
    channel: 'app',
    listingId: String(property._id),
    propertyName: property.name,
    ownerName: property.ownerName || 'Property Owner',
    /* Read off the property document, never from the request body — that is
       the line that stops a caller making a stranger's phone ring — and
       normalised to E.164, because every owner-side query matches it that
       way. See the note at check 3. */
    ownerMobile,

    customerId: customer.customerId,
    customer: {
      name: String(customer.name).trim(),
      phone: customer.phone,
      /* Was `${customerId}@no-email.lampose` — a fabricated address written to
         satisfy a required field. The field is optional now, so a customer
         without an email simply has none rather than one that looks real and
         bounces. */
      email: (customer.email || '').trim().toLowerCase(),
    },

    shareTypeId: option.shareTypeId,
    sharing: { label: option.label, price: option.price },
    intent: checked.intent || null,
    /*
     * The ₹199 assisted-visit payment, on the categories that charge one.
     *
     * Set here as well as on the web path because a bachelor visit costs the
     * same whichever surface asked for it — the only difference is that this
     * one's owner answers in Stay Partner rather than on WhatsApp. Frozen at
     * creation: editing the listing's category later must not make a paid
     * request unpaid.
     */
    payment: TOKEN_CATEGORIES.includes(normaliseCategory(property.category))
      ? { required: true, status: 'pending', amountPaise: config.razorpay.assistedVisitAmountPaise }
      : { required: false, status: 'not_required' },

    consentedTerms: true,
    consentedTermsAt: createdAt,

    /* Already past the code step by construction: the phone was proved at
       sign-in, which is the entire reason this flow has no OTP. */
    status: 'pending_owner',
    phoneVerifiedAt: customer.phoneVerifiedAt || createdAt,

    expiresAt: deadlineFrom(createdAt),
    requestIp: requestIp || null,
  });

  return { request, owner, property };
};

/* ------------------------------------------------------------------ *
 * The transitions
 * ------------------------------------------------------------------ */

/** The filter every exit from `pending_owner` shares. */
const openFilter = (requestId) => ({
  _id: requestId,
  status: 'pending_owner',
  expiresAt: { $gt: new Date() },
});

/**
 * The owner says yes.
 *
 * Order: bed, then request, then give the bed back if the request was lost.
 * See the note at the top of the file for why that order and not the other.
 *
 * Returns `{ request, shareTypeId }`. The caller writes the booking row and
 * sends the notifications — those are not state transitions and putting them
 * here would make this function impossible to reason about under a race.
 */
const accept = async (requestId, partner) => {
  requireDb();

  const ownerKey = partner.phoneDigits || phoneKey(partner.phone);
  if (!ownerKey) throw new StayRequestError('OWNER_NOT_ELIGIBLE', 'This account has no verified number.', 403);

  /* Scoped on the owner in the same filter as the status. A separate
     authorisation read would be a second round trip AND a window in which the
     property could be reassigned between the check and the write. */
  const filter = { ...openFilter(requestId), ownerMobile: { $in: [`+91${ownerKey}`, ownerKey] } };

  /* The bed is only claimed for a request that names a pool. A row without a
     `shareTypeId` predates counted inventory or came from the web channel;
     accepting it changes no counter, which is honest — there is no counter. */
  const pending = await VisitRequest.findOne(filter).select('shareTypeId payment').lean();
  const shareTypeId = pending ? pending.shareTypeId : null;

  let held = null;
  if (shareTypeId) {
    held = await claimBed(shareTypeId);
    if (!held) {
      throw new StayRequestError(
        'INVENTORY_GONE',
        'That room is no longer available — the last bed was taken.',
      );
    }
  }

  /*
   * The PIN is generated BEFORE the update, so it goes in with the same write
   * that confirms the request.
   *
   * Issuing it afterwards would leave a window — however short — in which a
   * request reads as confirmed with no PIN on it, and both apps show that row
   * the moment it flips. One write, one consistent state.
   */
  const { generateEntryPin } = require('./otp.util');
  const issuedAt = new Date();

  /*
   * A visit that has to be paid for is not settled by the owner's tap.
   *
   * On paid categories there is no entry PIN at all any more: a Lampose
   * representative accompanies the visit, so there is nothing to match at
   * the door. What starts now is the clock to pay the ₹199 — the slot and
   * the address come after the money (assistedSlot.controller). The PIN
   * branch below is the free categories', whose visit IS settled by this
   * tap.
   */
  const tokenDue = Boolean(pending?.payment?.required && pending.payment.status !== 'paid');

  const request = await VisitRequest.findOneAndUpdate(
    filter,
    {
      $set: {
        status: 'confirmed',
        decidedAt: issuedAt,
        decidedBy: partner.partnerId || null,
        decisionReason: null,
        /* Shared, not secret: the student and the owner compare it at the
           door. See the note on the field. */
        ...(tokenDue
          ? { 'payment.status': 'pending', 'payment.dueBy': new Date(issuedAt.getTime() + config.razorpay.payWindowHours * 3600 * 1000) }
          : { entryPin: generateEntryPin(), entryPinIssuedAt: issuedAt }),
      },
    },
    { new: true },
  );

  if (!request) {
    /* Lost the request after taking a bed for it. Hand the bed back before
       reporting, or a race that nobody won would still cost a bed. */
    if (held) await releaseBed(shareTypeId);
    await explainFailure(requestId, ownerKey);   // always throws
  }

  return { request, shareTypeId };
};

/**
 * Accept, and everything acceptance implies.
 *
 * `accept` above is the state transition and nothing else — deliberately, so
 * it can be reasoned about under a race. This is the orchestration around it,
 * in the order the consequences actually have to happen:
 *
 *   1. the transition          (takes the bed, claims the request)
 *   2. the customer row        so the owner sees a guest, not a silent tap
 *   3. the auto-decline sweep  if that was the last bed
 *
 * Steps 2 and 3 run only because step 1 committed, which is what makes a
 * double tap harmless: the second tap never reaches them.
 *
 * ## Why the booking row is written immediately
 *
 * There is no payment step, so acceptance IS the end of the flow — there is no
 * later moment for the row to appear at. An owner who accepts and then sees
 * nothing in their customer list has been told the tap did nothing.
 *
 * ## Failures after the transition are logged, not thrown
 *
 * The request is already confirmed and the student has already been told. A
 * booking row that failed to write is a reconcilable inconsistency; throwing
 * here would report failure for an acceptance that genuinely happened, and the
 * owner would tap again.
 */
const acceptAndBook = async (requestId, partner) => {
  const { PartnerBooking, PartnerShareType } = require('../partners/partnerDomains.model');

  const { request, shareTypeId } = await accept(requestId, partner);

  /* ── The customer row ─────────────────────────────────────────────────
     `source: 'request'` is the field the schema already carries for exactly
     this — it separates a guest who proved their own number through the User
     App from a walk-in the owner typed in, and a dispute months later turns
     on which of those it was. */
  let booking = null;
  try {
    const intent = request.intent || {};
    const joining = intent.joiningDate || null;

    /*
     * An end date only where the student actually named a length of stay.
     *
     * "Five nights from the 5th" has an end; "moving in on the 5th" on a long
     * stay does not, and the owner's list must not show a departure nobody
     * agreed to. Empty is the honest answer and the schema takes it.
     */
    const checkOutDate = (() => {
      if (!joining || !intent.duration || !intent.durationUnit) return '';
      const [y, m, d] = joining.split('-').map(Number);
      if (!y || !m || !d) return '';
      const end = new Date(Date.UTC(y, m - 1, d));
      if (intent.durationUnit === 'days') end.setUTCDate(end.getUTCDate() + intent.duration);
      else end.setUTCMonth(end.getUTCMonth() + intent.duration);
      return end.toISOString().slice(0, 10);
    })();

    booking = await PartnerBooking.create({
      partnerPhoneDigits: partner.phoneDigits || phoneKey(partner.phone),
      /* The student's side of the link. Set here because this is the one place
         a booking is created from a request, so it is the one place the
         customer is actually known. */
      customerId: request.customerId || null,
      requestId: String(request._id),
      propertyId: request.listingId,
      propertyName: request.propertyName,
      guestName: (request.customer && request.customer.name) || '',
      guestPhone: (request.customer && request.customer.phone) || '',
      guestEmail: (request.customer && request.customer.email) || '',
      /* Not known yet. The owner assigns one at check-in; inventory is counted
         per room TYPE, not per numbered room, so nothing here depends on it. */
      roomNumber: 'Unassigned',
      shareType: (request.sharing && request.sharing.label) || 'Single',
      checkInDate: joining || new Date().toISOString().slice(0, 10),
      /* Derived from the stay the student asked for, or empty when they
         named no length — see above. */
      checkOutDate,
      status: 'upcoming',
      /* Re-derived server-side and carried through; nothing is charged. */
      totalAmount: intent.totalAmount || 0,
      paidAmount: 0,
      source: 'request',
      /* Copied from the request so check-in never has to look it up — see the
         note on the field. The request has just been confirmed, so this is
         always set by the time we get here. */
      entryPin: request.entryPin || null,
    });

    request.bookingId = String(booking._id);
    await request.save();
  } catch (error) {
    console.error('[stay-request] accepted but the booking row failed:', error.message);
  }

  /* ── The students who were waiting on the same bed ────────────────────
     Only when the pool is actually empty. With beds left, everybody else's
     request is still answerable and must be left alone — that is the whole
     "owner can accept three students for three beds" rule. */
  let autoDeclined = [];
  if (shareTypeId) {
    const pool = await PartnerShareType.findOne({ shareTypeId }).lean();
    if (pool && pool.availableBeds <= 0) {
      autoDeclined = await declineForLostInventory(shareTypeId, { exceptId: request._id });
    }
  }

  return { request, booking, autoDeclined };
};

/**
 * The owner says no.
 *
 * No inventory involved — a decline frees nothing because nothing was taken.
 * `reason` distinguishes a decline the owner made from one the last bed
 * forced, and the two must never be collapsed: only one of them is about this
 * student.
 */
const decline = async (requestId, partner, { reason = 'OWNER_DECLINED', note = null } = {}) => {
  requireDb();

  const ownerKey = partner.phoneDigits || phoneKey(partner.phone);
  if (!ownerKey) throw new StayRequestError('OWNER_NOT_ELIGIBLE', 'This account has no verified number.', 403);

  const request = await VisitRequest.findOneAndUpdate(
    { ...openFilter(requestId), ownerMobile: { $in: [`+91${ownerKey}`, ownerKey] } },
    {
      $set: {
        status: 'declined',
        decidedAt: new Date(),
        decidedBy: partner.partnerId || null,
        decisionReason: reason,
        declineNote: note ? String(note).slice(0, 500) : null,
      },
    },
    { new: true },
  );

  if (!request) await explainFailure(requestId, ownerKey);
  return request;
};

/**
 * The student pulls it back.
 *
 * Scoped on `customerId` in the filter, never on the phone number: a phone is
 * a string anybody can send, and this endpoint ends somebody else's request.
 *
 * The withdrawal limit needs no counter to enforce it. A withdrawal is
 * terminal, so a second attempt fails the `pending_owner` filter — the count
 * is recorded as evidence, and the configured ceiling is checked so that
 * setting it to zero actually disables the feature.
 */
const withdraw = async (requestId, customer) => {
  requireDb();

  if (config.booking.maxWithdrawalsPerRequest < 1) {
    throw new StayRequestError(
      'WITHDRAWAL_NOT_ALLOWED',
      'Requests cannot be cancelled once sent.',
      403,
    );
  }

  const request = await VisitRequest.findOneAndUpdate(
    {
      ...openFilter(requestId),
      customerId: customer.customerId,
      withdrawals: { $lt: config.booking.maxWithdrawalsPerRequest },
    },
    {
      $set: {
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelledBy: 'student',
        decidedAt: new Date(),
        decisionReason: 'STUDENT_WITHDREW',
      },
      $inc: { withdrawals: 1 },
    },
    { new: true },
  );

  if (!request) {
    /* Not somebody else's request, and not "no longer pending" — those are
       different failures and the second one has to name what happened
       instead. A request that is not theirs is a 404, as everywhere. */
    const own = await VisitRequest.findOne({ _id: requestId, customerId: customer.customerId }).lean();
    if (!own) throw new StayRequestError('NOT_FOUND', 'We could not find that request.', 404);

    if (own.withdrawals >= config.booking.maxWithdrawalsPerRequest && own.status === 'pending_owner') {
      throw new StayRequestError('WITHDRAWAL_LIMIT_REACHED', 'You have already cancelled this request.');
    }
    await explainFailure(requestId);   // always throws
  }

  return request;
};

/**
 * The student's half of moving in.
 *
 * The second of the two confirmations, and it is refused until the owner has
 * given the first. That order is not a database preference: the owner is the
 * one who checks the PIN and opens a door, so a student able to mark
 * themselves in beforehand has marked nothing — and the record would say
 * somebody moved in that nobody let in.
 *
 * Reached through the REQUEST rather than the booking, because the request is
 * the student's only handle on any of this: they have no bookings endpoint,
 * and the booking belongs to the owner's side of the product.
 */
const confirmMoveIn = async (requestId, customer) => {
  requireDb();

  const { PartnerBooking } = require('../partners/partnerDomains.model');

  /* Theirs, and confirmed. Scoped in the query — a booking id in a URL must
     never be enough to mark somebody else moved in. */
  const request = await VisitRequest.findOne({
    _id: requestId,
    customerId: customer.customerId,
  }).lean();

  if (!request) throw new StayRequestError('NOT_FOUND', 'We could not find that booking.', 404);
  if (request.status !== 'confirmed') {
    throw new StayRequestError(
      'NOT_CONFIRMED',
      'This request has not been accepted, so there is nothing to move into yet.',
    );
  }
  if (!request.bookingId) {
    throw new StayRequestError('NO_BOOKING', 'This booking is not ready yet. Try again shortly.');
  }

  const booking = await PartnerBooking.findById(request.bookingId).lean();
  if (!booking) throw new StayRequestError('NOT_FOUND', 'We could not find that booking.', 404);

  if (!booking.movedInByOwnerAt) {
    /* The whole point of the ordering, said plainly enough to put on screen. */
    throw new StayRequestError(
      'OWNER_HAS_NOT_CONFIRMED',
      'Show your entry PIN to the owner first — you can confirm once they have marked you in.',
    );
  }

  /* Guarded on `null`, so a second tap keeps the first time. The moment a
     student says they moved in is a fact, and tapping again is not a second
     move-in. */
  const stamped = await PartnerBooking.findOneAndUpdate(
    { _id: booking._id, movedInByStudentAt: null },
    { $set: { movedInByStudentAt: new Date(), status: 'in_house' } },
    { new: true },
  );

  /* Null means they had already confirmed. Idempotent, not an error. */
  const current = stamped || await PartnerBooking.findById(booking._id);

  return { request, booking: current };
};

/**
 * The clock runs out.
 *
 * Not a bulk `updateMany`, deliberately. Each row is transitioned on its own
 * so the caller learns WHICH rows it won — and only those get a notification.
 * A bulk update reports a count, and a count cannot tell you whether the row
 * you are about to notify about was expired by you or accepted by an owner a
 * millisecond earlier.
 *
 * That is also what makes the worker idempotent: a second pass matches
 * nothing, so it returns an empty list and sends nothing.
 */
const expireDue = async ({ limit = 200 } = {}) => {
  if (mongoose.connection.readyState !== 1) return [];

  const now = new Date();

  const due = await VisitRequest.find({
    channel: 'app',
    status: 'pending_owner',
    expiresAt: { $lte: now },
  })
    .select('_id')
    .limit(limit)
    .lean();

  const expired = [];

  for (const { _id } of due) {
    const request = await VisitRequest.findOneAndUpdate(
      /* Not `openFilter` — that one requires the deadline to be in the
         FUTURE, which is the opposite of what is wanted here. */
      { _id, status: 'pending_owner', expiresAt: { $lte: new Date() } },
      {
        $set: {
          status: 'expired',
          decidedAt: new Date(),
          decisionReason: 'NO_ANSWER',
        },
      },
      { new: true },
    );
    /* Null means an owner or the student got there between the find and the
       update. Their transition stands, and this one silently does nothing —
       which is exactly right, and why no notification is sent for it. */
    if (request) expired.push(request);
  }

  return expired;
};

/**
 * Everything still pending on a pool whose last bed has just gone.
 *
 * Called after an acceptance empties a share type. These are requests nobody
 * declined — the bed went to somebody else while they waited — so they carry
 * `INVENTORY_TAKEN` and the app says so rather than reporting a rejection the
 * owner never made.
 *
 * Same per-row guarded update as expiry, and for the same reason: only the
 * rows this call actually won may be notified about.
 */
const declineForLostInventory = async (shareTypeId, { exceptId = null } = {}) => {
  if (mongoose.connection.readyState !== 1) return [];
  if (!shareTypeId) return [];

  const stranded = await VisitRequest.find({
    shareTypeId,
    channel: 'app',
    status: 'pending_owner',
    ...(exceptId ? { _id: { $ne: exceptId } } : null),
  })
    .select('_id')
    .lean();

  const declined = [];

  for (const { _id } of stranded) {
    const request = await VisitRequest.findOneAndUpdate(
      { _id, status: 'pending_owner' },
      {
        $set: {
          status: 'declined',
          decidedAt: new Date(),
          decisionReason: 'INVENTORY_TAKEN',
        },
      },
      { new: true },
    );
    if (request) declined.push(request);
  }

  return declined;
};

/**
 * Settle an overdue row on the way past.
 *
 * The third enforcement layer. A read that finds a pending request whose
 * deadline has gone flips it rather than reporting a wait that ended — the
 * worker will reach it, but "reached it already" is not something a screen
 * should have to hope for.
 *
 * Notification is the WORKER's job, not this one's: a read is not an event,
 * and pushing from here would send an expiry notice at the moment somebody
 * happened to open a screen.
 */
const settleIfExpired = async (doc) => {
  if (!doc) return doc;
  if (doc.status !== 'pending_owner') return doc;
  if (!doc.expiresAt || new Date(doc.expiresAt).getTime() > Date.now()) return doc;

  const settled = await VisitRequest.findOneAndUpdate(
    { _id: doc._id, status: 'pending_owner', expiresAt: { $lte: new Date() } },
    { $set: { status: 'expired', decidedAt: new Date(), decisionReason: 'NO_ANSWER' } },
    { new: true },
  );

  return settled || VisitRequest.findById(doc._id);
};

module.exports = {
  StayRequestError,
  deadlineFrom,
  createStayRequest,
  accept,
  acceptAndBook,
  decline,
  withdraw,
  confirmMoveIn,
  expireDue,
  declineForLostInventory,
  settleIfExpired,
};
