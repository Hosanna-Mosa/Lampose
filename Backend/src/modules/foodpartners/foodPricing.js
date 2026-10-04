/* ══════════════════════════════════════════════════════════════════════════
   Food pricing — the ONE place a food order's bill is worked out.

   Every figure a diner, a kitchen or the books see comes from
   `calculateOrderPricing`. The order endpoint calls it before writing an
   order (and stores the result as `pricing`), the quote endpoint calls it so
   the apps can show the bill before anyone pays, and nothing a client sends
   is trusted as a price.

   ## Launch model

   - Restaurant commission: 0%. Nothing is deducted from a kitchen.
   - Food GST 5% — on top of the menu price (prices are GST-exclusive today),
     or extracted from it when a kitchen's prices include GST.
   - Delivery fee by distance slab, plus 18% GST on it.
   - Service fee ₹5 a order, plus 18% GST. The customer-facing name is
     "Service fee" everywhere; this file never calls it anything else.
   - The kitchen's own packaging fee, plus 18% GST (to be confirmed with the
     tax advisor — it is configuration, not code).
   - A ₹10 small-order fee under ₹150 of food.

   ## Money

   Everything is computed in integer PAISE and converted back to rupees once,
   at the end. Floating point never touches an intermediate figure, so ₹5.22
   is ₹5.22 and not ₹5.219999.

   ## Not here, on purpose

   Commission, surge, rain or membership pricing, a coupon system. Rider pay
   is an INPUT (from `riderEarningsFor` in foodDispatch.service.js), not
   something this file decides.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The launch configuration. One object, so a change of rule is a change here
 * and nowhere else — and an admin screen can later supply the same shape.
 */
const FOOD_PRICING_CONFIG = Object.freeze({
  restaurantCommissionRate: 0,

  foodGstRate: 0.05,
  /* 'exclusive': menu prices are before GST and 5% is added on top (how every
     kitchen is priced today). 'inclusive': GST is already inside the menu
     price and is extracted (price × 5/105), never added again. */
  defaultTaxMode: 'exclusive',

  deliveryGstRate: 0.18,

  serviceFee: 5,
  serviceFeeGstRate: 0.18,

  packagingGstRate: 0.18,
  /* A kitchen sets its own packaging fee; this is the most it may set. */
  maxPackagingFee: 50,

  smallOrderThreshold: 150,
  smallOrderFee: 10,

  /* Upper bound in km (inclusive) → fee in rupees. 2.0 km is the first slab;
     2.01 km is the second. */
  deliverySlabs: Object.freeze([
    Object.freeze({ maxKm: 2, fee: 19 }),
    Object.freeze({ maxKm: 3, fee: 24 }),
    Object.freeze({ maxKm: 5, fee: 29 }),
    Object.freeze({ maxKm: 7, fee: 39 }),
    Object.freeze({ maxKm: 9, fee: 49 }),
    Object.freeze({ maxKm: 12, fee: 59 }),
  ]),
  /* Beyond the last slab: this much per started km over it. 12.3 km is
     ₹59 + ₹5; 14.0 km is ₹59 + ₹10. */
  beyondLastSlabPerKm: 5,
});

/* ── Money ─────────────────────────────────────────────────────────────── */

/** Rupees → integer paise. Non-numbers and negatives are 0. */
const toPaise = (rupees) => {
  const n = Number(rupees);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100);
};

/** Integer paise → rupees, exactly representable to two places. */
const fromPaise = (paise) => Math.round(paise) / 100;

/** A rupee figure rounded to the paisa. */
const roundMoney = (value) => fromPaise(toPaise(value));

/** A rate applied to an amount in paise, rounded to the nearest paisa. */
const ratePaise = (paise, rate) => Math.round(paise * rate);

/* ── Delivery ──────────────────────────────────────────────────────────── */

/**
 * The delivery fee for a distance, in rupees.
 *
 * `null`, a negative or a non-number is an unknown distance (no drop pin, a
 * kitchen with no pin): the FIRST slab is charged, which errs in the diner's
 * favour — see `distanceKnown` on the breakdown, which says so.
 */
const calculateDeliveryFee = (distanceKm, config = FOOD_PRICING_CONFIG) => {
  const slabs = config.deliverySlabs;
  const km = Number(distanceKm);
  if (distanceKm === null || distanceKm === undefined || !Number.isFinite(km) || km < 0) {
    return slabs[0].fee;
  }
  for (const slab of slabs) {
    if (km <= slab.maxKm) return slab.fee;
  }
  const last = slabs[slabs.length - 1];
  const extraKm = Math.ceil(km - last.maxKm);
  return last.fee + extraKm * config.beyondLastSlabPerKm;
};

/* ── The bill ──────────────────────────────────────────────────────────── */

/**
 * The whole breakdown for one order.
 *
 * @param {object} input
 * @param {number} input.foodSubtotal   Σ(item price × qty), in rupees, as the menu prices it
 * @param {number|null} input.distanceKm kitchen → drop; null when unknown
 * @param {number} [input.packagingFee] the kitchen's own fee
 * @param {number} [input.discount]     an existing discount, never a new coupon system
 * @param {'exclusive'|'inclusive'} [input.taxMode]
 * @param {number} [input.riderPayout]  from the rider calculation, passed through
 * @param {object} [config]
 */
const calculateOrderPricing = ({
  foodSubtotal,
  distanceKm = null,
  packagingFee = 0,
  discount = 0,
  taxMode,
  riderPayout = 0,
} = {}, config = FOOD_PRICING_CONFIG) => {
  const mode = taxMode === 'inclusive' || taxMode === 'exclusive' ? taxMode : config.defaultTaxMode;

  const foodP = toPaise(foodSubtotal);
  const packagingP = Math.min(toPaise(packagingFee), toPaise(config.maxPackagingFee));
  const discountP = toPaise(discount);

  /* GST on the food. Exclusive: added on top. Inclusive: the part of the
     price that already IS tax — 5/105 of it — and nothing is added. */
  const foodGstP = mode === 'inclusive'
    ? Math.round((foodP * config.foodGstRate) / (1 + config.foodGstRate))
    : ratePaise(foodP, config.foodGstRate);
  const foodGstChargedP = mode === 'inclusive' ? 0 : foodGstP;

  const known = distanceKm !== null && distanceKm !== undefined
    && Number.isFinite(Number(distanceKm)) && Number(distanceKm) >= 0;
  const deliveryP = toPaise(calculateDeliveryFee(known ? Number(distanceKm) : null, config));
  const deliveryGstP = ratePaise(deliveryP, config.deliveryGstRate);

  const serviceP = toPaise(config.serviceFee);
  const serviceGstP = ratePaise(serviceP, config.serviceFeeGstRate);

  const packagingGstP = ratePaise(packagingP, config.packagingGstRate);

  /* Against the food as the diner sees it on the menu — the subtotal — so
     ₹149.99 pays it and ₹150.00 does not. */
  const smallOrderP = foodP < toPaise(config.smallOrderThreshold) ? toPaise(config.smallOrderFee) : 0;

  const grossP = foodP + foodGstChargedP + deliveryP + deliveryGstP + serviceP + serviceGstP
    + packagingP + packagingGstP + smallOrderP;
  const appliedDiscountP = Math.min(discountP, grossP);
  const payableP = Math.max(0, grossP - appliedDiscountP);

  /* The kitchen's food value: before GST. In inclusive mode the GST inside
     the price is the government's, not the kitchen's. */
  const restaurantFoodP = foodP - (mode === 'inclusive' ? foodGstP : 0);
  const commissionP = ratePaise(restaurantFoodP, config.restaurantCommissionRate);

  return {
    taxMode: mode,
    foodSubtotal: fromPaise(foodP),

    foodGstRate: config.foodGstRate,
    foodGst: fromPaise(foodGstP),
    /* Whether the GST above is added to the bill (exclusive) or already
       inside the food price (inclusive). */
    foodGstIncluded: mode === 'inclusive',

    distanceKm: known ? Math.round(Number(distanceKm) * 100) / 100 : null,
    distanceKnown: known,

    deliveryFee: fromPaise(deliveryP),
    deliveryGstRate: config.deliveryGstRate,
    deliveryGst: fromPaise(deliveryGstP),

    serviceFee: fromPaise(serviceP),
    serviceFeeGstRate: config.serviceFeeGstRate,
    serviceFeeGst: fromPaise(serviceGstP),

    packagingFee: fromPaise(packagingP),
    packagingGstRate: config.packagingGstRate,
    packagingGst: fromPaise(packagingGstP),

    smallOrderFee: fromPaise(smallOrderP),

    grossAmount: fromPaise(grossP),
    discount: fromPaise(appliedDiscountP),
    customerPayable: fromPaise(payableP),

    /* ── Restaurant settlement ── */
    restaurantCommissionRate: config.restaurantCommissionRate,
    restaurantCommission: fromPaise(commissionP),
    /* Food (before GST) plus its own packaging fee, less a commission that
       is 0 at launch. Never negative. */
    restaurantPayable: fromPaise(Math.max(0, restaurantFoodP + packagingP - commissionP)),

    /* ── Rider settlement (passed through, not decided here) ── */
    riderPayout: roundMoney(riderPayout),

    /* ── Lampose ── what the platform earns before costs. GST collected is a
       liability, never revenue, so it is reported apart. */
    lamposeGrossRevenue: fromPaise(deliveryP + serviceP),
    gstCollected: fromPaise(foodGstChargedP + deliveryGstP + serviceGstP + packagingGstP),
  };
};

module.exports = {
  FOOD_PRICING_CONFIG,
  calculateDeliveryFee,
  calculateOrderPricing,
  roundMoney,
  toPaise,
  fromPaise,
};
