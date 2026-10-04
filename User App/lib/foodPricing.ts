/**
 * The food bill, previewed on the device.
 *
 * A mirror of `Backend/src/modules/foodpartners/foodPricing.js` — the server's
 * is the one that charges. This copy exists so the cart can show a bill the
 * moment a dish goes in, before the server's quote (`/orders/quote`) arrives;
 * FoodContext replaces these figures with the quote as soon as it lands, and
 * the order is priced by the server again when it is placed.
 *
 * Without a distance (no quote yet) delivery is the first slab, which is what
 * the server charges too when it cannot measure one.
 *
 * Everything in integer paise, converted back once — ₹5.22, never ₹5.219999.
 */

export const FOOD_PRICING = {
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
} as const;

/** The customer's half of a breakdown — the shape the quote endpoint returns. */
export type FoodBillFigures = {
  foodSubtotal: number;
  foodGstRate: number;
  foodGst: number;
  /** GST already inside the menu prices: shown, not added. */
  foodGstIncluded: boolean;
  distanceKm: number | null;
  distanceKnown: boolean;
  deliveryFee: number;
  deliveryGst: number;
  serviceFee: number;
  serviceFeeGst: number;
  packagingFee: number;
  packagingGst: number;
  smallOrderFee: number;
  smallOrderThreshold: number;
  discount: number;
  customerPayable: number;
};

const toPaise = (rupees: unknown): number => {
  const n = Number(rupees);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
};
const fromPaise = (paise: number): number => Math.round(paise) / 100;

export function calculateDeliveryFee(distanceKm: number | null | undefined): number {
  const slabs = FOOD_PRICING.deliverySlabs;
  if (distanceKm === null || distanceKm === undefined || !Number.isFinite(distanceKm) || distanceKm < 0) {
    return slabs[0].fee;
  }
  for (const slab of slabs) if (distanceKm <= slab.maxKm) return slab.fee;
  const last = slabs[slabs.length - 1];
  return last.fee + Math.ceil(distanceKm - last.maxKm) * FOOD_PRICING.beyondLastSlabPerKm;
}

export function previewFoodBill({
  foodSubtotal,
  distanceKm = null,
  packagingFee = 0,
  discount = 0,
  taxMode = 'exclusive',
}: {
  foodSubtotal: number;
  distanceKm?: number | null;
  packagingFee?: number;
  discount?: number;
  taxMode?: 'exclusive' | 'inclusive';
}): FoodBillFigures {
  const c = FOOD_PRICING;
  const foodP = toPaise(foodSubtotal);
  const packagingP = Math.min(toPaise(packagingFee), toPaise(c.maxPackagingFee));
  const inclusive = taxMode === 'inclusive';
  const foodGstP = inclusive
    ? Math.round((foodP * c.foodGstRate) / (1 + c.foodGstRate))
    : Math.round(foodP * c.foodGstRate);
  const known = distanceKm !== null && Number.isFinite(distanceKm) && distanceKm >= 0;
  const deliveryP = toPaise(calculateDeliveryFee(known ? distanceKm : null));
  const deliveryGstP = Math.round(deliveryP * c.deliveryGstRate);
  const serviceP = toPaise(c.serviceFee);
  const serviceGstP = Math.round(serviceP * c.serviceFeeGstRate);
  const packagingGstP = Math.round(packagingP * c.packagingGstRate);
  const smallP = foodP < toPaise(c.smallOrderThreshold) ? toPaise(c.smallOrderFee) : 0;
  const grossP = foodP + (inclusive ? 0 : foodGstP) + deliveryP + deliveryGstP + serviceP + serviceGstP
    + packagingP + packagingGstP + smallP;
  const discountP = Math.min(toPaise(discount), grossP);

  return {
    foodSubtotal: fromPaise(foodP),
    foodGstRate: c.foodGstRate,
    foodGst: fromPaise(foodGstP),
    foodGstIncluded: inclusive,
    distanceKm: known ? Math.round((distanceKm as number) * 100) / 100 : null,
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
