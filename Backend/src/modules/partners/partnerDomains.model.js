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
    /*
     * The property's category AT THE TIME OF BOOKING, mirrored rather than
     * looked up — the same reasoning as `propertyName` and `shareType` just
     * above: an owner recategorising a live listing later must not silently
     * relabel a booking already made under the old one. `forOwner()` spreads
     * this straight through with no whitelist, which is what lets the app
     * gate bachelor-only UI (no owner-messaging or cancel-via-app on a
     * category Lampose does not manage post-move-in) without a second call.
     * Optional and defaulted to '' — every booking written before this field
     * existed reads as "unknown category" rather than failing validation.
     */
    category: { type: String, default: '' },
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

    /*
     * ── Our commission, collected OFF the platform ────────────────────
     *
     * For PG/Hostel and Co-living only, and it is a NOTE rather than a
     * transaction. No money passes through Lampose on those two categories —
     * the student pays the owner directly — so there is nothing here to
     * split, hold or pay out. What there is, is a phone call: once the owner
     * has accepted and the student has moved in, somebody rings them and
     * collects our percentage.
     *
     * This records that the call happened and what came of it, so the admin
     * Monitor can show which confirmed bookings still owe us and nobody rings
     * the same owner twice.
     *
     * ## Why the amount is typed by a person
     *
     * Everywhere money moves in this system, an amount from a client is
     * refused and the server computes it — see `hotelSettlement.model.js`.
     * The opposite is right here, and the difference is that nothing is
     * PAID from this figure. It is a record of cash already collected, and
     * there is no server-side number to check it against: Lampose is never
     * told what rent the student and the owner actually agreed, so any
     * "expected" figure would be a guess against the listing's asking price.
     *
     * The listed rent is shown beside it in the console as a reference. The
     * typed number is the fact.
     *
     * A HOTEL booking never uses this. Its commission is deducted before the
     * owner is ever paid — see `hotel_settlements`.
     */
    commission: {
      collected: { type: Boolean, default: false },
      /* Paise, like every other amount in this system. Rupees are display. */
      amountPaise: { type: Number, default: null },
      /* What was agreed, where somebody recorded it. Free-form on purpose:
         these are negotiated per owner and there is no platform rate. */
      percent: { type: Number, default: null },
      collectedAt: { type: Date, default: null },
      /* Which administrator recorded it. The fuller record — including what
         it was before — is in `admin_audit_log`. */
      collectedByAdminId: { type: String, default: null },
      note: { type: String, default: '' },
    },

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

    /*
     * Why a cancelled booking was cancelled, as the owner said it.
     *
     * The Stay Partner app has always REQUIRED a reason before enabling its
     * Cancel button — "Property unavailable", "Maintenance issue", "Guest
     * request", "Other" — and then sent nothing, so the picker was decoration
     * and every cancellation looked identical afterwards. Stored because the
     * support call that follows one ("why was I cancelled?") has to have an
     * answer, and because a property cancelling for "Maintenance issue" four
     * times in a month is a thing worth being able to see.
     *
     * Free text on `cancelNote`, untrusted and capped by the controller. Both
     * stay null on every booking that ends any other way.
     */
    cancelReason: { type: String, default: null },
    cancelNote: { type: String, default: null },
    cancelledAt: { type: Date, default: null },
    /*
     * WHO cancelled — the owner, from the Stay Partner app, or the student,
     * from their own Cancel button. Declared here because this schema has no
     * `strict: false`: a write to a field the schema does not know about is
     * silently dropped by Mongoose rather than saved, which is exactly what
     * was happening to `customerBooking.controller.js`'s
     * `cancelledBy: 'student'` before this field existed. The User App's
     * cancelled-bookings row (`CANCELLED_BY_CUSTOMER` vs `CANCELLED_BY_OWNER`
     * in `data/bookings.ts`'s `fromRealBooking`) is what actually reads it.
     */
    cancelledBy: { type: String, enum: ['student', 'owner', null], default: null },

    /* Set once this booking's `paidAmount` has been reserved into a payout
       request — see `payout.service.js`'s `availableBalancePaise`. A
       `completed` booking with this null is money an owner can still request;
       one with this set is already spoken for, whichever of `pending`,
       `processing`, `completed` or `failed` that payout is currently in
       (a `failed` payout releases its bookings back — see `processPayout`). */
    payoutId: { type: String, default: null, index: true },

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
    /*
     * `payoutDate`, `bankAccount` and `referenceId` used to be `required` —
     * fine while nothing ever created a row, but a REQUESTED payout does not
     * have any of the three yet: there is no date until it settles, and no
     * gateway reference until RazorpayX accepts it. All three are filled in
     * by `payout.service.js`'s `processPayout` once that happens; until then
     * they read `null`, which is the honest "not yet" this status already
     * has a word for (`pending`).
     */
    payoutDate: { type: String, default: null },
    /* A masked label for display — "HDFC •••• 4821" or "ramesh@upi" — set at
       REQUEST time from the payment method the owner chose, never the full
       account number. See `payout.service.js`. */
    bankAccount: { type: String, default: null },
    /* RazorpayX's own payout id once dispatched. Distinct from `referenceId`
       below it used to be the same field for: this is THEIRS, that is OURS —
       see the note on `razorpayReferenceId`. */
    referenceId: { type: String, default: null },
    /* Ours — this row's own `_id`, sent to RazorpayX as `reference_id` and
       `X-Payout-Idempotency` so a retried dispatch lands on the SAME payout
       there rather than moving money twice. Stored so a retry can be built
       from the row alone. */
    razorpayReferenceId: { type: String, default: null },
    /* RazorpayX's contact/fund-account ids, kept so a SECOND payout to the
       same owner and method does not re-provision either — see
       `payout.service.js`'s `ensureFundAccount`. */
    razorpayContactId: { type: String, default: null },
    razorpayFundAccountId: { type: String, default: null },
    /* Why a `failed` row failed, in RazorpayX's own words — read by whoever
       has to explain it to the owner. */
    failureReason: { type: String, default: null },

    /* How many hotel settlements this payout covers, beside `bookingIds`.
       An owner's payout can be part commission-owed and part hotel money, and
       the two are counted differently — see `payout.service.js`. */
    settlementCount: { type: Number, default: 0 },

    /* Paid by a person making a bank transfer rather than by RazorpayX. The
       normal case while `PAYOUTS_MANUAL` is on. */
    paidManually: { type: Boolean, default: false },
    paidByAdminName: { type: String, default: '' },
    /* The bookings this payout's amount was drawn from, so a second request
       cannot double-count one that is already reserved here — see
       `availableBalancePaise`. */
    bookingIds: [{ type: String }],
    requestedAt: { type: Date, default: null },
    processedAt: { type: Date, default: null },
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

    /*
     * Which stay this is about, and who wrote it — the two fields that were
     * missing when this collection had a reader (`getReviews`) and no writer
     * at all. Every review now has to come from a real, completed booking:
     *
     *   `bookingId`    unique, so a student cannot leave two reviews for one
     *                  stay by tapping the prompt twice, and so the app can
     *                  ask `GET /customers/bookings/:id` "has this one been
     *                  reviewed yet" without a second collection to join.
     *   `customerId`   who to credit it to if it is ever edited or removed —
     *                  never used for display, `author` is the name typed on
     *                  the form (or the booking's guest name), for the same
     *                  reason a booking keeps its own `guestName` rather than
     *                  a live join to the account.
     *
     * Both are `default: null` rather than `required`: this schema predates
     * them and nothing here backfills the collection.
     */
    bookingId: {
      type: String, default: null, unique: true, sparse: true, index: true,
    },
    customerId: { type: String, default: null, index: true },

    /*
     * The owner's answer, if they gave one.
     *
     * This used to live only in the Stay Partner screen's local state: the
     * owner typed a reply, it appeared under the review, and it was gone on
     * the next load. The student never saw it, because nothing ever saved it.
     * One reply per review, replaceable — an owner correcting a typo should
     * not need a second thread.
     */
    reply: {
      text: { type: String, default: null },
      at: { type: Date, default: null },
    },
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
    /*
     * Beds taken OUTSIDE Lampose — a tenant who moved in over the phone, a
     * room the owner is holding for a relative. Nothing in the app knows about
     * them, so they cannot be counted from `partner_bookings`; the owner (or an
     * admin) says how many beds are free and the inventory service stores the
     * difference here.
     *
     * Kept as its own number rather than folded into `availableBeds` so that
     * anything which rebuilds availability from bookings — the first sync, the
     * reconcile — subtracts it too, and a person's correction is never undone
     * by a recount:
     *
     *   availableBeds = totalBeds − (Lampose bookings on a bed) − offlineOccupied
     *
     * NEGATIVE is allowed and means the opposite correction: Lampose bookings
     * that still say a tenant is in, but the owner says the bed is empty — a
     * PG tenant who left after a dispute, whose booking nobody closed. The
     * owner may free those beds (up to the total) without closing the
     * booking, and −1 here is what keeps a recount from taking the bed back.
     */
    offlineOccupied: { type: Number, default: 0 },
    /* The last time a person set the free count by hand, and who. Shown next
       to the number so "why does it say 9" has an answer. */
    freeBedsEditedAt: { type: Date, default: null },
    freeBedsEditedBy: { type: String, default: '' },
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
