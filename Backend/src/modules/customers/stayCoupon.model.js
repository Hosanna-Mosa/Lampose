/* ══════════════════════════════════════════════════════════════════════════
   A ₹100 discount on a future HOTEL booking, earned by moving in.

   The reward for finishing a stay booking: the moment an owner types a
   student's entry code and the stay begins, the student gets a code worth
   ₹100 off the next hotel they book through Lampose. See
   `stayCoupon.service.js`, which is the only writer of this collection.

   ## Why this is not `food_coupons`

   They look alike and they are not the same thing. A food coupon is ₹ off a
   FOOD order, is issued by a referral, and is unique per customer because
   "first order only" makes a second one meaningless. This is ₹ off a STAY, is
   issued by an event that can happen more than once, and is therefore held as
   MANY rows per customer — a student who moves into a PG in June and a hostel
   in January has earned two. Folding the two together would have meant one
   collection whose uniqueness rule was true for half its rows.

   ## Why it carries a printed code

   The customer never has to type it — the app sends `couponId` and the server
   resolves it. The code exists because a discount you cannot name is one you
   cannot ask about: it is what goes in the notification, on the success
   screen, and in the sentence a student says to support when it did not come
   off. Generated from the same ambiguity-free alphabet the owner referral
   codes use, for the same reason.

   ## Reserving, not spending

   `status` has three states rather than two. A hotel request is created
   BEFORE it is paid for, and a student who abandons a Razorpay page must not
   have burned their coupon — but two requests must not each claim the same
   ₹100 either. So creating a request moves `active → reserved` against that
   request, paying moves `reserved → used`, and a request that expires or is
   withdrawn puts it back. `food_coupons` needs none of this because nothing
   there has a pending state between choosing and paying.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

/** What one move-in is worth. */
const STAY_COUPON_RUPEES = 100;

/** No 0/O/1/I — this is read off a screen and said down a phone to support. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

/**
 * Long enough to be worth having, short enough to create urgency.
 *
 * A reward with no expiry is a liability that never leaves the balance sheet
 * and a discount nobody hurries to use. A year is the compromise: it survives
 * a full academic year, so a student who moves into a PG in June can still
 * spend it on a hotel when their parents visit in March.
 */
const EXPIRY_DAYS = 365;

const stayCouponSchema = new mongoose.Schema(
  {
    /* Not unique — see the header. A customer may hold several. */
    customerId: { type: String, required: true, index: true },

    /* Typed by nobody, quoted by everybody. Unique so two students can never
       be told the same code, which would make a support call unanswerable. */
    code: { type: String, required: true, unique: true, index: true },

    amountRupees: { type: Number, required: true, default: STAY_COUPON_RUPEES },
    source: { type: String, enum: ['move_in'], default: 'move_in' },

    /*
     * The move-in that earned it, and the guard against earning it twice.
     *
     * Unique and sparse: one coupon per booking, so an owner tapping check-in
     * again — or the repair path stamping an old booking — cannot mint a
     * second ₹100. Sparse because a coupon granted some other way later would
     * carry no booking, and a plain unique index would then allow exactly one
     * such row in the whole collection.
     */
    bookingId: { type: String, default: null, unique: true, sparse: true },

    /* For "you earned this when you moved into X". */
    propertyId: { type: String, default: '' },
    propertyName: { type: String, default: '' },

    status: { type: String, enum: ['active', 'reserved', 'used'], default: 'active', index: true },

    /* Which request is currently holding it, while `reserved`. Cleared when
       the reservation is released. */
    reservedForRequestId: { type: String, default: null, index: true },
    reservedAt: { type: Date, default: null },

    usedAt: { type: Date, default: null },
    usedOnRequestId: { type: String, default: null },

    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true, collection: 'stay_coupons' },
);

/** A code, from the unambiguous alphabet. Uniqueness is the index's job. */
stayCouponSchema.statics.newCode = function newCode() {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return `LMP${out}`;
};

/**
 * Spendable right now.
 *
 * Expiry is checked here rather than by a worker that sweeps the collection.
 * A coupon that lapsed at midnight is not spendable at 00:01 whether or not a
 * cron has run, and a read that depends on a sweep having happened is a read
 * that is wrong for however long the sweep is late.
 */
stayCouponSchema.methods.isSpendable = function isSpendable() {
  return this.status === 'active' && this.expiresAt > new Date();
};

module.exports = mongoose.models.StayCoupon
  || mongoose.model('StayCoupon', stayCouponSchema, 'stay_coupons');

module.exports.STAY_COUPON_RUPEES = STAY_COUPON_RUPEES;
module.exports.EXPIRY_DAYS = EXPIRY_DAYS;
