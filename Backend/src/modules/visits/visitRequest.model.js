/* ══════════════════════════════════════════════════════════════════════════
   A customer asking an owner whether a property is free to visit.

   Its own collection. `properties` is written by the onboarding flow (v1) and
   only ever read by this one — nothing here touches it.

   This is the AVAILABILITY workflow, and it is separate from the property
   VERIFICATION workflow in models/VerificationRequest.js. They share a Twilio
   number and a webhook, and nothing else:

     verification   owner/verifier replies YES or NO      → VerificationRequest
     availability   owner replies AVAILABLE               → this model

   ## Two channels, one collection

   The same act — somebody asking an owner about a bed — arrives two ways, and
   they are told apart by `channel` rather than by which fields happen to be
   filled in:

     web   a GUEST on lampose.com. No account, so their phone can only be
           proved here: a code is texted, and only a correct one causes the
           owner to be messaged on WhatsApp. They get 24 hours to reply.

     app   a SIGNED-IN student in the User App, whose phone was proved at
           sign-in, asking an owner who is signed into the Stay Partner app.
           No code, no WhatsApp, and minutes rather than a day — the owner is
           holding the phone that just buzzed.

   One collection because it is one fact about the business, and because the
   owner's request feed, the alerts inbox and the admin routes already read
   this one. Two collections would mean every reader learning to merge them.

   Lifecycle. `otp_pending` is reachable only on the web channel; `cancelled`
   only on the app channel, because a guest has no session to withdraw from:

     [web]  otp_pending ──code verified──► pending_owner ──┬──► confirmed
                                                           ├──► declined
     [app]  (created already verified) ───► pending_owner ─┤    └► expired
                                                           └──► cancelled

   A row that never leaves `otp_pending` is an abandoned form. It holds no
   verified contact detail and nobody was messaged, so it is disposable and a
   TTL index clears it.

   ## Every exit from `pending_owner` is a guarded update

   Four actors can write to a pending request — the owner accepting, the owner
   declining, the student withdrawing, and the expiry worker — and any two can
   arrive in the same millisecond. None of them may read-then-write. See
   `stayRequest.service.js`: the filter is the guard, and the first valid
   commit wins.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const STATUSES = ['otp_pending', 'pending_owner', 'confirmed', 'declined', 'expired', 'cancelled'];
const TERMINAL = ['confirmed', 'declined', 'expired', 'cancelled'];

/** The channels, named so a caller never writes the string by hand. */
const CHANNELS = ['web', 'app'];

/**
 * Why a request ended, where the status alone does not say.
 *
 * `INVENTORY_TAKEN` is the one that earns its keep: it is a decline the owner
 * never made — the last bed went to somebody else while this student waited —
 * and telling them "the owner declined you" for it would be false. The app
 * says "this was taken while you were waiting" instead.
 */
const DECISION_REASONS = ['OWNER_DECLINED', 'INVENTORY_TAKEN', 'NO_ANSWER', 'STUDENT_WITHDREW'];

const visitRequestSchema = new mongoose.Schema(
  {
    /* A snapshot, not a populated reference: a property can be edited or
       removed after the request is made, and the request still has to say
       what was actually asked about. `listingId` is kept as a string for the
       same reason — it must survive the document it points at. */
    listingId: { type: String, required: true, index: true },
    propertyName: { type: String, required: true },
    ownerName: { type: String, default: 'Property Owner' },
    ownerMobile: { type: String, required: true, index: true }, // E.164

    customer: {
      name: { type: String, required: true, trim: true },
      phone: { type: String, required: true, index: true },     // E.164
      email: { type: String, required: true, trim: true, lowercase: true },
    },

    /* When they would like to come, as free text. Kept for the clients that
       were written against them before the structured intent below existed —
       a request carrying only these is still valid and still readable. */
    preferredDate: { type: String, default: null, trim: true },
    preferredTime: { type: String, default: null, trim: true },

    /* The structured intent: what the customer actually asked for.
       Every figure here is re-derived from the property by
       utils/stayIntent.validateIntent — nothing priced is taken from the
       request body, so a crafted payload cannot put a number in front of the
       owner that the page never showed.

       All optional. Requests made before this existed, and the simple
       sharing-only path, carry nulls rather than being rejected. */
    intent: {
      stayType: { type: String, enum: ['short', 'long', null], default: null },
      duration: { type: Number, default: null },
      durationUnit: { type: String, enum: ['days', 'months', null], default: null },
      // YYYY-MM-DD. A date-only string, so no timezone can move it.
      joiningDate: { type: String, default: null },

      /* Hotels only. `joiningDate` carries the check-in as well, because
         everything downstream reads that one — these are here so the owner's
         message and the booking can say "3 nights, the 14th to the 17th"
         rather than making somebody count. */
      checkIn: { type: String, default: null },
      checkOut: { type: String, default: null },
      /* Which of the three structures the guest is buying — a hostel sells
         the same bed by the night, the month and the hour. */
      rateStructure: { type: String, enum: ['nightly', 'monthly', 'flexible', null], default: null },
      /* How much of it — nights, months or hours, per the structure. Read off
         the dates for a nightly stay and asked for the other two. */
      rateQuantity: { type: Number, default: null },
      rateQuantityUnit: { type: String, enum: ['nights', 'months', 'hours', null], default: null },
      flexibleJoin: { type: Boolean, default: false },

      // Snapshots, so the request still reads correctly if the owner reprices.
      rateAmount: { type: Number, default: null },
      rateUnit: { type: String, enum: ['day', 'month', null], default: null },
      totalAmount: { type: Number, default: null },
      proratedFirstMonth: {
        amount: { type: Number, default: null },
        daysCharged: { type: Number, default: null },
        daysInMonth: { type: Number, default: null },
        full: { type: Boolean, default: null },
      },
    },

    /* ── The visit token ──────────────────────────────────────────────
       Bachelor and co-live only. The owner accepts first; the student then
       pays a small token, and only after that are they asked for a joining
       date and given the street address.

       A subdocument rather than a status, because the request IS confirmed —
       the owner said yes. What is outstanding is the money, and conflating
       the two would make an unpaid request look unanswered to the owner who
       already answered it. */
    payment: {
      /* Decided at creation from the category, and frozen: changing the
         category of a live listing must not retroactively make a paid
         request unpaid, or an unpaid one free. */
      required: { type: Boolean, default: false },
      status: {
        type: String,
        enum: ['not_required', 'pending', 'paid', 'failed', 'expired'],
        default: 'not_required',
      },
      /* Paise. The only unit Razorpay accepts, and a snapshot — a later
         change to the platform token must not reprice a request already
         made. */
      amountPaise: { type: Number, default: null },
      /* Razorpay's ids. `orderId` is ours to create, `paymentId` is theirs. */
      orderId: { type: String, default: null },
      paymentId: { type: String, default: null },
      /* Set only after the HMAC over `orderId|paymentId` verified against our
         own secret. Its presence IS the proof — never a client's word. */
      verifiedAt: { type: Date, default: null },
      /* When the owner accepted plus the window. Past it, a request stops
         holding the layout. */
      dueBy: { type: Date, default: null },
      failureReason: { type: String, default: '' },
      /* The shareable Razorpay link sent to the customer on WhatsApp, and its
         id — the webhook reports the link, not the order. */
      linkId: { type: String, default: null },
      linkUrl: { type: String, default: null },
    },

    /* Released once the token is paid — before that a student has the area
       and not the door. */
    addressReleasedAt: { type: Date, default: null },

    /* Evidence that the Privacy Policy and Terms were accepted, and when. */
    consentedTerms: { type: Boolean, default: false },
    consentedTermsAt: { type: Date, default: null },

    /* Which occupancy was asked about, resolved against the property rather
       than taken on trust, and snapshotted with the price shown at the time —
       the owner may change it before replying, and the question they are
       answering is the one that was actually put. See utils/sharing.js. */
    sharing: {
      label: { type: String, default: null },
      price: { type: Number, default: null },
    },

    /* Meta requires recorded opt-in before a business message reaches someone
       who has not written first, so the tick box is evidence and is kept. */
    consentWhatsApp: { type: Boolean, default: false },
    consentAt: { type: Date, default: null },

    status: { type: String, enum: STATUSES, default: 'otp_pending', index: true },

    /* ── The app channel ─────────────────────────────────────────────────
       Everything below is null on a web request and is what makes an app
       request answerable in the Stay Partner app rather than on WhatsApp. */

    /* Which flow this row belongs to. Defaulted to `web` so every one of the
       rows written before this field existed keeps its meaning — they were
       all guests on lampose.com, and a default of `app` would put them in
       front of owners in a feed that expects a three-minute deadline. */
    channel: { type: String, enum: CHANNELS, default: 'web', index: true },

    /* The student's own account. A web request has no session and no id — the
       phone is all there is, which is why the alerts inbox matches on it. An
       app request has both, and the id is what authorises reading and
       withdrawing: a phone number can be typed by anybody. */
    customerId: { type: String, default: null, index: true },

    /* Which bed pool this claims from — `${propertyId}:${slug}`. Not the
       sharing LABEL, which is a display string an owner may rename: the id
       survives the rename, and it is what `claimBed` filters on. */
    shareTypeId: { type: String, default: null, index: true },

    /*
     * When the owner was actually reached, and when they actually looked.
     *
     * These exist so the student's waiting screen can show STAGES rather than
     * one undifferentiated wait — and so those stages are true. The website's
     * version of this screen invented "Delivered to Ramesh" and "Ramesh opened
     * it" out of nothing, which is why they were removed. These are the same
     * two ideas, recorded rather than imagined:
     *
     *   notifiedAt  the push was accepted by the gateway, or an inbox row was
     *               written. Not "delivered to the handset" — nobody can know
     *               that — so the copy says the owner was notified, not that
     *               they received anything.
     *
     *   seenAt      the owner opened THIS request in their app. A real event
     *               with a real timestamp, and the single most reassuring
     *               thing a waiting student can be told.
     *
     * Both null on the web channel, where neither event exists.
     */
    notifiedAt: { type: Date, default: null },
    seenAt: { type: Date, default: null },

    /* The partner who answered, by `partnerId`. Recorded because a property
       may be run by more than one person over its life, and "who said yes to
       this student" is the question a dispute turns on. */
    decidedBy: { type: String, default: null },

    /* Why it ended. See DECISION_REASONS — the status alone cannot tell a
       decline the owner made from one the inventory forced. */
    decisionReason: { type: String, enum: [...DECISION_REASONS, null], default: null },

    /* The owner's own words from the reject sheet, where they gave any.
       Kept apart from `decisionReason`, which is a machine's word. */
    declineNote: { type: String, default: null, trim: true },

    /* Withdrawal. `cancelledBy` is a string rather than a boolean because a
       request could later be cancelled by support or by the property being
       delisted, and a boolean would have to be re-read as "cancelled by
       somebody" the first time that happened. */
    cancelledAt: { type: Date, default: null },
    cancelledBy: { type: String, enum: ['student', 'system', null], default: null },
    /* Counts against `booking.maxWithdrawalsPerRequest`. Today the state
       machine caps it at one for free — a withdrawal is terminal — so this is
       evidence rather than enforcement. */
    withdrawals: { type: Number, default: 0 },

    /* The booking row an acceptance produced, so the two can be found from
       each other without a scan. Null until an owner accepts. */
    bookingId: { type: String, default: null },

    /* The code is never stored — see utils/otp.js. */
    otp: {
      hash: { type: String, default: null },
      salt: { type: String, default: null },
      expiresAt: { type: Date, default: null },
      attempts: { type: Number, default: 0 },
      resends: { type: Number, default: 0 },
      lastSentAt: { type: Date, default: null },
      // The SMS gateway's campaign id — the handle a delivery report needs.
      campId: { type: String, default: null },
    },
    phoneVerifiedAt: { type: Date, default: null },

    /* The entry PIN, issued only when the owner confirms the visit.
       Unlike the one-time code above this one IS stored in readable form,
       and deliberately: it is not a credential that proves identity to the
       server, it is a shared token the two of them compare at the door.
       Both sides are sent the same value, so there is nothing to verify
       against a hash — and the owner must be able to be told it again if
       they lose the message. */
    entryPin: { type: String, default: null },
    entryPinIssuedAt: { type: Date, default: null },

    ownerMessageSid: { type: String, default: null },
    customerMessageSid: { type: String, default: null },
    ownerReplyRaw: { type: String, default: null },

    decidedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null, index: true },

    // Kept for rate limiting and abuse investigation only.
    requestIp: { type: String, default: null },
  },
  { timestamps: true, collection: 'visitrequests' },
);

/* Finding the request an inbound AVAILABLE belongs to when the reply carries
   no payload: newest still-open request from that number. */
visitRequestSchema.index({ ownerMobile: 1, status: 1, createdAt: -1 });

/* The expiry worker's only query, running every few seconds forever: which
   app requests are pending and past their deadline. Without this index it is
   a collection scan on a timer, which is fine at fourteen rows and is the
   whole database's IO budget at a million. */
visitRequestSchema.index({ channel: 1, status: 1, expiresAt: 1 });

/* The student's own requests, newest first — the alerts inbox and the "do I
   already have one open on this listing" check at creation. */
visitRequestSchema.index({ customerId: 1, createdAt: -1 });

/* Abandoned forms clear themselves an hour after the code dies. Only
   otp_pending rows carry `otp.expiresAt`, so nothing that reached an owner is
   ever caught by this. */
visitRequestSchema.index(
  { 'otp.expiresAt': 1 },
  { expireAfterSeconds: 3600, partialFilterExpression: { status: 'otp_pending' } },
);

/**
 * Seconds left on a request, or zero once it is over.
 *
 * The status is part of the answer, not just the deadline. A request that was
 * cancelled, declined or accepted a moment after it was made still has a
 * future `expiresAt` — computing from that alone reported a live countdown on
 * a request nobody was waiting for any more, and both apps render this
 * directly.
 *
 * Zero rather than null for a finished request: null means "there is no
 * deadline here", which is true of a web request that never reached an owner
 * and is not true of one that ended. A client can tell them apart.
 */
const secondsLeft = (doc) => {
  if (!doc.expiresAt) return null;
  if (doc.status !== 'pending_owner') return 0;
  return Math.max(0, Math.round((new Date(doc.expiresAt).getTime() - Date.now()) / 1000));
};

/** What the browser is allowed to see. The owner's number is not in it. */
visitRequestSchema.methods.toPublic = function toPublic() {
  return {
    id: String(this._id),
    listingId: this.listingId,
    propertyName: this.propertyName,
    status: this.status,

    /*
     * What the person waiting is being asked for next.
     *
     * `required` is the category's answer and `status` is where this request
     * has got to, so a client can tell "no token needed" apart from "not paid
     * yet" without knowing the category rules. The amount travels so the
     * button can name the figure rather than assume it.
     */
    payment: this.payment?.required
      ? {
        required: true,
        status: this.payment.status,
        amountPaise: this.payment.amountPaise || null,
        /* The shareable Razorpay link, so the app can open it rather than
           carrying a native SDK. Null until the owner accepts. */
        linkUrl: this.payment.linkUrl || null,
        dueBy: this.payment.dueBy ? this.payment.dueBy.toISOString() : null,
        paidAt: this.payment.verifiedAt ? this.payment.verifiedAt.toISOString() : null,
      }
      : { required: false, status: 'not_required', amountPaise: null, dueBy: null, paidAt: null },

    /* Released by the payment, not by asking. Null until then, so a client
       cannot render a door number it was never given. */
    addressReleasedAt: this.addressReleasedAt ? this.addressReleasedAt.toISOString() : null,
    customerName: (this.customer && this.customer.name) || '',
    preferredDate: this.preferredDate || null,
    preferredTime: this.preferredTime || null,
    intent: this.intent && (this.intent.stayType || this.intent.joiningDate)
      ? {
        stayType: this.intent.stayType || null,
        duration: this.intent.duration || null,
        durationUnit: this.intent.durationUnit || null,
        joiningDate: this.intent.joiningDate || null,
        flexibleJoin: this.intent.flexibleJoin === true,
        rateAmount: this.intent.rateAmount || null,
        rateUnit: this.intent.rateUnit || null,
        totalAmount: this.intent.totalAmount || null,
        proratedFirstMonth: this.intent.proratedFirstMonth
          && this.intent.proratedFirstMonth.amount
          ? this.intent.proratedFirstMonth
          : null,
      }
      : null,
    sharing: this.sharing && this.sharing.label
      ? { label: this.sharing.label, price: this.sharing.price || null }
      : null,
    createdAt: this.createdAt,
    /* When the customer's own code came back correct — and therefore when
       the owner was messaged, which happens in the same request.
       Projected because the client draws a progress trail from it, and
       without it the "your number is confirmed" step can only be inferred
       from `status` no longer being otp_pending. It is the requester's own
       timestamp about their own phone; nothing here belongs to anyone else. */
    phoneVerifiedAt: this.phoneVerifiedAt || null,
    decidedAt: this.decidedAt,
    expiresAt: this.expiresAt,

    /* ── The app channel ─────────────────────────────────────────────────
       Absent on a web request, and the app reads them all. */
    channel: this.channel || 'web',
    shareTypeId: this.shareTypeId || null,

    /* The stages the waiting screen draws. Null means "has not happened",
       never "we are not sure" — a screen must be able to tell those apart. */
    notifiedAt: this.notifiedAt || null,
    seenAt: this.seenAt || null,

    /* Why it ended, so the screen can tell "the owner declined" from "the
       last bed went while you waited" — different sentences, different
       buttons, and only one of them worth taking personally. */
    decisionReason: this.decisionReason || null,

    cancelledAt: this.cancelledAt || null,

    /* Where the student goes next once an owner has said yes. Null until
       then, which is also how the screen knows not to offer the button. */
    bookingId: this.bookingId || null,

    /*
     * The PIN both sides read out at the door.
     *
     * Sent to the student AND the owner — that is the whole point of it, and
     * why it is stored readable. Null until an owner confirms, so a screen
     * showing it is a screen showing a confirmed request.
     */
    entryPin: this.entryPin || null,
    entryPinIssuedAt: this.entryPinIssuedAt || null,

    /*
     * The server's own clock, sent with every read.
     *
     * The countdown on both apps is `expiresAt - now`, and a phone's `now` is
     * not trustworthy — a device thirty seconds out shows a visibly wrong
     * timer on a three-minute window, and one set to next week shows an
     * expired request that is still live. The client computes an offset from
     * this once and measures ELAPSED time locally, which phones are reliable
     * at, rather than asking them what time it is.
     */
    serverNow: new Date().toISOString(),

    /* Convenience, and a second answer to the same question — a client that
       ignores `serverNow` still cannot get this wrong. Floored at zero: a
       negative countdown is not a thing anybody should have to render. */
    secondsRemaining: secondsLeft(this),
  };
};

/**
 * The owner's half. A different question entirely.
 *
 * `toPublic` above answers "what is happening to my request" for the person
 * who made it. This answers "who is asking, for what, and how long have I
 * got" — so it carries the student's name and number, which the public shape
 * must never do, and omits nothing the Stay Partner screen renders.
 *
 * Kept beside the public shape rather than in the partner module so the two
 * are edited together: a field added to one is a decision about the other.
 */
visitRequestSchema.methods.toOwner = function toOwner() {
  return {
    id: String(this._id),
    status: this.status,
    channel: this.channel || 'web',
    listingId: this.listingId,
    propertyName: this.propertyName,
    shareTypeId: this.shareTypeId || null,

    customer: {
      name: (this.customer && this.customer.name) || '',
      phone: (this.customer && this.customer.phone) || '',
      email: (this.customer && this.customer.email) || '',
    },

    sharing: this.sharing && this.sharing.label
      ? { label: this.sharing.label, price: this.sharing.price || null }
      : null,

    intent: this.intent && (this.intent.stayType || this.intent.joiningDate)
      ? {
        stayType: this.intent.stayType || null,
        duration: this.intent.duration || null,
        durationUnit: this.intent.durationUnit || null,
        joiningDate: this.intent.joiningDate || null,
        flexibleJoin: this.intent.flexibleJoin === true,
        rateAmount: this.intent.rateAmount || null,
        rateUnit: this.intent.rateUnit || null,
        totalAmount: this.intent.totalAmount || null,
      }
      : null,

    preferredDate: this.preferredDate || null,
    preferredTime: this.preferredTime || null,

    createdAt: this.createdAt,
    notifiedAt: this.notifiedAt || null,
    seenAt: this.seenAt || null,
    expiresAt: this.expiresAt,
    decidedAt: this.decidedAt,
    decisionReason: this.decisionReason || null,
    cancelledAt: this.cancelledAt || null,
    bookingId: this.bookingId || null,

    /* The same value the student holds. An owner who cannot be shown it again
       cannot check anybody in. */
    entryPin: this.entryPin || null,
    entryPinIssuedAt: this.entryPinIssuedAt || null,

    /* Same reasoning as the public shape — the owner's countdown must not
       depend on the owner's device clock either. */
    serverNow: new Date().toISOString(),
    secondsRemaining: secondsLeft(this),

    /* One flag rather than four comparisons repeated in the app. A button
       that stays enabled on a terminal request is the bug this prevents. */
    actionable: this.status === 'pending_owner'
      && Boolean(this.expiresAt)
      && new Date(this.expiresAt).getTime() > Date.now(),
  };
};

const VisitRequest = mongoose.models.VisitRequest
  || mongoose.model('VisitRequest', visitRequestSchema);

module.exports = VisitRequest;
module.exports.STATUSES = STATUSES;
module.exports.TERMINAL = TERMINAL;
module.exports.CHANNELS = CHANNELS;
module.exports.DECISION_REASONS = DECISION_REASONS;
