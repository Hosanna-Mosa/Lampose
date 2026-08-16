/* ══════════════════════════════════════════════════════════════════════════
   A customer asking an owner whether a property is free to visit.

   Its own collection. `properties` is written by the onboarding flow (v1) and
   only ever read by this one — nothing here touches it.

   This is the AVAILABILITY workflow, and it is separate from the property
   VERIFICATION workflow in models/VerificationRequest.js. They share a Twilio
   number and a webhook, and nothing else:

     verification   owner/verifier replies YES or NO      → VerificationRequest
     availability   owner replies AVAILABLE               → this model

   Lifecycle, a straight line with three ends:

     otp_pending ──code verified──► pending_owner ──┬──► confirmed
                                                    ├──► declined
                                                    └──► expired  (24h, no reply)

   A row that never leaves `otp_pending` is an abandoned form. It holds no
   verified contact detail and nobody was messaged, so it is disposable and a
   TTL index clears it.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const STATUSES = ['otp_pending', 'pending_owner', 'confirmed', 'declined', 'expired'];
const TERMINAL = ['confirmed', 'declined', 'expired'];

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

/* Abandoned forms clear themselves an hour after the code dies. Only
   otp_pending rows carry `otp.expiresAt`, so nothing that reached an owner is
   ever caught by this. */
visitRequestSchema.index(
  { 'otp.expiresAt': 1 },
  { expireAfterSeconds: 3600, partialFilterExpression: { status: 'otp_pending' } },
);

/** What the browser is allowed to see. The owner's number is not in it. */
visitRequestSchema.methods.toPublic = function toPublic() {
  return {
    id: String(this._id),
    listingId: this.listingId,
    propertyName: this.propertyName,
    status: this.status,
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
    decidedAt: this.decidedAt,
    expiresAt: this.expiresAt,
  };
};

const VisitRequest = mongoose.models.VisitRequest
  || mongoose.model('VisitRequest', visitRequestSchema);

module.exports = VisitRequest;
module.exports.STATUSES = STATUSES;
module.exports.TERMINAL = TERMINAL;
