/* ══════════════════════════════════════════════════════════════════════════
   The cart's arithmetic, in one place.

   Every screen that shows money — the kitchen panel, the cart, the checkout
   summary, the placed order — reads `totals()`. Three copies of "items plus
   packing plus delivery minus the coupon" is how two of them end up
   disagreeing by ten rupees on the one screen a student actually reads.

   There is NO tax line, deliberately: a Lampose food order is items, packing
   and delivery and nothing else, so a bill that printed a tax row would be
   naming a levy nobody collects.
   ══════════════════════════════════════════════════════════════════════════ */

import { COUPONS } from '../data/food';

/**
 * Does a kitchen's minimum order STOP an order, or only say so?
 *
 * It stopped, and stopping is what the rule means to the kitchen: a ₹20 chai
 * is not worth a rider's trip. But it also puts a dead end in front of a cart
 * with one cheap thing in it, which is the most common cart there is — and on
 * this surface, where the minimums come from a fixture rather than from a
 * restaurant that agreed to them, that dead end is ours, not theirs.
 *
 * So the minimum is TOLD, not enforced. The cart prints how far under it is,
 * beside the button, and the button still works. Turning the rule back on is
 * this one word — both the cart and the checkout read it, so they cannot
 * disagree about whether an order can be placed.
 */
export const ENFORCE_MINIMUM = false;

/* A line's price is the dish plus whatever was ticked on the sheet, resolved
   once when it is added. Re-deriving it later means re-reading add-ons that
   may have been taken off the menu since. */
export const lineUnitPrice = (dish, addOns = []) =>
  Number(dish.price) + addOns.reduce((sum, a) => sum + Number(a.price || 0), 0);

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
  if (coupon.pickupOnly && fulfilment !== 'pickup') return 'Pickup orders only';
  if (itemTotal < coupon.minimum) return `Add ₹${coupon.minimum - itemTotal} more`;
  return null;
}

export const couponByCode = code =>
  COUPONS.find(c => c.code.toLowerCase() === String(code || '').trim().toLowerCase()) || null;

/* Coupons this cart could reach, each carrying why it cannot run yet. A
   coupon is listed with its reason rather than hidden, because "spend ₹119
   more" is an offer and a hidden coupon is nothing. */
export function offersFor({ itemTotal, kitchenId, fulfilment }) {
  return COUPONS
    .filter(c => !c.kitchenId || c.kitchenId === kitchenId)
    .map(c => ({ ...c, blockedReason: couponBlockedReason(c, { itemTotal, kitchenId, fulfilment }) }));
}

/**
 * The bill. `kitchen` may be null (an empty cart), which zeroes the fees
 * rather than throwing — an empty cart is a normal state, not an error.
 */
export function totals({ lines = [], kitchen = null, coupon = null, fulfilment = 'delivery' }) {
  const itemTotal = itemTotalOf(lines);
  const delivering = fulfilment === 'delivery';

  const packagingCharge = lines.length ? Number(kitchen?.packagingCharge || 0) : 0;
  const deliveryFee = lines.length && delivering ? Number(kitchen?.deliveryFee || 0) : 0;

  const blocked = coupon
    ? couponBlockedReason(coupon, { itemTotal, kitchenId: kitchen?.id, fulfilment })
    : 'No coupon';
  const discount = blocked ? 0 : Number(coupon.discount);

  const toPay = Math.max(0, itemTotal + packagingCharge + deliveryFee - discount);

  return {
    itemTotal,
    packagingCharge,
    deliveryFee,
    discount,
    toPay,
    count: countOf(lines),
    /* Set when a coupon is held but cannot run, so the cart can say why
       instead of silently charging full price. */
    couponBlockedReason: coupon ? blocked : null,
    /* A kitchen's minimum is about the food, not the fees. */
    shortOfMinimum: lines.length && kitchen ? Math.max(0, Number(kitchen.minOrder || 0) - itemTotal) : 0,
  };
}

/* What the dish sheet chose, as the one line the receipt will carry. */
export const describeChoices = line => [
  line.spice && line.spice !== 'none' ? SPICE_LABEL[line.spice] : null,
  ...(line.addOns || []).map(a => a.label),
].filter(Boolean).join(' · ');

export const SPICE_LABEL = { mild: 'Mild', medium: 'Medium', hot: 'Andhra hot' };
