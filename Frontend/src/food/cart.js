/* ══════════════════════════════════════════════════════════════════════════
   The cart's arithmetic, in one place.

   Every screen that shows money — the kitchen panel, the cart, the checkout
   summary, the placed order — reads `totals()`. Three copies of "items plus
   packing plus delivery minus the coupon" is how two of them end up
   disagreeing by ten rupees on the one screen a student actually reads.

   The rules themselves live in `pricing.js` (a mirror of the server's
   `foodPricing.js`); the server's quote replaces the preview when it lands.
   ══════════════════════════════════════════════════════════════════════════ */

import { previewFoodBill } from './pricing';

/**
 * Does a kitchen's minimum order STOP an order, or only say so?
 *
 * It stopped, and stopping is what the rule means to the kitchen: a ₹20 chai
 * is not worth a rider's trip. But it also puts a dead end in front of a cart
 * with one cheap thing in it, which is the most common cart there is — and on
 * this surface, where the minimums come from a fixture rather than from a
 * restaurant that agreed to them, that dead end is ours, not theirs.
 *
 * THERE IS NO MINIMUM ORDER ANY MORE. The server reports `minOrder: 0` for
 * every kitchen, the order endpoint no longer refuses anything for being under
 * one, and nothing here computes how far short a cart is. A kitchen that wants
 * a floor prices its dishes for one.
 *
 * What replaced the argument above: the bill gained GST and a flat platform
 * fee, which ARE enforced, are the same everywhere, and come from the kitchen
 * card rather than from figures typed into this file. See `totals` below.
 */

/* A line's price is the dish plus whatever was ticked on the sheet, resolved
   once when it is added. Re-deriving it later means re-reading add-ons that
   may have been taken off the menu since. */
export const lineUnitPrice = (dish, addOns = []) =>
  Number(dish.price) + addOns.reduce((sum, a) => sum + Number(a.price || 0), 0);

/* Money, not floating point noise — 5% of ₹239 is 11.95, not 11.949999. */
const round2 = value => Math.round((Number(value) || 0) * 100) / 100;

export const lineTotal = line => line.unitPrice * line.qty;

export const itemTotalOf = lines => lines.reduce((sum, l) => sum + lineTotal(l), 0);

export const countOf = lines => lines.reduce((sum, l) => sum + l.qty, 0);

/* Why a coupon cannot run, in the words the chip shows — or null when it can.
   The threshold is read against the ITEM total, never the payable: a coupon
   that counted the delivery fee towards its own minimum would be paying for
   itself. */
export function couponBlockedReason(coupon, { itemTotal, kitchenId, fulfilment }) {
  if (!coupon) return 'No such code';
  if (coupon.kitchenId && coupon.kitchenId !== kitchenId) return 'Not for this kitchen';
  /* A coupon flagged `pickupOnly` can never run: collection is withdrawn and
     every order is a delivery. No coupon is enforced today either — see
     `CartProvider` — so this is the honest refusal rather than a dead branch
     that would silently discount an order the server charges in full. */
  if (coupon.pickupOnly) return 'No longer available';
  if (itemTotal < coupon.minimum) return `Add ₹${coupon.minimum - itemTotal} more`;
  return null;
}

/*
 * Both helpers below take the coupon list as an ARGUMENT.
 *
 * They used to close over a fixture array, which made the list impossible to
 * change without editing this file. The list now comes from the server and is
 * held by `CartProvider`, so it is passed in — and it is passed in ALREADY
 * FILTERED to the coupons the server will honour (`enforced: true`). This
 * file does no filtering of its own: whether a coupon is real is the server's
 * answer, and re-deciding it here would be a second opinion that could
 * disagree with the bill the order actually gets.
 */
export const couponByCode = (code, coupons = []) =>
  coupons.find(c => c.code && c.code.toLowerCase() === String(code || '').trim().toLowerCase()) || null;

/* Coupons this cart could reach, each carrying why it cannot run yet. A
   coupon is listed with its reason rather than hidden, because "spend ₹119
   more" is an offer and a hidden coupon is nothing. */
export function offersFor({ itemTotal, kitchenId, fulfilment }, coupons = []) {
  return coupons
    .filter(c => !c.kitchenId || c.kitchenId === kitchenId)
    .map(c => ({ ...c, blockedReason: couponBlockedReason(c, { itemTotal, kitchenId, fulfilment }) }));
}

/**
 * The bill. `kitchen` may be null (an empty cart), which zeroes the fees
 * rather than throwing — an empty cart is a normal state, not an error.
 */
export function totals({ lines = [], kitchen = null, coupon = null, fulfilment = 'delivery', quote = null }) {
  const itemTotal = itemTotalOf(lines);

  const blocked = coupon
    ? couponBlockedReason(coupon, { itemTotal, kitchenId: kitchen?.id, fulfilment })
    : 'No coupon';
  const discount = blocked ? 0 : Number(coupon.discount);

  /*
   * The server's quote when it has answered for THIS cart (the provider only
   * passes a matching one), else the preview: delivery at the first slab until
   * the server has measured the distance. The coupon is the website's own
   * offer and is applied on top of either.
   */
  const figures = lines.length && kitchen
    ? (quote || previewFoodBill({ foodSubtotal: itemTotal, packagingFee: kitchen.packagingCharge || 0 }))
    : previewFoodBill({ foodSubtotal: 0 });
  const empty = !lines.length || !kitchen;
  const gross = empty ? 0 : round2(figures.customerPayable + figures.discount);

  return {
    itemTotal,
    gst: empty ? 0 : figures.foodGst,
    gstRate: Math.round(figures.foodGstRate * 100),
    deliveryFee: empty ? 0 : figures.deliveryFee,
    deliveryGst: empty ? 0 : figures.deliveryGst,
    distanceKm: figures.distanceKnown ? figures.distanceKm : null,
    serviceFee: empty ? 0 : figures.serviceFee,
    serviceFeeGst: empty ? 0 : figures.serviceFeeGst,
    packagingCharge: empty ? 0 : figures.packagingFee,
    packagingGst: empty ? 0 : figures.packagingGst,
    smallOrderFee: empty ? 0 : figures.smallOrderFee,
    smallOrderThreshold: figures.smallOrderThreshold,
    grossTotal: gross,
    discount,
    toPay: round2(Math.max(0, gross - discount)),
    priced: quote ? 'server' : 'preview',
    count: countOf(lines),
    /* Set when a coupon is held but cannot run, so the cart can say why
       instead of silently charging full price. */
    couponBlockedReason: coupon ? blocked : null,
  };
}

/* What the dish sheet chose, as the one line the receipt will carry. */
export const describeChoices = line => [
  line.spice && line.spice !== 'none' ? SPICE_LABEL[line.spice] : null,
  ...(line.addOns || []).map(a => a.label),
].filter(Boolean).join(' · ');

export const SPICE_LABEL = { mild: 'Mild', medium: 'Medium', hot: 'Andhra hot' };
