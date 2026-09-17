/* ══════════════════════════════════════════════════════════════════════════
   Earning, holding and spending the ₹100 move-in reward.

   The only writer of `stay_coupons`. Everything that touches a coupon — the
   check-in that mints one, the hotel request that reserves one, the payment
   that spends it, the withdrawal that gives it back — goes through here, so
   the four transitions live in one file and cannot drift apart.

   ## Nothing here throws at its caller

   Granting is fire-and-forget from a check-in: an owner standing in a doorway
   must not see a failure because a reward could not be written, and a student
   must not be refused entry to their own room over a discount. Reserving and
   releasing are equally forgiving — a hotel booking that could not attach a
   coupon is a booking at full price, which is a disappointment and not a
   failure. The one exception is `reserve`, which returns a reason when it
   refuses, because the customer asked for the discount and is owed a sentence
   about why it did not apply.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const StayCoupon = require('./stayCoupon.model');

const { STAY_COUPON_RUPEES, EXPIRY_DAYS } = StayCoupon;

const CODE_ATTEMPTS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

const connected = () => mongoose.connection.readyState === 1;

/**
 * Mint the reward for a move-in.
 *
 * Idempotent on `bookingId`, which is a unique index — an owner tapping
 * check-in twice, or the repair path stamping a booking left half-done by the
 * old two-tap flow, both land on the same row. The duplicate-key error is the
 * success case for the second caller and is swallowed as one.
 *
 * Returns the coupon, or null when there is nothing to give: no database, no
 * customer on the booking (a walk-in the owner keyed in by hand has no app
 * account to reward), or a row already minted for this booking.
 */
const grantForMoveIn = async (booking) => {
  if (!connected()) return null;
  if (!booking || !booking.customerId || !booking._id) return null;

  const bookingId = String(booking._id);

  /* Already earned. Checked before generating a code so the ordinary repeat
     tap does no work and consumes no codes from the space. */
  const existing = await StayCoupon.findOne({ bookingId }).lean();
  if (existing) return existing;

  const expiresAt = new Date(Date.now() + EXPIRY_DAYS * DAY_MS);

  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
    try {
      const coupon = await StayCoupon.create({
        customerId: booking.customerId,
        code: StayCoupon.newCode(),
        amountRupees: STAY_COUPON_RUPEES,
        source: 'move_in',
        bookingId,
        propertyId: booking.propertyId || '',
        propertyName: booking.propertyName || '',
        status: 'active',
        expiresAt,
      });
      return coupon.toObject();
    } catch (error) {
      if (error && error.code === 11000) {
        /* Which unique index? A second grant for the same booking is the
           idempotent case and returns the row that won. A code collision is a
           1-in-a-billion draw and is simply retried. */
        if (error.keyPattern && error.keyPattern.bookingId) {
          return StayCoupon.findOne({ bookingId }).lean();
        }
        continue;
      }
      throw error;
    }
  }

  console.error('[stay-coupon] could not find a free code after 5 attempts');
  return null;
};

/** Everything this customer holds, newest first. */
const listFor = async (customerId) => {
  if (!connected()) return [];
  return StayCoupon.find({ customerId }).sort({ createdAt: -1 }).lean();
};

/**
 * Hold a coupon against a hotel request that is about to be created.
 *
 * `active → reserved`, in ONE conditional update. The condition carries the
 * whole rule — this customer's, still active, not expired — so two requests
 * created in the same instant cannot both claim it: the second update matches
 * nothing and gets `null`.
 *
 * Returns `{ coupon, discountRupees }` or `{ reason }`. The reason is named
 * rather than boolean because the customer sees it: "that code has already
 * been used" and "that code has expired" are different sentences and a
 * student who reads the wrong one goes looking for a bug.
 */
const reserve = async ({ customerId, couponId, requestId }) => {
  if (!connected()) return { reason: 'DB_DISCONNECTED' };
  if (!couponId) return { reason: 'NONE_REQUESTED' };

  if (!mongoose.Types.ObjectId.isValid(couponId)) return { reason: 'NOT_FOUND' };

  const held = await StayCoupon.findOneAndUpdate(
    {
      _id: couponId,
      customerId,
      status: 'active',
      expiresAt: { $gt: new Date() },
    },
    {
      $set: {
        status: 'reserved',
        reservedForRequestId: requestId ? String(requestId) : null,
        reservedAt: new Date(),
      },
    },
    { new: true },
  ).lean();

  if (held) return { coupon: held, discountRupees: held.amountRupees };

  /* It did not match. Say which of the four reasons it was, from the row
     itself — an unmatched update tells you nothing on its own. */
  const row = await StayCoupon.findOne({ _id: couponId }).lean();
  if (!row || row.customerId !== customerId) return { reason: 'NOT_FOUND' };
  if (row.status === 'used') return { reason: 'ALREADY_USED' };
  if (row.status === 'reserved') return { reason: 'ALREADY_HELD' };
  if (row.expiresAt <= new Date()) return { reason: 'EXPIRED' };
  return { reason: 'NOT_FOUND' };
};

/**
 * The money arrived — the hold becomes a spend.
 *
 * Guarded on `reserved` so a Razorpay webhook redelivery cannot move a
 * coupon that some later request has since taken. Idempotent: the second call
 * matches nothing and the row is already `used`.
 */
const consume = async (requestId) => {
  if (!connected() || !requestId) return null;
  return StayCoupon.findOneAndUpdate(
    { reservedForRequestId: String(requestId), status: 'reserved' },
    {
      $set: { status: 'used', usedAt: new Date(), usedOnRequestId: String(requestId) },
      $unset: { reservedForRequestId: '', reservedAt: '' },
    },
    { new: true },
  ).lean();
};

/**
 * The request went away unpaid — give the coupon back.
 *
 * Called from withdrawal and from the expiry worker. Only ever un-reserves:
 * a coupon already `used` is money that changed hands and is never returned
 * by this path, which is why the guard names the status rather than trusting
 * the caller to only call it at the right time.
 */
const release = async (requestId) => {
  if (!connected() || !requestId) return null;
  return StayCoupon.findOneAndUpdate(
    { reservedForRequestId: String(requestId), status: 'reserved' },
    {
      $set: { status: 'active' },
      $unset: { reservedForRequestId: '', reservedAt: '' },
    },
    { new: true },
  ).lean();
};

module.exports = {
  grantForMoveIn,
  listFor,
  reserve,
  consume,
  release,
  STAY_COUPON_RUPEES,
};
