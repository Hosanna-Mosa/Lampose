/* ══════════════════════════════════════════════════════════════════════════
   What a food order costs on top of the food.

   ONE definition, because a bill is shown four times before it is charged
   once: the cart, the checkout, the payment screen and the receipt, across the
   website and the app — and the figure that matters is the one the ORDER
   endpoint computes. Everything else is a preview of this file's arithmetic,
   and a preview that disagrees with the charge is the kind of difference a
   diner notices on the receipt and not before.

   ## GST at 5%, on the food

   Charged on the item total: the food is what is taxed, and a tax on the
   delivery fee or on the platform fee is a different rate and a different
   argument. It is computed and STORED per order rather than derived at read
   time, for the reason `commissionRate` is stored — a rate that changes must
   not silently rewrite what a historical order charged.

   ## A flat ₹2 platform fee

   Per order, not per item and not a percentage. It is charged on pickup too:
   the platform's part is taking the order, telling the kitchen and handling
   the money, and none of that depends on who carries the food.

   ## What it is NOT

   Not the restaurant's money. `partnerPayout` is worked out from the item
   total alone, so neither charge reaches a settlement — the tax is the
   government's and the fee is ours.

   ## The packaging charge is gone

   `food_restaurants.packagingCharge` and `food_orders.packagingCharge` both
   still exist and are both left alone. The column stays because orders placed
   before this change carry a real figure in it and their receipts must keep
   adding up; nothing new is ever written there, and `chargesFor` does not read
   it. A restaurant's own packaging charge is no longer collected or billed.
   ══════════════════════════════════════════════════════════════════════════ */

/** Percent, on the item total. */
const GST_RATE = 5;

/** Rupees, flat, per order. */
const PLATFORM_FEE = 2;

/** Two decimal places — money, not floating point noise. */
const money = (value) => Math.round((Number(value) || 0) * 100) / 100;

/**
 * The charges on one order's food.
 *
 * @param {number} itemsTotal  the food, before anything is added
 * @returns {{ gst: number, gstRate: number, platformFee: number }}
 */
const chargesFor = (itemsTotal) => ({
  gst: money((money(itemsTotal) * GST_RATE) / 100),
  gstRate: GST_RATE,
  platformFee: PLATFORM_FEE,
});

module.exports = { GST_RATE, PLATFORM_FEE, chargesFor, money };
