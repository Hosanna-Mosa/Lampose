/* ══════════════════════════════════════════════════════════════════════════
   What a new visit request costs, and why.

   One rule, used by BOTH creation paths — the app's `stayRequest.service.js`
   and the web's `visitRequest.controller.js`. Its own module rather than an
   export from either, because whichever one owned it the other would have to
   require, and this needs nothing but `config` and the category constants.

   ## Two kinds of payment through one subdocument

     assisted_visit   BACHELOR, COLIVE, COMMERCIAL — a platform fee that buys
                      a VIEWING with a Lampose representative, priced by the
                      layout picked (1 RK ₹299 … 5 BHK+ ₹2,499; Commercial
                      ₹1,999). The table is edited in the console — see
                      `modules/visitFees/visitFees.service.js`. Paying it
                      opens the slot picker; the address is released with
                      the slot.

     stay_booking     HOTEL — the stay total, which buys the STAY. Nobody views
                      a hotel room first, so there is no slot and no
                      representative: paying it finishes the booking.

   They share `payment` on the request, one Razorpay integration and one
   webhook, and they must never share a PRICE. See `paymentPurposeFor` in
   `shared/constants/categories.js`.
   ══════════════════════════════════════════════════════════════════════════ */
const config = require('../../config/env');
const { paymentPurposeFor } = require('../../shared/constants/categories');
const visitFees = require('../visitFees/visitFees.service');

/**
 * Razorpay's floor. Below this no order can be created, so a total under it is
 * a broken price rather than a cheap room.
 */
const MIN_CHARGEABLE_PAISE = 100;

/**
 * The payment subdocument for a new request.
 *
 * `intent` is the RESOLVED intent from `resolveStayIntent`, which has already
 * validated the rate, the quantity and the dates and computed `totalAmount`
 * from the owner's own prices. That figure is the only one this may charge: a
 * total derived anywhere else is a number the owner never agreed to.
 *
 * A stay booking whose total does not survive the check gets NO payment rather
 * than a fallback price. Quoting the platform fee for a room is worse than
 * quoting nothing — the request behaves like a free one, which is visible in
 * the logs and fixable, instead of quietly taking the wrong money.
 *
 * Everything here is frozen onto the request at creation. Editing a listing's
 * category or its nightly rate afterwards — or the console's fee table — must
 * not reprice a request somebody has already been asked to pay, or settled.
 *
 * `layoutLabel` is the request's `sharing.label`, already resolved against
 * the listing. It prices an assisted visit; nothing else reads it.
 *
 * The fee comes from the in-memory table (visitFees.service.js), which is
 * replaced the moment the console saves and re-read every minute — so this
 * adds no database round trip to creating a request. Async so a caller never
 * has to change if pricing ever does need one.
 */
const paymentForNewRequest = async (category, intent, discountRupees = 0, layoutLabel = null) => {
  const purpose = paymentPurposeFor(category);
  if (!purpose) return { required: false, status: 'not_required' };

  if (purpose === 'assisted_visit') {
    const fee = visitFees.feeFor(category, layoutLabel);
    if (fee && !fee.recognised) {
      console.warn(
        `[visit-fees] layout "${layoutLabel}" on a ${category} listing matched no tier — `
        + `charged the ${fee.tier} fee. Add a rule in visitFees.service.js if this is a real layout.`,
      );
    }
    /*
     * The visit fee is never discounted, and the coupon cannot reach
     * it — `reserve` is only called on the stay-booking path.
     *
     * The fee buys a representative's time at a viewing; the coupon is a
     * refund of margin on a room. Letting a reward for moving into a PG pay
     * for somebody's viewing of a bachelor flat would spend it on a cost
     * Lampose actually incurs, which is the one place it cannot come from.
     */
    return {
      required: true,
      status: 'pending',
      purpose,
      amountPaise: fee ? fee.amountPaise : config.razorpay.assistedVisitAmountPaise,
      feeTier: fee ? fee.tier : null,
    };
  }

  /* Rupees on the intent, paise on the wire. Rounded rather than truncated, so
     a rate ending in 50 paise cannot lose half a rupee on every night. */
  const total = Number(intent && intent.totalAmount);
  const totalPaise = Math.round(total * 100);

  if (!Number.isFinite(totalPaise) || totalPaise < MIN_CHARGEABLE_PAISE) {
    console.error(
      `[stay-request] ${category} is a prepaid category and the resolved intent carried no `
      + `usable total (${intent && intent.totalAmount}). Created UNPAID — this is a bug in the `
      + 'intent, not a free room.',
    );
    return { required: false, status: 'not_required' };
  }

  /*
   * The move-in reward comes off here, and only here.
   *
   * Server-side, on a total this function has just derived from the owner's
   * own prices — the client sends a coupon ID and never an amount, so there
   * is no figure in the request body that can move the price. That is the
   * same rule the room rate follows (`stayIntent.util.js` re-derives every
   * price) and a discount is a price.
   *
   * Floored at Razorpay's minimum rather than at zero. A ₹100 coupon against
   * an ₹80 room would otherwise produce an order of ₹0 or −₹20, which is not
   * an order at all: Razorpay refuses it and the student cannot pay for a
   * room they are trying to give money for. At the floor they pay ₹1 and
   * keep the rest of the benefit, which is the only outcome that still
   * completes.
   */
  const discountPaise = Math.max(0, Math.round(Number(discountRupees || 0) * 100));
  if (!discountPaise) {
    return { required: true, status: 'pending', purpose, amountPaise: totalPaise };
  }

  const netPaise = Math.max(MIN_CHARGEABLE_PAISE, totalPaise - discountPaise);

  return {
    required: true,
    status: 'pending',
    purpose,
    amountPaise: netPaise,
    /* What it would have been. Kept so a receipt can say "₹4,200, less ₹100"
       rather than presenting a discounted figure as the room's price. */
    grossAmountPaise: totalPaise,
    discountPaise: totalPaise - netPaise,
  };
};

module.exports = { paymentForNewRequest, MIN_CHARGEABLE_PAISE };
