import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

import {
  COUPONS,
  FOOD_ADDRESSES,
  SEED_FAVOURITE_DISHES,
  SEED_FAVOURITE_KITCHENS,
  SEED_ORDERS,
  findCoupon,
  findDish,
  findKitchen,
} from '@/data/food';
import type {
  Coupon,
  Dish,
  FoodAddress,
  FoodOrder,
  FoodPreferences,
  Fulfilment,
  MealWindowId,
  SpiceLevel,
} from '@/types/food';
import { clockLabel, focusWindow, minuteOfDay } from '@/types/food';

/**
 * Everything the Food module remembers between screens.
 *
 * ## Why one provider rather than three
 *
 * The cart, the preferences and the order list look separable until you write
 * the first screen: the cart's total depends on the fulfilment mode, which
 * defaults from a preference; placing an order empties the cart and prepends to
 * the order list in the same act; and the veg-only toggle changes what the feed
 * shows *and* what the cart is allowed to contain. Splitting them would mean
 * three providers reaching into each other, which is the shape this file exists
 * to avoid.
 *
 * ## One kitchen per cart
 *
 * Not a technical limit — a physical one. Two kitchens means two counters, two
 * ready times and two riders for one ₹200 order, and the food arrives cold from
 * whichever one finished first. So a dish from a second kitchen does not merge:
 * it parks in `pendingAdd` and the screen asks, because silently clearing a
 * cart is how a student loses the thali they configured three taps ago.
 *
 * ## The window is stamped, not read
 *
 * A cart records the window it was started in. Reading the live clock instead
 * would let a cart built at 3:25 pm silently become a snacks order at 3:31 —
 * with different kitchens open and different prices — while the student was
 * still choosing a payment method.
 */

/* ------------------------------------------------------------------ *
 * Shapes
 * ------------------------------------------------------------------ */

export type CartLine = {
  /** dish + options. Two thalis with different spice are two lines, not one. */
  key: string;
  dishId: string;
  qty: number;
  addOnIds: readonly string[];
  spice: SpiceLevel;
};

export type DetailedLine = CartLine & {
  dish: Dish;
  /** Dish price plus its add-ons — what one of this line costs. */
  unitPrice: number;
  lineTotal: number;
  /** "Extra curd · medium spice", or undefined when nothing was chosen. */
  note?: string;
};

export type PendingAdd = {
  dish: Dish;
  qty: number;
  addOnIds: readonly string[];
  spice: SpiceLevel;
  /** Carried through the "clear your cart?" answer, so the switch keeps it. */
  window?: MealWindowId;
};

export type AddResult = 'added' | 'conflict';

/**
 * Which of the module's three screens is showing.
 *
 * It lives here rather than inside the module because the bottom bar that
 * drives it belongs to `home.tsx` — while Food is open, the app's one tab bar
 * IS the food bar, and it has to be able to read and set this.
 */
export type FoodTab = 'home' | 'search' | 'orders';

export type FoodContextValue = {
  /**
   * The window being BROWSED.
   *
   * Not the same thing as the cart's window, and it lives here rather than in
   * the tab's own state because the pushed screens need it: a student reading
   * the dinner menu at 2 pm taps a kitchen, and that kitchen screen has to open
   * on dinner too. A route param would work for one hop and break on the next.
   */
  browseWindow: MealWindowId;
  setBrowseWindow: (id: MealWindowId) => void;

  /** Home / Search / Orders — the bottom bar's three stay-side-shaped tabs. */
  foodTab: FoodTab;
  setFoodTab: (tab: FoodTab) => void;

  /* — cart — */
  kitchenId: string | null;
  /** The window the cart was STAMPED with, or null while it is empty. */
  window: MealWindowId | null;
  lines: readonly DetailedLine[];
  count: number;
  itemTotal: number;
  discount: number;
  deliveryFee: number;
  taxes: number;
  toPay: number;
  coupon: Coupon | null;
  /** Coupons that would apply to the cart as it stands, best saving first. */
  eligibleCoupons: readonly Coupon[];
  fulfilment: Fulfilment;
  /** `null` means as-soon-as-possible. Anything else is a chosen clock time. */
  slot: string | null;
  address: FoodAddress;

  add: (dish: Dish, options?: { qty?: number; addOnIds?: readonly string[]; spice?: SpiceLevel; window?: MealWindowId }) => AddResult;
  setQty: (key: string, qty: number) => void;
  clear: () => void;
  /** Total quantity of a dish in the cart, whatever options were chosen. */
  qtyOf: (dishId: string) => number;
  setFulfilment: (mode: Fulfilment) => void;
  setSlot: (slot: string | null) => void;
  applyCoupon: (code: string | null) => void;
  setAddressId: (id: string) => void;

  /** The add that is waiting on "clear your cart?" — null when nothing is. */
  pendingAdd: PendingAdd | null;
  confirmSwitch: () => void;
  cancelSwitch: () => void;

  /* — orders — */
  orders: readonly FoodOrder[];
  /** The one order still in flight, if any. Drives the pinned card. */
  liveOrder: FoodOrder | null;
  placeOrder: (now?: Date) => FoodOrder;
  cancelOrder: (id: string, reason: string) => void;

  /* — preferences — */
  preferences: FoodPreferences;
  setPreferences: (next: Partial<FoodPreferences>) => void;

  /* — favourites — */
  favouriteDishes: readonly string[];
  favouriteKitchens: readonly string[];
  toggleFavouriteDish: (id: string) => void;
  toggleFavouriteKitchen: (id: string) => void;
};

const FoodContext = createContext<FoodContextValue | null>(null);

const DEFAULT_PREFERENCES: FoodPreferences = {
  diet: 'veg',
  vegOnly: false,
  spice: 'medium',
  allergens: ['Peanut'],
  defaultPickup: false,
};

/** 5% of the item total, rounded — the same arithmetic the receipt prints. */
function taxOn(itemTotal: number): number {
  return itemTotal === 0 ? 0 : Math.round(itemTotal * 0.05);
}

function lineKey(dishId: string, addOnIds: readonly string[], spice: SpiceLevel): string {
  return [dishId, [...addOnIds].sort().join('+'), spice].join('|');
}

/* ------------------------------------------------------------------ *
 * Provider
 * ------------------------------------------------------------------ */

export function FoodProvider({ children }: { children: React.ReactNode }) {
  const [browseWindow, setBrowseWindow] = useState<MealWindowId>(() => focusWindow(new Date()).id);
  const [foodTab, setFoodTab] = useState<FoodTab>('home');
  const [kitchenId, setKitchenId] = useState<string | null>(null);
  const [window, setWindow] = useState<MealWindowId | null>(null);
  const [rawLines, setRawLines] = useState<CartLine[]>([]);
  const [fulfilment, setFulfilmentState] = useState<Fulfilment>('delivery');
  const [slot, setSlot] = useState<string | null>(null);
  const [couponCode, setCouponCode] = useState<string | null>('STUDENT20');
  const [addressId, setAddressId] = useState<string>(FOOD_ADDRESSES[0].id);
  const [pendingAdd, setPendingAdd] = useState<PendingAdd | null>(null);

  const [orders, setOrders] = useState<readonly FoodOrder[]>(SEED_ORDERS);
  const [preferences, setPreferencesState] = useState<FoodPreferences>(DEFAULT_PREFERENCES);
  const [favouriteDishes, setFavouriteDishes] = useState<readonly string[]>(SEED_FAVOURITE_DISHES);
  const [favouriteKitchens, setFavouriteKitchens] = useState<readonly string[]>(SEED_FAVOURITE_KITCHENS);

  /* Order numbers continue the seeded series rather than restarting at 1 — a
     student whose last order was 8842 and whose next is 1 has been shown a
     seam in the product. */
  const nextOrderNumber = useRef(8843);

  /* — derived cart — */

  const lines: DetailedLine[] = useMemo(
    () =>
      rawLines.flatMap((line) => {
        const dish = findDish(line.dishId);
        if (!dish) return [];
        const addOns = (dish.addOns ?? []).filter((addOn) => line.addOnIds.includes(addOn.id));
        const unitPrice = dish.price + addOns.reduce((sum, addOn) => sum + addOn.price, 0);
        const parts = addOns.map((addOn) => addOn.label);
        if (!dish.spiceFixed && line.spice !== 'medium') parts.push(`${line.spice} spice`);
        return [
          {
            ...line,
            dish,
            unitPrice,
            lineTotal: unitPrice * line.qty,
            note: parts.length ? parts.join(', ') : undefined,
          },
        ];
      }),
    [rawLines],
  );

  const itemTotal = useMemo(() => lines.reduce((sum, line) => sum + line.lineTotal, 0), [lines]);
  const count = useMemo(() => lines.reduce((sum, line) => sum + line.qty, 0), [lines]);

  const kitchen = kitchenId ? findKitchen(kitchenId) : undefined;
  const address = FOOD_ADDRESSES.find((entry) => entry.id === addressId) ?? FOOD_ADDRESSES[0];

  /* Pickup is free, always and visibly. It is the module's one real saving and
     it only reads as one if the fee line goes to zero rather than disappearing. */
  const deliveryFee = fulfilment === 'pickup' ? 0 : (address.deliveryFee ?? kitchen?.deliveryFee ?? 0);
  const taxes = taxOn(itemTotal);

  const couponEligible = useCallback(
    (candidate: Coupon) =>
      !candidate.blockedReason &&
      itemTotal >= candidate.minimum &&
      (!candidate.pickupOnly || fulfilment === 'pickup'),
    [itemTotal, fulfilment],
  );

  const eligibleCoupons = useMemo(
    () => COUPONS.filter(couponEligible).sort((a, b) => b.discount - a.discount),
    [couponEligible],
  );

  const coupon = useMemo(() => {
    const chosen = couponCode ? findCoupon(couponCode) : undefined;
    // A coupon that no longer qualifies is dropped from the maths but kept in
    // `couponCode`, so the coupons screen can still explain why it is not
    // running instead of the code vanishing without a word.
    return chosen && couponEligible(chosen) ? chosen : null;
  }, [couponCode, couponEligible]);

  const discount = coupon?.discount ?? 0;
  const toPay = Math.max(0, itemTotal + deliveryFee + taxes - discount);

  /* — cart actions — */

  const commitAdd = useCallback((dish: Dish, next: PendingAdd, windowId?: MealWindowId) => {
    setKitchenId(dish.kitchenId);
    setWindow((current) => current ?? windowId ?? null);
    setRawLines((current) => {
      const key = lineKey(next.dish.id, next.addOnIds, next.spice);
      const existing = current.find((line) => line.key === key);
      if (existing) {
        return current.map((line) => (line.key === key ? { ...line, qty: line.qty + next.qty } : line));
      }
      return [
        ...current,
        { key, dishId: next.dish.id, qty: next.qty, addOnIds: next.addOnIds, spice: next.spice },
      ];
    });
  }, []);

  const add: FoodContextValue['add'] = useCallback(
    (dish, options) => {
      const next: PendingAdd = {
        dish,
        qty: options?.qty ?? 1,
        addOnIds: options?.addOnIds ?? [],
        spice: options?.spice ?? preferences.spice,
        window: options?.window,
      };

      if (kitchenId && kitchenId !== dish.kitchenId && rawLines.length > 0) {
        setPendingAdd(next);
        return 'conflict';
      }

      commitAdd(dish, next, options?.window);
      return 'added';
    },
    [kitchenId, rawLines.length, preferences.spice, commitAdd],
  );

  const confirmSwitch = useCallback(() => {
    if (!pendingAdd) return;
    setRawLines([]);
    setKitchenId(pendingAdd.dish.kitchenId);
    setWindow(null);
    // Straight into the same commit path, so a switched cart is built exactly
    // the way a first one is.
    commitAdd(pendingAdd.dish, pendingAdd, pendingAdd.window);
    setPendingAdd(null);
  }, [pendingAdd, commitAdd]);

  const cancelSwitch = useCallback(() => setPendingAdd(null), []);

  const setQty = useCallback((key: string, qty: number) => {
    setRawLines((current) => {
      const next = qty <= 0 ? current.filter((line) => line.key !== key) : current.map((line) => (line.key === key ? { ...line, qty } : line));
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setRawLines([]);
    setKitchenId(null);
    setWindow(null);
    setSlot(null);
  }, []);

  const qtyOf = useCallback(
    (dishId: string) => rawLines.filter((line) => line.dishId === dishId).reduce((sum, line) => sum + line.qty, 0),
    [rawLines],
  );

  const setFulfilment = useCallback((mode: Fulfilment) => {
    setFulfilmentState(mode);
    // The slot belongs to the mode that produced it — a 1:45 pm delivery slot is
    // not a 1:45 pm counter time — so switching modes drops back to ASAP rather
    // than carrying a time that now means something else.
    setSlot(null);
  }, []);

  const applyCoupon = useCallback((code: string | null) => setCouponCode(code), []);

  /* — cart becomes an order — */

  const placeOrder = useCallback(
    (now: Date = new Date()) => {
      const id = String(nextOrderNumber.current++);
      const orderKitchen = kitchenId ? findKitchen(kitchenId) : undefined;
      const isPickup = fulfilment === 'pickup';
      const readyAt = clockLabel(minuteOfDay(now) + (orderKitchen?.prepMinutes ?? 10));

      const order: FoodOrder = {
        id,
        kitchenId: kitchenId ?? 'annapurna',
        kitchenName: orderKitchen?.name ?? 'Kitchen',
        status: 'confirmed',
        fulfilment,
        window: window ?? browseWindow,
        lines: lines.map((line) => ({
          dishId: line.dish.id,
          name: line.dish.name,
          qty: line.qty,
          price: line.lineTotal,
          diet: line.dish.diet,
          note: line.note,
        })),
        itemTotal,
        deliveryFee,
        taxes,
        discount,
        couponCode: coupon?.code,
        paid: toPay,
        placedLabel: `Today, ${clockLabel(minuteOfDay(now))}`,
        monthLabel: 'This month',
        paymentLabel: 'GPay',
        /* Four digits, derived from the order number so the same order always
           shows the same code — a code that changed on re-render would be worse
           than no code at all. */
        pickupCode: isPickup ? String(4000 + (Number(id) % 1000)).padStart(4, '0') : undefined,
        timeline: [
          { label: 'Order placed', at: clockLabel(minuteOfDay(now)) },
          { label: 'Confirmed by the kitchen', at: clockLabel(minuteOfDay(now) + 2) },
          { label: 'Preparing', note: `Ready by about ${readyAt}` },
          isPickup ? { label: 'Ready at the counter' } : { label: 'On the way' },
          isPickup ? { label: 'Picked up' } : { label: 'Delivered' },
        ],
      };

      setOrders((current) => [order, ...current]);
      clear();
      return order;
    },
    [kitchenId, fulfilment, window, browseWindow, lines, itemTotal, deliveryFee, taxes, discount, coupon, toPay, clear],
  );

  const cancelOrder = useCallback((id: string, reason: string) => {
    setOrders((current) =>
      current.map((order) =>
        order.id === id
          ? {
              ...order,
              status: 'refunded',
              refund: {
                amount: order.paid,
                destination: 'the account you paid from',
                expectedBy: 'in 3–5 working days',
                reference: `RFND ${order.id} 2214`,
                status: 'initiated',
                reason,
              },
            }
          : order,
      ),
    );
  }, []);

  const liveOrder = useMemo(
    () =>
      orders.find((order) =>
        ['placed', 'confirmed', 'preparing', 'ready', 'onTheWay', 'pending'].includes(order.status),
      ) ?? null,
    [orders],
  );

  /* — preferences and favourites — */

  const setPreferences = useCallback((next: Partial<FoodPreferences>) => {
    setPreferencesState((current) => ({ ...current, ...next }));
  }, []);

  const toggleFavouriteDish = useCallback((id: string) => {
    setFavouriteDishes((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]));
  }, []);

  const toggleFavouriteKitchen = useCallback((id: string) => {
    setFavouriteKitchens((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );
  }, []);

  const value = useMemo<FoodContextValue>(
    () => ({
      browseWindow,
      setBrowseWindow,
      foodTab,
      setFoodTab,
      kitchenId,
      window,
      lines,
      count,
      itemTotal,
      discount,
      deliveryFee,
      taxes,
      toPay,
      coupon,
      eligibleCoupons,
      fulfilment,
      slot,
      address,
      add,
      setQty,
      clear,
      qtyOf,
      setFulfilment,
      setSlot,
      applyCoupon,
      setAddressId,
      pendingAdd,
      confirmSwitch,
      cancelSwitch,
      orders,
      liveOrder,
      placeOrder,
      cancelOrder,
      preferences,
      setPreferences,
      favouriteDishes,
      favouriteKitchens,
      toggleFavouriteDish,
      toggleFavouriteKitchen,
    }),
    [
      browseWindow,
      foodTab,
      kitchenId,
      window,
      lines,
      count,
      itemTotal,
      discount,
      deliveryFee,
      taxes,
      toPay,
      coupon,
      eligibleCoupons,
      fulfilment,
      slot,
      address,
      add,
      setQty,
      clear,
      qtyOf,
      setFulfilment,
      applyCoupon,
      pendingAdd,
      confirmSwitch,
      cancelSwitch,
      orders,
      liveOrder,
      placeOrder,
      cancelOrder,
      preferences,
      setPreferences,
      favouriteDishes,
      favouriteKitchens,
      toggleFavouriteDish,
      toggleFavouriteKitchen,
    ],
  );

  return <FoodContext.Provider value={value}>{children}</FoodContext.Provider>;
}

export function useFood(): FoodContextValue {
  const value = useContext(FoodContext);
  if (!value) throw new Error('useFood must be used inside FoodProvider');
  return value;
}
