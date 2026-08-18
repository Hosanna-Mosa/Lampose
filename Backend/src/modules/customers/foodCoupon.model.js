/* ══════════════════════════════════════════════════════════════════════════
   A food-order discount a customer unlocked by signing up through an owner's
   invite code. See `partners/customerReferral.controller.js`, which is the
   only writer of this collection.

   ## One per customer, on purpose

   `customerId` is unique. "First order only" makes a second, simultaneous
   coupon meaningless, and a customer with two competing discounts is a
   support ticket about which one applied rather than a better reward. If this
   customer already has one when a referral is redeemed, the existing coupon
   is left alone — see the `$setOnInsert` in `customerReferral.controller.js`.

   ## There is no food-ordering backend yet to consume this against

   The coupon is real and issued for real, but nothing in this process places
   a food order — that module is still client-side fixture data (see
   `User App/data/food.ts`). `status` stays `active` until food ordering has a
   real checkout to mark it `used` from; until then this is the record of a
   reward that exists and is visible to the customer, not yet a discount
   automatically applied anywhere.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const foodCouponSchema = new mongoose.Schema(
  {
    customerId: { type: String, required: true, unique: true, index: true },
    amountRupees: { type: Number, required: true },
    source: { type: String, enum: ['referral'], default: 'referral' },

    /* Which property's invite earned this, for the customer-facing "You got
       this because you signed up via X" line. */
    propertyId: { type: String, default: '' },
    propertyName: { type: String, default: '' },

    status: { type: String, enum: ['active', 'used'], default: 'active' },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'food_coupons' },
);

module.exports = mongoose.models.FoodCoupon
  || mongoose.model('FoodCoupon', foodCouponSchema, 'food_coupons');
