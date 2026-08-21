const mongoose = require('mongoose');

// ── 1. Bookings ─────────────────────────────────────────────────────────────
const partnerBookingSchema = new mongoose.Schema(
  {
    partnerPhoneDigits: { type: String, required: true, index: true },

    /*
     * Who this booking belongs to on the CUSTOMER side.
     *
     * The row was owner-scoped only — `partnerPhoneDigits` and a `guestPhone`
     * string — which meant the student it is about had no way to read their own
     * booking. Everything the owner does after confirmation (check in, check
     * out, cancel) landed here and stopped, so the customer app could only ever
     * show them a request that had gone quiet.
     *
     * `customerId`, not the phone, for the reason `stayRequest.service.js`
     * already gives about withdrawals: a phone is a string anybody can send,
     * and it changes. `guestPhone` stays as the human-readable contact and as
     * the only join available for a booking an owner keyed in by hand.
     *
     * Null on `source: 'manual'` bookings — an owner adding a walk-in has no
     * customer account to point at, and that is a real state rather than
     * missing data.
     */
    customerId: { type: String, default: null, index: true },
    /* The `VisitRequest` this came from, when it came from one. Lets either
       side walk between the request and the booking without a phone match. */
    requestId: { type: String, default: null, index: true },

    propertyId: { type: String, required: true, index: true },
    propertyName: { type: String, required: true },
    guestName: { type: String, required: true },
    guestPhone: { type: String, required: true },
    guestEmail: { type: String, default: '' },
    roomNumber: { type: String, required: true },
    shareType: { type: String, default: 'Single' },
    checkInDate: { type: String, required: true },
    /*
     * Empty means open-ended, and that is a real answer rather than missing
     * data. A PG stay is ordinarily open-ended at move-in: the Add Customer
     * form asks for a date because a walk-in owner usually has one in mind,
     * and a request accepted from the User App often does not.
     *
     * '' is "not set yet", never a placeholder date. The real end of a stay
     * is `checkOutBooking` — an owner action — not this field.
     */
    checkOutDate: { type: String, default: '' },
    status: {
      type: String,
      enum: ['in_house', 'arriving', 'departing', 'upcoming', 'completed', 'cancelled'],
      default: 'in_house',
    },
    totalAmount: { type: Number, required: true },
    paidAmount: { type: Number, required: true },
    notes: { type: String, default: '' },

    /* Free text as the owner typed it — "2 adults", "family of 4". The form
       asks for a description rather than a count, so storing a number here
       would be the app inventing precision the owner never gave. */
    guestsLabel: { type: String, default: '' },

    /**
     * Who this record came from.
     *
     * `request` — an accepted visit request, where the customer proved their
     *   own number through the User App.
     * `manual`  — the owner typing in a walk-in on the Add Customer form.
     *
     * Worth distinguishing because the KYC below is only ever collected on the
     * manual path, and because a dispute months later turns on whether the
     * guest or the owner entered these details.
     */
    source: { type: String, enum: ['request', 'manual'], default: 'request', index: true },

    /*
     * The entry PIN, copied here from the request that created this booking.
     *
     * Denormalised on purpose. This row IS what an owner opens at check-in —
     * they are standing in a doorway, not navigating back through a request
     * they answered three weeks ago — and making that screen join back to
     * `visitrequests` to find the code would be a lookup at exactly the
     * moment somebody is waiting.
     *
     * It never changes after it is written, so the usual objection to copying
     * a value does not apply: there is nothing for the two to drift about.
     * Null on a manual walk-in, which has no request and no code.
     */
    entryPin: { type: String, default: null },

    /*
     * Moving in takes two confirmations, in this order.
     *
     * They are standing in the same room comparing a PIN, and each marks it
     * from their own phone: the OWNER first, because they are the one who
     * checked the code and let somebody through a door, then the STUDENT,
     * confirming they are actually in it.
     *
     * Two timestamps rather than a third status value. `status` stays the
     * booking's lifecycle — `upcoming` until both are in, `in_house` after —
     * and these record who said so and when, which is the part a dispute
     * turns on. A single "moved in" flag could not tell you whether the
     * student ever agreed.
     *
     * The student's is refused while the owner's is null. Not because the
     * order matters to the database, but because it matters at the door: the
     * owner is the one with the code to check, and a student who could mark
     * themselves in before anybody let them in has marked nothing.
     */
    movedInByOwnerAt: { type: Date, default: null },
    movedInByStudentAt: { type: Date, default: null },

    /**
     * Identity, collected only on the manual path.
     *
     * `documents` is a physical checklist, not a digital archive — a name the
     * owner typed (Aadhar card, PAN, Voter ID, whatever the guest actually
     * produced) and whether they have genuinely seen it. This replaced an
     * Aadhar number plus a Cloudinary photograph: nothing here uploads an
     * image, so there is no scan of anyone's ID sitting on a CDN to protect
     * or to delete.
     *
     * `verifiedAt` is set ONLY by the server, and only after a code sent to
     * `verifiedPhone` came back correct. The client cannot assert it: an owner
     * marking their own walk-in as "verified" is exactly the claim this field
     * exists to make trustworthy. This is unrelated to `documents` — proving a
     * phone number and confirming physical ID are two different checks, and
     * this schema keeps them that way.
     */
    kyc: {
      address: { type: String, default: '' },
      documents: {
        type: [
          {
            _id: false,
            name: { type: String, required: true },
            collected: { type: Boolean, default: false },
          },
        ],
        default: [],
      },
      verifiedAt: { type: Date, default: null },
      verifiedPhone: { type: String, default: '' },
    },
  },
  { timestamps: true }
);

// ── 2. Payouts & Payment Methods ────────────────────────────────────────────
const partnerPayoutSchema = new mongoose.Schema(
  {
    partnerPhoneDigits: { type: String, required: true, index: true },
    amount: { type: Number, required: true },
    status: {
      type: String,
      enum: ['completed', 'processing', 'pending', 'failed'],
      default: 'completed',
    },
    payoutDate: { type: String, required: true },
    bankAccount: { type: String, required: true },
    referenceId: { type: String, required: true },
    breakdown: {
      rent: { type: Number, default: 0 },
      platformFee: { type: Number, default: 0 },
      taxes: { type: Number, default: 0 },
      netAmount: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

const partnerPaymentMethodSchema = new mongoose.Schema(
  {
    partnerPhoneDigits: { type: String, required: true, index: true },
    type: { type: String, enum: ['upi', 'bank_account'], required: true },
    accountName: { type: String, required: true },
    accountNumber: { type: String, default: '' },
    ifsc: { type: String, default: '' },
    upiId: { type: String, default: '' },
    isPrimary: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// ── 3. Complaints / Support ─────────────────────────────────────────────────
const partnerComplaintSchema = new mongoose.Schema(
  {
    partnerPhoneDigits: { type: String, required: true, index: true },
    propertyId: { type: String, required: true },
    propertyName: { type: String, required: true },
    title: { type: String, required: true },
    category: { type: String, required: true },
    status: { type: String, enum: ['open', 'in_progress', 'resolved', 'closed'], default: 'open' },
    priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
    description: { type: String, required: true },
    responses: [
      {
        sender: { type: String, required: true },
        message: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

// ── 4. Notifications ────────────────────────────────────────────────────────
const partnerNotificationSchema = new mongoose.Schema(
  {
    partnerPhoneDigits: { type: String, required: true, index: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    category: { type: String, default: 'general' },
    read: { type: Boolean, default: false },

    /*
     * What this notification is ABOUT, so tapping it can go there.
     *
     * Without it a row is a dead end: the owner reads "Sunand asked about
     * Apex Luxury Girls — you have 3 minutes to answer", taps it, and lands
     * nowhere. On a three-minute deadline that is not a missing nicety, it is
     * the notification failing at the one job it has.
     *
     * Null on rows that genuinely point at nothing.
     */
    requestId: { type: String, default: null },
  },
  { timestamps: true }
);

// ── 5. Staff ────────────────────────────────────────────────────────────────
const partnerStaffSchema = new mongoose.Schema(
  {
    partnerPhoneDigits: { type: String, required: true, index: true },
    name: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, default: '' },
    role: { type: String, required: true },
    permissions: [{ type: String }],
    status: { type: String, enum: ['active', 'invited', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

// ── 6. Reviews ──────────────────────────────────────────────────────────────
const partnerReviewSchema = new mongoose.Schema(
  {
    partnerPhoneDigits: { type: String, required: true, index: true },
    propertyId: { type: String, required: true },
    propertyName: { type: String, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    author: { type: String, required: true },
    comment: { type: String, required: true },
    date: { type: String, required: true },
  },
  { timestamps: true }
);

// ── 7. Referrals ────────────────────────────────────────────────────────────
const partnerReferralSchema = new mongoose.Schema(
  {
    partnerPhoneDigits: { type: String, required: true, unique: true, index: true },
    code: { type: String, required: true },
    points: { type: Number, default: 0 },
    earningsRupees: { type: Number, default: 0 },
    invitedCount: { type: Number, default: 0 },
    history: [
      {
        name: { type: String, required: true },
        date: { type: String, required: true },
        status: { type: String, default: 'Joined' },
        rewardPoints: { type: Number, default: 100 },
        /* 'owner' — another owner joined through this partner's refer-a-
           partner code. 'customer' — a guest joined the User App through one
           of this partner's invite codes. See customerReferral.controller.js
           for the second kind; nothing in this codebase writes the first yet. */
        type: { type: String, enum: ['owner', 'customer'], default: 'owner' },
        /* Only ever set on a 'customer' entry — which property the guest was
           invited through, so the row can read "via Sunrise PG". */
        propertyName: { type: String, default: '' },
      },
    ],
  },
  { timestamps: true }
);

/* ── 8. Share Types / Inventory ──────────────────────────────────────────────
   One row per property per sharing option, and the only place a bed count
   lives. `availableBeds` is claimed and released by atomic conditional updates
   in `modules/inventory/inventory.service.js` — nothing else may touch it, and
   nothing else may read it as authoritative. */
const partnerShareTypeSchema = new mongoose.Schema(
  {
    partnerPhoneDigits: { type: String, required: true, index: true },
    propertyId: { type: String, required: true, index: true },
    /* `${propertyId}:${slugged-label}` — stable across re-syncs, so a request
       can carry it and still find its row after the property is edited. The
       row's own `_id` is not stable in that way and must not be used as a
       handle. Unique because a duplicate would split one room type's beds
       across two counters and neither would ever read as full. */
    shareTypeId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    monthlyPrice: { type: Number, required: true },
    /* Capacity, mirrored from the property's own `categoryDetails`. */
    totalBeds: { type: Number, required: true, min: 0 },
    /* Availability. Never set directly outside the inventory service. */
    availableBeds: { type: Number, required: true, min: 0 },
    /* The owner's master switch for this room type. Checked when a request is
       CREATED, deliberately not when one is accepted — pausing a room type
       stops new askers, it does not strand a request mid-decision. */
    isAvailable: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = {
  PartnerBooking: mongoose.models.PartnerBooking || mongoose.model('PartnerBooking', partnerBookingSchema, 'partner_bookings'),
  PartnerPayout: mongoose.models.PartnerPayout || mongoose.model('PartnerPayout', partnerPayoutSchema, 'partner_payouts'),
  PartnerPaymentMethod: mongoose.models.PartnerPaymentMethod || mongoose.model('PartnerPaymentMethod', partnerPaymentMethodSchema, 'partner_payment_methods'),
  PartnerComplaint: mongoose.models.PartnerComplaint || mongoose.model('PartnerComplaint', partnerComplaintSchema, 'partner_complaints'),
  PartnerNotification: mongoose.models.PartnerNotification || mongoose.model('PartnerNotification', partnerNotificationSchema, 'partner_notifications'),
  PartnerStaff: mongoose.models.PartnerStaff || mongoose.model('PartnerStaff', partnerStaffSchema, 'partner_staff'),
  PartnerReview: mongoose.models.PartnerReview || mongoose.model('PartnerReview', partnerReviewSchema, 'partner_reviews'),
  PartnerReferral: mongoose.models.PartnerReferral || mongoose.model('PartnerReferral', partnerReferralSchema, 'partner_referrals'),
  PartnerShareType: mongoose.models.PartnerShareType || mongoose.model('PartnerShareType', partnerShareTypeSchema, 'partner_share_types'),
};
