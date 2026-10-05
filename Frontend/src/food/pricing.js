/* ══════════════════════════════════════════════════════════════════════════
   The food bill, previewed in the browser.

   A mirror of `Backend/src/modules/foodpartners/foodPricing.js`, which is the
   one that charges. This copy lets the cart show a bill the moment a dish goes
   in; the server's quote (`POST /orders/quote`) replaces it as soon as it
   arrives, and the order is priced by the server again when it is placed.

   Without a distance, delivery is the first slab — what the server charges
   too when it cannot measure one. All arithmetic in integer paise.
   ══════════════════════════════════════════════════════════════════════════ */

export const FOOD_PRICING = Object.freeze({
  foodGstRate: 0.05,
  deliveryGstRate: 0.18,
  serviceFee: 5,
  serviceFeeGstRate: 0.18,
  packagingGstRate: 0.18,
  maxPackagingFee: 50,
  smallOrderThreshold: 150,
  smallOrderFee: 10,
  deliverySlabs: [
    { maxKm: 2, fee: 19 },
    { maxKm: 3, fee: 24 },
    { maxKm: 5, fee: 29 },
    { maxKm: 7, fee: 39 },
    { maxKm: 9, fee: 49 },
    { maxKm: 12, fee: 59 },
  ],
  beyondLastSlabPerKm: 5,
});

const toPaise = (rupees) => {
  const n = Number(rupees);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
};
const fromPaise = paise => Math.round(paise) / 100;

export function calculateDeliveryFee(distanceKm) {
  const slabs = FOOD_PRICING.deliverySlabs;
  const km = Number(distanceKm);
  if (distanceKm === null || distanceKm === undefined || !Number.isFinite(km) || km < 0) return slabs[0].fee;
  for (const slab of slabs) if (km <= slab.maxKm) return slab.fee;
  const last = slabs[slabs.length - 1];
  return last.fee + Math.ceil(km - last.maxKm) * FOOD_PRICING.beyondLastSlabPerKm;
}

/** The customer's half of a breakdown — the same shape the quote returns. */
export function previewFoodBill({ foodSubtotal, distanceKm = null, packagingFee = 0, discount = 0 }) {
  const c = FOOD_PRICING;
  const foodP = toPaise(foodSubtotal);
  const packagingP = Math.min(toPaise(packagingFee), toPaise(c.maxPackagingFee));
  const foodGstP = Math.round(foodP * c.foodGstRate);
  const known = distanceKm !== null && distanceKm !== undefined && Number.isFinite(Number(distanceKm)) && Number(distanceKm) >= 0;
  const deliveryP = toPaise(calculateDeliveryFee(known ? Number(distanceKm) : null));
  const deliveryGstP = Math.round(deliveryP * c.deliveryGstRate);
  const serviceP = toPaise(c.serviceFee);
  const serviceGstP = Math.round(serviceP * c.serviceFeeGstRate);
  const packagingGstP = Math.round(packagingP * c.packagingGstRate);
  const smallP = foodP < toPaise(c.smallOrderThreshold) ? toPaise(c.smallOrderFee) : 0;
  const grossP = foodP + foodGstP + deliveryP + deliveryGstP + serviceP + serviceGstP + packagingP + packagingGstP + smallP;
  const discountP = Math.min(toPaise(discount), grossP);

  return {
    foodSubtotal: fromPaise(foodP),
    foodGstRate: c.foodGstRate,
    foodGst: fromPaise(foodGstP),
    foodGstIncluded: false,
    distanceKm: known ? Math.round(Number(distanceKm) * 100) / 100 : null,
    distanceKnown: known,
    deliveryFee: fromPaise(deliveryP),
    deliveryGst: fromPaise(deliveryGstP),
    serviceFee: fromPaise(serviceP),
    serviceFeeGst: fromPaise(serviceGstP),
    packagingFee: fromPaise(packagingP),
    packagingGst: fromPaise(packagingGstP),
    smallOrderFee: fromPaise(smallP),
    smallOrderThreshold: c.smallOrderThreshold,
    discount: fromPaise(discountP),
    customerPayable: fromPaise(Math.max(0, grossP - discountP)),
  };
}
