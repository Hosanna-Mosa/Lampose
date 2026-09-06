import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useFoodCatalogue } from '@/context/FoodCatalogueContext';
import { deliveryFeeFor, packagingChargeOf, splitOptions } from '@/services/adapters/food.adapter';
import {
  cancelFoodOrder,
  fetchFoodOrder,
  fetchMyFoodOrders,
  placeFoodOrder,
  startFoodPayment,
  type PaymentIntent,
  type ServerFoodOrder,
} from '@/services/api/foodOrders.api';
import type {
  Dish,
  FoodAddress,
  FoodOrder,
  FoodPreferences,
  Fulfilment,
  SpiceLevel,
  FoodOrderStatus,
  Kitchen,
} from '@/types/food';
import { clockLabel, minuteOfDay } from '@/types/food';
import { useAuth } from '@/context/AuthContext';
import { useFoodFavourites } from '@/services/hooks/useFoodFavourites';
import { checkZone } from '@/services/api/zones.api';
import { addressLine, addressTitle, fetchAddresses, type SavedAddress } from '@/services/api/addresses.api';

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
 * ## The bill shows the SERVER'S arithmetic, and only that
 *
 * `foodCustomerOrder.controller.js` prices every order from `food_products`
 * and `food_restaurants` and adds exactly three things: the item total, the
 * restaurant's packaging charge and the delivery fee. There is no tax and
 * there is no discount — the place-order request carries no coupon field and
 * the controller writes `discount: 0` on every row it creates.
 *
 * This file used to add 5% of the item total as "Taxes and charges" and to
 * start every session with `STUDENT20` already applied, neither of which the
 * server had ever heard of, while leaving out the packaging charge it really
 * does collect. The number under the Pay button was therefore a number nobody
 * would be charged, and the receipt that arrived afterwards contradicted it.
 * Every term below now has a counterpart in that controller, which is the only
 * way a cart and a receipt can agree.
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
  /** Home / Search / Orders — the bottom bar's three stay-side-shaped tabs. */
  foodTab: FoodTab;
  setFoodTab: (tab: FoodTab) => void;

  /* — cart — */
  kitchenId: string | null;
  lines: readonly DetailedLine[];
  count: number;
  itemTotal: number;
  /**
   * What the kitchen will charge to pack this order, or NULL when its own row
   * has not been read yet.
   *
   * Null rather than zero, and the two mean different things: zero is a
   * kitchen that packs for free and prints no line, null is a figure nobody
   * has told us and `toPay` is short by it. In practice the cart cannot hold a
   * line from a kitchen whose detail response has not arrived — the dishes
   * come from that same response — so null is the empty cart's answer.
   */
  packagingCharge: number | null;
  deliveryFee: number;
  /**
   * Items + packaging + delivery, which is the whole of it.
   *
   * The same three terms `foodCustomerOrder.controller.js` adds up, in the
   * same order, from the same rows. There is no tax line and no discount: this
   * app used to add 5% of the item total under "Taxes and charges" and take a
   * coupon off the bottom, and the server charged neither — so the green Pay
   * button quoted a number that was never going to appear on the order.
   */
  toPay: number;
  fulfilment: Fulfilment;
  /**
   * The address this order is going to, or NULL when none has been chosen.
   *
   * Null is the ordinary state of a new cart. It used to be impossible — the
   * context defaulted to a hardcoded fixture — which is exactly why the
   * checkout had nothing to gate on and every order went to "Block C · Room
   * 214". Screens that show it must handle null; the checkout refuses to
   * advance on it.
   */
  address: FoodAddress | null;
  /** The book to choose from. Empty until the diner saves one. */
  addressChoices: readonly FoodAddress[];
  /** True once an address has actually been picked. The checkout's gate. */
  hasAddress: boolean;
  /** Re-read the book — the picker calls this on returning from the editor. */
  refreshAddresses: () => Promise<void>;

  add: (dish: Dish, options?: { qty?: number; addOnIds?: readonly string[]; spice?: SpiceLevel }) => AddResult;
  setQty: (key: string, qty: number) => void;
  clear: () => void;
  /** Total quantity of a dish in the cart, whatever options were chosen. */
  qtyOf: (dishId: string) => number;
  setFulfilment: (mode: Fulfilment) => void;
  setAddressId: (id: string) => void;

  /** The add that is waiting on "clear your cart?" — null when nothing is. */
  pendingAdd: PendingAdd | null;
  confirmSwitch: () => void;
  cancelSwitch: () => void;

  /* — orders — */
  orders: readonly FoodOrder[];
  /**
   * Read the diner's own orders back from the server.
   *
   * Runs on its own when a session appears and when the Orders tab is opened;
   * exposed for the same reason `refreshAddresses` is, so a screen that has a
   * reason to believe the list has moved on can ask.
   */
  refreshOrders: () => Promise<void>;
  /** The one order still in flight, if any. Drives the pinned card. */
  liveOrder: FoodOrder | null;
  /**
   * Send the cart to the kitchen.
   *
   * Async because it is a real request now: the server prices the order from
   * `food_products`, writes it to `food_orders` and rings the restaurant.
   * Rejects with the server's own reason — a sold-out dish, a closed kitchen,
   * an order under the minimum — which the payment screen shows verbatim
   * rather than paraphrasing.
   */
  /**
   * @param mode how it is being paid for. `cod` sends the order to the
   *   kitchen straight away; `online` HOLDS it — nobody is told until a
   *   verified signature says the money arrived. Either way, no rider is
   *   searched for yet: that now waits for the kitchen to accept and quote a
   *   prep time, see `foodDispatch.service.js`'s own header. The screen
   *   picks the mode from the method the student chose.
   */
  placeOrder: (now?: Date, mode?: 'online' | 'cod') => Promise<{ order: FoodOrder; nextStep: 'track' | 'payment' }>;
  /**
   * Re-read one order from the server.
   *
   * The tracking screen calls this on a timer while an order is live. It is
   * how the diner learns a rider was found, because there is no socket in this
   * app — the delivery flow's realtime layer serves the rider's fifteen-second
   * offer, and a diner watching a tracking screen is well served by a poll
   * that costs one request every eight seconds and works on any network.
   *
   * Resolves to null when the order has gone. Never throws: a failed refresh
   * on a bus is not something to put on screen.
   */
  refreshOrder: (id: string) => Promise<FoodOrder | null>;
  /**
   * Open the payment for an order that is waiting on one.
   *
   * Returns what the checkout WebView needs. The amount is the SERVER'S — this
   * app never names a figure, which is the same rule that governs placing the
   * order in the first place.
   */
  startPayment: (id: string) => Promise<PaymentIntent>;
  cancelOrder: (id: string, reason: string) => Promise<void>;

  /*
   * — order-status notifications —
   *
   * There is no server-side feed for this: nothing in the food schema is an
   * "event" the way a visit-request reply is. What every order already carries
   * is its own `timeline`, so a notification IS a newly-reached timeline step,
   * counted client-side against a locally-remembered watermark. See
   * `FOOD_NOTIFS_SEEN_KEY` below for why that is honest rather than a hack.
   */
  /** Reached timeline steps, across every order, that have not been seen. */
  foodUnread: number;
  /** Call when the food notifications screen opens — clears `foodUnread`. */
  markFoodNotificationsSeen: () => void;

  /* — preferences — */
  preferences: FoodPreferences;
  setPreferences: (next: Partial<FoodPreferences>) => void;

  /*
   * — favourites —
   *
   * Backed by the ACCOUNT, not by this component's state. Until now these were
   * two `useState` arrays: a favourite did not survive backgrounding the app,
   * let alone a reinstall or signing in on a second handset, and nothing was
   * ever sent anywhere. `useFoodFavourites` is the real store; this context
   * re-exports it so every heart in the app goes through one place.
   *
   * The id arrays are kept for the callers that only ask "is this one
   * hearted", and the hydrated lists are what the Favourites screen draws —
   * see the hook for why the server sends whole dishes rather than ids.
   */
  favouriteDishes: readonly string[];
  favouriteKitchens: readonly string[];
  toggleFavouriteDish: (id: string) => void;
  toggleFavouriteKitchen: (id: string) => void;
  isFavouriteDish: (id: string) => boolean;
  isFavouriteKitchen: (id: string) => boolean;
  /** The dishes themselves, as the server holds them. */
  favouriteDishList: readonly Dish[];
  favouriteKitchenList: readonly Kitchen[];
  /** Hearted, but their kitchen is not listed right now. */
  favouritesUnavailable: number;
  favouritesLoading: boolean;
  refreshFavourites: () => void;
};

const FoodContext = createContext<FoodContextValue | null>(null);

/**
 * Where the diner's food preferences live between launches.
 *
 * The same `@lampose/…` AsyncStorage convention the theme preference and the
 * chosen locality already use. Preferences were held in `useState` alone until
 * now, so veg-only, spice and every declared allergen were forgotten the
 * moment the app was killed — and an allergen a student had to re-declare on
 * every launch is one they will eventually stop trusting.
 */
const FOOD_PREFERENCES_KEY = '@lampose/food-preferences';

/**
 * The watermark behind `foodUnread`.
 *
 * One number per order: how many of its timeline steps were already reached
 * the last time the notifications screen was opened. Reading it back and
 * comparing against the order's CURRENT count of reached steps is what tells
 * the bell "two things happened since you last looked" without a server ever
 * having to flag anything as read — there is nothing on `food_orders` for a
 * client to write that would mean that, and there does not need to be: this
 * is exactly the same "read is a watermark" idea `/notifications` uses,
 * moved local because the events here are derived, not fetched.
 */
const FOOD_NOTIFS_SEEN_KEY = '@lampose/food-notifications-seen';

const DEFAULT_PREFERENCES: FoodPreferences = {
  diet: 'veg',
  vegOnly: false,
  spice: 'medium',
  /*
    EMPTY, and it has to be.

    This list used to open with 'Peanut' for everybody. That is a dietary claim
    the app invents about a person who never made it — and the dish screen acts
    on it, flagging peanut dishes as a risk to students who eat peanuts daily.
    An allergen is something a diner declares; a default is us declaring one on
    their behalf, and the one time it matters it will be the one they did not
    declare rather than the one we guessed.
  */
  allergens: [],
  defaultPickup: false,
};

/**
 * The two timeline step labels the order screen matches on.
 *
 * `FoodOrder` carries the kitchen's quote and its refusal nowhere else. Both
 * are events in the order's own history, so both are written onto the step
 * they belong to — the quote as the note under "Preparing", the refusal as a
 * step of its own with the kitchen's reason underneath it. The tracking screen
 * finds them by label, which is the same way it already finds the arrival
 * step, and these constants are exported so the two ends cannot drift apart.
 */
export const TIMELINE_STEP = {
  preparing: 'Preparing',
  refused: 'Refused by the kitchen',
} as const;

function lineKey(dishId: string, addOnIds: readonly string[], spice: SpiceLevel): string {
  return [dishId, [...addOnIds].sort().join('+'), spice].join('|');
}

/* ------------------------------------------------------------------ *
 * Provider
 * ------------------------------------------------------------------ */

export function FoodProvider({ children }: { children: React.ReactNode }) {
  /* The catalogue is the data source; this context is the cart and the
     order history built on top of it, which is why it nests inside. */
  const { findDish, findKitchen } = useFoodCatalogue();
  const [foodTab, setFoodTab] = useState<FoodTab>('home');
  const [kitchenId, setKitchenId] = useState<string | null>(null);
  const [rawLines, setRawLines] = useState<CartLine[]>([]);
  const [fulfilment, setFulfilmentState] = useState<Fulfilment>('delivery');
  /*
    `slot` is gone.
    
    It was a scheduled time the server has no field for — `PlaceOrderRequest`
    carries no slot, `placeOrder` never sent one, and `food_orders` has nowhere
    to put one. Choosing 9:45 pm and choosing "as soon as possible" produced
    byte-identical orders. It was a decision the product asked for and then
    discarded, and the screen that asked for it is gone with it.
  */
  /*
    NOTHING is chosen until somebody chooses it.

    This used to be `FOOD_ADDRESSES[0].id` — the "Block C · Room 214" fixture —
    so an address always existed and "none selected" could not be represented
    at all. That is why every order ever placed went to a hardcoded room, and
    why there was nothing for a checkout to gate on.

    Empty string means unchosen. The picker sets it; the cart and the payment
    screen refuse to move until it is set.
  */
  const [addressId, setAddressId] = useState<string>('');
  const [pendingAdd, setPendingAdd] = useState<PendingAdd | null>(null);

  /* Empty, not seeded. The order history a student sees has to be their own —
     a fabricated receipt is a number they will try to reconcile against a bank
     statement. It fills from the server on launch (`refreshOrders`), and an
     order placed in this session is prepended optimistically before the list
     has caught up. */
  const [orders, setOrders] = useState<readonly FoodOrder[]>([]);
  const [preferences, setPreferencesState] = useState<FoodPreferences>(DEFAULT_PREFERENCES);

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

  /*
    ── The real address book ────────────────────────────────────────────────

    `FOOD_ADDRESSES` is three hardcoded fixtures with no coordinates, and until
    now it was the ONLY source — `setAddressId` was exposed on this context
    with zero call sites, so every order ever placed went to fixture one.

    Saved addresses now come from `/v2/customers/me/addresses` and are mapped
    into the same `FoodAddress` shape every screen already reads, so nothing
    downstream had to change. The fixtures are no longer a fallback for
    anything: a signed-out diner has an EMPTY book, and the picker answers that
    by asking them to sign in rather than by offering somebody else's room.
  */
  const { status: authStatus } = useAuth();
  /*
   * Favourites live on the account. Gated on the session rather than left to
   * 401 on every food screen: a signed-out diner sees empty hearts and is
   * asked to sign in at the moment they tap one, which is where the ask
   * belongs — not as a wall in front of a menu.
   */
  const favourites = useFoodFavourites(authStatus === 'signedIn');

  const favouriteDishes = useMemo(
    () => favourites.dishes.map((dish) => dish.id),
    [favourites.dishes],
  );
  const favouriteKitchens = useMemo(
    () => favourites.kitchens.map((kitchen) => kitchen.id),
    [favourites.kitchens],
  );

  const signedIn = authStatus === 'signedIn';

  const [saved, setSaved] = useState<FoodAddress[]>([]);

  /**
   * Re-read the book from the server.
   *
   * Exposed because the picker returns from the address editor and has to see
   * what was just saved — a list that still lacks it is a list somebody saves
   * into twice. Also runs on sign-in, below.
   */
  const refreshAddresses = useCallback(async () => {
    if (!signedIn) {
      setSaved([]);
      return;
    }
    try {
      const rows = await fetchAddresses();
      setSaved(rows.map(toFoodAddress));
    } catch {
      /* A book we could not load is not an empty book — the previous list
         stands rather than the cart losing its address to a flaky network. */
    }
  }, [signedIn]);

  useEffect(() => {
    if (!signedIn) {
      setSaved([]);
      return;
    }
    let cancelled = false;
    fetchAddresses()
      .then((rows) => {
        if (cancelled) return;
        setSaved(rows.map(toFoodAddress));
      })
      .catch(() => {
        /* A book we could not load is not an empty book. Left alone so the
           fallback below keeps the cart working. */
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  /*
    ── Serviceability, decided by the SERVER ────────────────────────────────

    An address carries a `serviceable` flag of its own, and that flag is
    optimistic until something contradicts it. The admin console draws the real
    answer — service zones, in `service_zones` — and `GET /v2/zones/check` is
    the one place that knows it, because the rule includes active hours and
    allowed services as well as the geometry.

    The verdict is kept per ADDRESS rather than for the selected one. It used
    to be a single answer about whatever the cart was pointing at, which meant
    the picker — the one screen whose whole job is choosing BETWEEN addresses —
    drew every row from the raw book, where `serviceable` is hardcoded true.
    The "we do not deliver here yet" line under those rows could never appear,
    and a diner could pick the one address we cannot reach and find out after
    paying for it.

    Three states, and the middle one is the one to be careful with:
    serviceable, NOT serviceable, and NOT YET ANSWERED. An address with no pin,
    one whose check has not come back, and one whose check failed on a bad
    network all keep their optimistic `true` — "we have no coordinate for this
    place" is not evidence of a boundary, and turning a missing field into a
    refusal is how a lost sale is manufactured. Only a definite `false` from
    the server blocks anything.

    ── And a `false` is not necessarily about geography ─────────────────────

    `serviceable: false` answers exactly one question — "is this point inside a
    zone that is live for food RIGHT NOW" — and it comes back false for two
    quite different reasons. `findZoneFor` filters every candidate through
    `isWithinActiveHours`, so a pin squarely inside a zone whose hours run
    10:00–22:00 is unserviceable at 23:00 and serviceable again at breakfast.
    The route sends `serviceable`, a pricing multiplier and `zone: null`, and
    that null is the same null an out-of-area pin gets, so nothing in the
    response tells the two apart. The backend says as much in `listLiveZones`,
    where it refuses to apply the hours filter because a closed zone is "a
    'closed right now' fact, not a 'not our area' one".

    The note below therefore states the fact we actually have — we are not
    delivering there at this moment — and names both possible reasons rather
    than asserting the boundary one. It used to read "This address is outside
    the area Lampose currently delivers to", which is a claim about the map
    that is simply false for every address that is only closed for the night.
  */
  const [zoneVerdicts, setZoneVerdicts] = useState<Record<string, boolean>>({});
  /* Which points have already been asked about, so a book of six addresses
     costs six requests once rather than six on every render. A check that
     FAILED is dropped from the set again, so re-opening the picker asks. */
  const zonesAsked = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    for (const entry of saved) {
      const { lat, lng } = entry;
      if (lat === undefined || lng === undefined) continue;
      const key = `${lat},${lng}`;
      if (zonesAsked.current.has(key)) continue;
      zonesAsked.current.add(key);
      checkZone(lat, lng, 'food')
        .then((res) => {
          if (cancelled) return;
          setZoneVerdicts((current) => ({ ...current, [key]: res.serviceable }));
        })
        .catch(() => {
          /* A check that could not be made is not a refusal. */
          zonesAsked.current.delete(key);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [saved]);

  /*
    The book, with the server's verdict stamped onto the row the diner is
    actually looking at.

    The fixtures are gone from this path entirely: an invented address is worse
    than none, because none can be asked for and an invention cannot be
    corrected.
  */
  const choices: readonly FoodAddress[] = useMemo(
    () =>
      saved.map((entry) => {
        const key = entry.lat !== undefined && entry.lng !== undefined ? `${entry.lat},${entry.lng}` : null;
        if (!key || zoneVerdicts[key] !== false) return entry;
        return {
          ...entry,
          serviceable: false,
          unserviceableNote:
            'We are not delivering to this address right now — it is either outside our area or inside one that is closed at this hour.',
        };
      }),
    [saved, zoneVerdicts],
  );

  /*
    The one picked out of the book, or NULL when nothing has been chosen —
    the ordinary state of a new cart, and the state the whole checkout gate
    hangs on.
  */
  const address = useMemo(
    () => choices.find((entry) => entry.id === addressId) ?? null,
    [choices, addressId],
  );

  /*
    ── The delivery fee, decided in ONE place ───────────────────────────────

    `deliveryFeeFor` is that place, and it is the mirror of the rule in
    `foodCustomerOrder.controller.js`: a `free_above` kitchen charges nothing
    once the items reach its threshold, every other scheme charges its flat
    amount, and the per-kilometre rate a `distance_based` partner configures is
    never applied by that endpoint and so is never applied here.

    This line used to read `address?.deliveryFee ?? kitchen?.deliveryFee`,
    which was wrong twice over. The address's own fee is fixture data — no
    saved address the server sends carries one, and the checkout prices
    delivery from the RESTAURANT — and the kitchen's flat amount ignores the
    waiver, so the kitchen screen said "Free" on a ₹250 basket while the cart
    two taps later charged ₹19 for the same order.

    Pickup is free, always and visibly. It is the module's one real saving and
    it only reads as one if the fee line goes to zero rather than disappearing.
  */
  const deliveryFee = fulfilment === 'pickup' || !kitchen ? 0 : deliveryFeeFor(kitchen, itemTotal);

  /*
    Packaging is charged on EVERY order, pickup included — the controller adds
    it before it looks at the fulfilment mode. Null while the kitchen's own row
    has not arrived, because a zero printed there would be a promise the server
    is about to break; see `packagingChargeOf`.
  */
  const packagingCharge = kitchen ? packagingChargeOf(kitchen) ?? null : null;

  const toPay = itemTotal + (packagingCharge ?? 0) + deliveryFee;

  /* — cart actions — */

  const commitAdd = useCallback((dish: Dish, next: PendingAdd) => {
    setKitchenId(dish.kitchenId);
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
      };

      if (kitchenId && kitchenId !== dish.kitchenId && rawLines.length > 0) {
        setPendingAdd(next);
        return 'conflict';
      }

      commitAdd(dish, next);
      return 'added';
    },
    [kitchenId, rawLines.length, preferences.spice, commitAdd],
  );

  const confirmSwitch = useCallback(() => {
    if (!pendingAdd) return;
    setRawLines([]);
    setKitchenId(pendingAdd.dish.kitchenId);
    // Straight into the same commit path, so a switched cart is built exactly
    // the way a first one is.
    commitAdd(pendingAdd.dish, pendingAdd);
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
  }, []);

  const qtyOf = useCallback(
    (dishId: string) => rawLines.filter((line) => line.dishId === dishId).reduce((sum, line) => sum + line.qty, 0),
    [rawLines],
  );

  const setFulfilment = useCallback((mode: Fulfilment) => {
    setFulfilmentState(mode);
  }, []);

  /* — cart becomes an order — */

/**
 * A stored order, in the shape the app's order screens already render.
 *
 * The server's vocabulary is not the app's — it has no `confirmed`. Mapped
 * rather than cast, so a status the app cannot draw becomes `placed` instead
 * of an empty screen.
 *
 * `picked_up` is deliberately missing from this table: it is the one word
 * whose meaning depends on how the order is being fulfilled, and `appStatus`
 * below is where that is decided.
 *
 * `rejected` maps to itself. It used to land on `cancelled`, because the app's
 * own union had no word for a refusal — so a kitchen turning an order down was
 * reported to the diner as something they had done themselves, in the Orders
 * list and on the card pinned to Home. The two are now separate the whole way
 * through, and the tracking screen already had the kitchen's reason to show
 * under it.
 */
const SERVER_STATUS: Record<string, FoodOrderStatus> = {
  placed: 'placed',
  accepted: 'confirmed',
  preparing: 'preparing',
  ready: 'ready',
  delivered: 'delivered',
  rejected: 'rejected',
  cancelled: 'cancelled',
};

/**
 * One server word, two app states — and the difference is the whole order.
 *
 * `picked_up` means the food has left the counter. For a PICKUP that is the
 * end of it: the diner is holding their dinner. For a DELIVERY it is the
 * moment the journey STARTS, and reading it as an ending is how a delivery
 * order announced "Delivered" the second a rider lifted the bag — the tracking
 * screen stopped polling, the map and the rider card vanished, and the diner
 * was congratulated on food that was still ten minutes down the road.
 *
 * So a picked-up delivery is `onTheWay`, which the whole app already knows how
 * to draw: it is in the live list here and on the tracking screen, the chip
 * says "On the way", and the timeline already stands on the same step.
 */
function appStatus(status: string, isPickup: boolean): FoodOrderStatus {
  if (status === 'picked_up') return isPickup ? 'pickedUp' : 'onTheWay';
  return SERVER_STATUS[status] ?? 'placed';
}

/**
 * What an order is called while nothing can name it.
 *
 * The server's order row names a `restaurantId`, and turning that into a
 * restaurant is the catalogue's job — which means there is a window on every
 * launch where the orders have arrived and the kitchen feed has not. This is
 * what fills the heading in that window. It is a placeholder and it is meant
 * to be replaced: see the naming effect in the provider.
 */
const UNNAMED_KITCHEN = 'Kitchen';

/**
 * A GeoJSON point down to the pair the map draws, or null.
 *
 * Guarded rather than trusted: `location` is optional on every row, absent on
 * an order placed before it existed, and a half-written `{ type: 'Point' }`
 * with no coordinates would otherwise reach the projection as `undefined[0]`.
 */
function coordinatesOf(point?: { coordinates?: number[] } | null): [number, number] | null {
  const pair = point?.coordinates;
  return Array.isArray(pair) && pair.length === 2 && pair.every(Number.isFinite)
    ? [pair[0], pair[1]]
    : null;
}


/**
 * The timeline, built from what ACTUALLY happened.
 *
 * The old version was five hardcoded labels with a timestamp on the first, and
 * the renderer filled every dot before the current status. That made the list a
 * restatement of one field rather than a history: an order that reached
 * `delivered` claimed the kitchen had confirmed and prepared it whether or not
 * those events ever occurred, and it showed no time against any of them — so a
 * diner could not tell a kitchen that took twenty minutes from one that took
 * two, and a step that was genuinely skipped looked identical to one that was
 * completed.
 *
 * The server has kept `statusHistory` — `{ status, at, by }` per transition —
 * all along, and `customerView` has always sent it. This reads it. A step is
 * marked done because there is an event saying so, never because a later step
 * has one, and its timestamp is that event's.
 *
 * The last two steps differ by mode: a diner walking to a counter and one
 * waiting in their room are watching for different things.
 */
function buildTimeline(
  row: ServerFoodOrder,
  isPickup: boolean,
  placedFallback: string,
/* `done` OPTIONAL, because the no-history fallback below deliberately omits
   it — an unset `done` is what tells the renderer to infer from the index. */
): { label: string; at?: string; done?: boolean }[] {
  const history = Array.isArray(row.statusHistory) ? row.statusHistory : [];
  /* First occurrence wins. A status can legitimately repeat — an order put
     back to `preparing` after a correction — and the diner is being told when
     the step was reached, not when it was last touched. */
  const firstAt = (status: string): string | undefined => {
    const event = history.find((h) => h.status === status);
    if (!event?.at) return undefined;
    const when = new Date(event.at);
    return Number.isNaN(when.getTime()) ? undefined : clockLabel(minuteOfDay(when));
  };

  const step = (label: string, ...statuses: string[]) => {
    const found = statuses.map(firstAt).find(Boolean);
    return { label, ...(found ? { at: found } : null), done: !!found };
  };

  /*
   * A REFUSED order stops where it was refused.
   *
   * The kitchen never started, so listing Preparing and Delivered under it —
   * even unticked — describes a journey that was never going to happen. The
   * kitchen's own `rejectionReason` rides on the step as its note: it is the
   * only sentence anybody has about why, and the app has nowhere else to put
   * it. The tracking screen reads both back by `TIMELINE_STEP.refused`.
   */
  if (row.status === 'rejected') {
    const refusedAt = firstAt('rejected');
    return [
      { label: 'Order placed', at: firstAt('placed') ?? placedFallback, done: true },
      {
        label: TIMELINE_STEP.refused,
        ...(refusedAt ? { at: refusedAt } : null),
        ...(row.rejectionReason ? { note: row.rejectionReason } : null),
        done: true,
      },
    ];
  }

  /*
   * The kitchen's OWN quote, turned into a time of day.
   *
   * `promisedMinutes` is what the cook typed when they accepted, counted from
   * that moment — so the answer needs the `accepted` event as well as the
   * number, and there is no answer at all until the kitchen has accepted. The
   * head of the tracking screen reads this note; when the kitchen gave no
   * quote there is no note, and the head says nothing about a time rather than
   * the "soon" it used to print for every order in the product.
   *
   * Dropped once the food is ready, because a forecast of a moment that has
   * already arrived is noise sitting next to the step that says it arrived.
   */
  const acceptedAt = (() => {
    const event = history.find((h) => h.status === 'accepted');
    if (!event?.at) return null;
    const when = new Date(event.at);
    return Number.isNaN(when.getTime()) ? null : when;
  })();
  const promisedMinutes = Number(row.promisedMinutes) || 0;
  const readyBy =
    acceptedAt && promisedMinutes > 0 && ['accepted', 'preparing'].includes(row.status)
      ? `Ready by about ${clockLabel(minuteOfDay(acceptedAt) + promisedMinutes)}`
      : undefined;

  /*
   * The kitchen's own accept is no longer a step a diner watches for.
   *
   * There used to be a "Confirmed by the kitchen" row between this one and
   * Preparing — accurate, but a checkpoint nobody needed: a diner cannot do
   * anything with "the kitchen has seen it" that they could not already do
   * with "the kitchen is cooking it". So `accepted` now feeds THIS step
   * instead of one of its own — Preparing ticks the moment the kitchen takes
   * the order, whether or not it has visibly started, which is the same
   * merge Food-Partner's own new-order sheet made on the restaurant's side
   * (see its comment on why the accept/reject decision moved off that
   * screen). `accepted` is checked first because it is the earlier of the
   * two events when both exist.
   */
  const preparingStep = {
    ...step(TIMELINE_STEP.preparing, 'accepted', 'preparing'),
    ...(readyBy ? { note: readyBy } : null),
  };

  /*
   * "Driver confirmed" has no `statusHistory` event of its own — the search
   * for a rider runs on `dispatch`, a track beside `status` rather than
   * inside it, see the server's own comment on `foodOrder.model.js`.
   * `rider.assignedAt` is the one timestamp the server does keep for it,
   * written the moment a rider accepts, so it is read directly rather than
   * through `firstAt`/`step`, which only know how to look inside
   * `statusHistory`.
   *
   * This step sits AFTER Preparing, not before — the reverse of an earlier
   * version of this file, from when dispatch started the instant an order was
   * placed or paid for, in parallel with the kitchen's own decision. It no
   * longer does: `foodOrder.controller.js`'s `setOrderStatus` only calls
   * `dispatch.startDispatch` once the kitchen has accepted and quoted a prep
   * time (see `foodDispatch.service.js`'s own header for why), so a rider can
   * never be confirmed before that has happened. Putting this step first
   * would now be showing an order that already happened, backwards.
   */
  const driverConfirmedStep = (() => {
    const iso = row.rider?.assignedAt;
    const when = iso ? new Date(iso) : null;
    const at = when && !Number.isNaN(when.getTime()) ? clockLabel(minuteOfDay(when)) : undefined;
    return { label: 'Driver confirmed', ...(at ? { at } : null), done: !!row.rider };
  })();

  /*
   * An order with NO history at all falls back to inferring from `status`.
   *
   * `statusHistory` has not always existed, and a row written before it did
   * carries none — for which "no event says the kitchen accepted it" is not
   * evidence that the kitchen did not. Marking every step undone on a
   * delivered order would be a worse lie than the one this function exists to
   * fix: it would tell somebody their finished order never left the kitchen.
   *
   * Leaving `done` UNSET (rather than false) is what hands the decision back
   * to `FoodTimeline`, which falls back to `currentIndex` — the old behaviour,
   * kept for exactly the rows that have nothing better available. The two
   * fulfilment modes now differ in LENGTH as well as in their labels — a
   * pickup order never has a rider to confirm or to hand it to — so
   * `timelineIndex` branches on `order.fulfilment` to match.
   */
  if (!history.length) {
    return isPickup
      ? [
          { label: 'Order placed', at: placedFallback },
          { label: TIMELINE_STEP.preparing },
          { label: 'Ready at the counter' },
          { label: 'Picked up' },
        ]
      : [
          { label: 'Order placed', at: placedFallback },
          { label: TIMELINE_STEP.preparing },
          { label: 'Driver confirmed' },
          { label: 'Picked up' },
          { label: 'On the way' },
          { label: 'Delivered' },
        ];
  }

  if (isPickup) {
    return [
      /* `placedAt` is on every order, so this one falls back to it rather than
         to nothing — an order with no history at all is still an order that
         was placed, and a first step with no tick would read as broken. */
      { label: 'Order placed', at: firstAt('placed') ?? placedFallback, done: true },
      preparingStep,
      step('Ready at the counter', 'ready'),
      step('Picked up', 'picked_up'),
    ];
  }

  return [
    { label: 'Order placed', at: firstAt('placed') ?? placedFallback, done: true },
    preparingStep,
    driverConfirmedStep,
    /*
     * Both ticked off the SAME `picked_up` event: it is the only signal there
     * is between a rider standing at the pass and that rider already moving,
     * and pretending otherwise would be inventing a second event nobody
     * recorded. `Delivered` is left as the one step still open for the whole
     * of the ride, which is the truth of it — nothing distinguishes "just
     * picked up" from "on the way" except time passing.
     */
    step('Picked up', 'picked_up'),
    step('On the way', 'picked_up'),
    step('Delivered', 'delivered'),
  ];
}


/**
 * A saved address as the food module reads it.
 *
 * `FoodAddress` predates the address book and carries `lat`/`lng` separately,
 * where the server sends `[lng, lat]`. This is the ONE place that conversion
 * happens, so the pair cannot be swapped in two places and disagree.
 */
function toFoodAddress(row: SavedAddress): FoodAddress {
  return {
    id: row.addressId,
    kind: (row.kind === 'room' ? 'room' : 'gate') as FoodAddress['kind'],
    title: addressTitle(row),
    detail: addressLine(row),
    instructions: row.instructions || undefined,
    /* Optimistic until `zones/check` says otherwise. An address the diner
       saved is one we assume we serve; the zone check corrects it, and needs
       a pin to do so. */
    serviceable: true,
    ...(row.location ? { lng: row.location[0], lat: row.location[1] } : null),
  };
}

/**
 * "Today, 1:19 pm" · "Yesterday, 9:02 pm" · "Fri, 7:12 pm" · "11 Aug, 12:40 am".
 *
 * Read off the order's OWN `placedAt`. While the list only ever held orders
 * placed seconds ago this could say "Today" unconditionally and be right every
 * time; now that a month of history is read back from the server, the same
 * line would stamp today's date on every receipt in it.
 */
function placedLabelFor(when: Date, now: Date): string {
  const at = clockLabel(minuteOfDay(when));
  const midnight = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const daysAgo = Math.round((midnight(now) - midnight(when)) / 86_400_000);
  if (daysAgo === 0) return `Today, ${at}`;
  if (daysAgo === 1) return `Yesterday, ${at}`;
  /* Inside the last week a weekday is what somebody actually remembers by;
     past that it stops being distinguishable from the week before. */
  if (daysAgo > 1 && daysAgo < 7) return `${when.toLocaleDateString('en-IN', { weekday: 'short' })}, ${at}`;
  return `${when.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, ${at}`;
}

function toAppOrder(row: ServerFoodOrder, kitchenName: string, now: Date): FoodOrder {
  /* The order's own moment, never the moment this ran. The clock is the
     fallback for a row that somehow carries no `placedAt`. */
  const placedAt = row.placedAt ? new Date(row.placedAt) : null;
  const placed = placedAt && !Number.isNaN(placedAt.getTime()) ? placedAt : now;
  const at = clockLabel(minuteOfDay(placed));
  /* The server now says so outright. The old test — "no delivery address" —
     also matched a delivery order whose address failed to save, and those two
     must not be the same case to a screen deciding whether to show a rider. */
  const isPickup = row.fulfilment ? row.fulfilment === 'pickup' : !row.deliveryAddress;

  return {
    /* The server's order number IS the id the diner reads out. Keeping a
       separate local counter would give the same order two names. */
    id: row.orderNumber,
    kitchenId: row.restaurantId,
    kitchenName,
    status: appStatus(row.status, isPickup),
    fulfilment: isPickup ? 'pickup' : 'delivery',
    lines: (row.lines ?? []).map((line) => ({
      dishId: line.productId,
      name: line.variantName ? `${line.productName} · ${line.variantName}` : line.productName,
      qty: line.quantity,
      price: line.lineTotal,
      diet: line.isVeg === 'non-veg' ? 'nonveg' : line.isVeg === 'egg' ? 'egg' : 'veg',
      ...(line.note ? { note: line.note } : null),
    })),
    itemTotal: row.itemsTotal,
    deliveryFee: row.deliveryFee,
    /*
      Each line under the name of the thing it is.

      This used to write `row.packagingCharge` into `taxes`, and the receipt
      screen printed that slot as "Taxes and charges" — so a diner was shown
      the kitchen's packing charge as a tax, a levy nobody has charged them and
      nobody remits. The three figures the server actually adds up are the item
      total, the packaging and the delivery, and they are carried across here
      one for one; `paid` is `grandTotal`, so the receipt's arithmetic is the
      server's own rather than a sum done twice.
    */
    packagingCharge: row.packagingCharge,
    discount: row.discount ?? 0,
    paid: row.grandTotal,
    placedLabel: placedLabelFor(placed, now),
    /* Only ever compared against 'This month' — see `FoodOrders`, which splits
       history on it. Derived from the order rather than asserted, now that the
       list holds orders older than this session. */
    monthLabel:
      placed.getFullYear() === now.getFullYear() && placed.getMonth() === now.getMonth()
        ? 'This month'
        : 'Earlier',
    /*
      `refund` is deliberately NOT set here, and cannot honestly be.

      The screen's refund block wants an amount, a destination, an expected
      date, a gateway reference and a bank status. The server has exactly one
      fact about a refunded order — `paymentStatus: 'refunded'`, which
      `markForRefund` writes to mean "this money is OWED back"; the refund
      itself is then made by hand in the Razorpay dashboard, so there is no
      reference, no destination and no date to send. Filling those in from the
      order's own total and a guessed "3–5 working days" would be a receipt for
      a transaction nobody has made. What IS true reaches the diner through
      `paymentLabel` below, which says the refund is on the way and nothing
      more than that.
    */
    /* What is TRUE about the money, not what was chosen. An online order that
       has not been paid says so — the kitchen has not been told about it and
       the diner needs to know why nothing is happening. */
    paymentLabel:
      row.paymentMode === 'cod'
        ? 'Cash on delivery'
        : row.paymentStatus === 'paid'
          ? 'Paid online'
          : row.paymentStatus === 'refunded'
            ? 'Refund on the way'
            : 'Payment not completed',
    ...(row.deliveryOtp ? { deliveryOtp: row.deliveryOtp } : null),
    ...(row.dispatch
      ? {
        dispatch: {
          state: row.dispatch.state,
          candidateCount: row.dispatch.candidateCount,
          failureReason: row.dispatch.failureReason,
        },
      }
      : null),
    rider: row.rider
      ? {
        name: row.rider.name,
        phone: row.rider.phone,
        vehicle: row.rider.vehicle,
        pickedUpAt: row.rider.pickedUpAt ?? null,
        deliveredAt: row.rider.deliveredAt ?? null,
        location: row.rider.location ?? null,
        heading: row.rider.heading ?? null,
        at: row.rider.at ?? null,
      }
      : null,
    /* The two fixed ends of the journey, carried straight through. GeoJSON on
       the row, GeoJSON on the screen — unwrapping to `{lat, lng}` here would
       be one more place the pair can be swapped. */
    pickupLocation: coordinatesOf(row.pickupLocation),
    dropLocation: coordinatesOf(row.dropLocation),
    timeline: buildTimeline(row, isPickup, at),
  };
}

  const placeOrder = useCallback(
    async (now: Date = new Date(), mode: 'online' | 'cod' = 'cod') => {
      if (!kitchenId) throw new Error('There is no kitchen selected.');

      const orderKitchen = findKitchen(kitchenId);
      const isPickup = fulfilment === 'pickup';

      /*
        The gate, defended where the order is actually made.

        The address screen and the payment button both refuse a delivery with
        nowhere to go, but those are two SCREENS, and a screen is a thing a
        deep link, a restored navigation state or a future caller can walk
        past. This is the one function that writes an order, so this is where
        the rule belongs — a delivery with no address would otherwise reach the
        server as `deliveryAddress: ''` and become a rider dispatched to
        nothing.

        Thrown rather than silently dropped: the payment screen already shows
        the server's own sentences on failure, and "we do not know where to
        send this" is a sentence somebody can act on.
      */
      if (!isPickup && !address) {
        throw new Error('Choose a delivery address before placing the order.');
      }

      /*
        And an address we do not reach is not an address either.

        `serviceable` is false ONLY when `zones/check` came back and said so.
        An address with no pin, one still being checked, and one whose check
        failed are all still `true` and still orderable — a missing coordinate
        is not a boundary. Same backstop reasoning as the line above: the
        picker and the payment button both refuse this, and both are screens a
        deep link or a restored navigation state can walk past.
      */
      if (!isPickup && address?.serviceable === false) {
        throw new Error(
          address.unserviceableNote || 'We are not delivering to that address right now.',
        );
      }

      /* WHAT was ordered, never how much it costs. Every figure comes back
         from the server, which prices from the menu rows — see
         `foodOrders.api.ts`. */
      const { order: placed, nextStep } = await placeFoodOrder({
        restaurantId: kitchenId,
        fulfilment: isPickup ? 'pickup' : 'delivery',
        /* The mode the payment screen chose. `online` writes a HELD order that
           the kitchen cannot see and no rider is sent for, until a verified
           signature says the money arrived — see `foodPayment.controller.js`.
           `cod` goes straight out. */
        paymentMode: mode,
        ...(isPickup ? null : { deliveryAddress: [address?.title, address?.detail, address?.instructions].filter(Boolean).join(' · ') }),
        /* Where the food is going, so the dispatcher can search around it. Its
           absence is ordinary — a diner who declined location access still
           orders, and the server falls back to searching around the kitchen
           rather than refusing. */
        ...(isPickup || address?.lat === undefined || address?.lng === undefined
          ? null
          : { dropLat: address.lat, dropLng: address.lng }),
        lines: lines.map((line) => {
          const { variantName, addOnNames } = splitOptions(line.dish, line.addOnIds);
          return {
            productId: line.dish.id,
            quantity: line.qty,
            ...(variantName ? { variantName } : null),
            ...(addOnNames.length ? { addOns: addOnNames } : null),
            ...(line.note ? { note: line.note } : null),
          };
        }),
      });

      const order = toAppOrder(placed, placed.restaurant?.name || orderKitchen?.name || UNNAMED_KITCHEN, now);
      setOrders((current) => [order, ...current]);
      /* The cart is emptied for a CASH order only. An online order is held and
         not yet paid, and clearing the cart before the money lands would leave
         a student who backs out of the UPI screen with nothing to go back to. */
      if (nextStep === 'track') clear();
      return { order, nextStep };
    },
    [kitchenId, fulfilment, lines, address, findKitchen, clear],
  );

  /**
   * Re-read one order, and fold it back into the list.
   *
   * Keyed on the order number, so a refresh replaces rather than appends. The
   * name is looked up in the catalogue on each tick — the server's order row
   * names a `restaurantId`, not a restaurant — and falls back to the
   * placeholder, which the naming effect below corrects once the feed lands.
   */
  const refreshOrder = useCallback(
    async (id: string) => {
      try {
        const row = await fetchFoodOrder(id);
        if (!row) return null;

        const fresh = toAppOrder(row, row.restaurant?.name || findKitchen(row.restaurantId)?.name || UNNAMED_KITCHEN, new Date());

        /* Folded in through the updater rather than by reading `orders`. This
           runs on a timer, and a callback that depended on the list would be a
           new function on every tick — which would restart the very interval
           calling it. `placedLabel` is carried over from the row already held
           so that a tick cannot restate it, even for a row whose `placedAt`
           went missing and fell back to the clock. */
        setOrders((current) => {
          const found = current.some((entry) => entry.id === id);
          return found
            ? current.map((entry) => (entry.id === id ? { ...fresh, placedLabel: entry.placedLabel } : entry))
            : [fresh, ...current];
        });
        return fresh;
      } catch {
        /* A failed refresh on a bus is not something to put on screen — the
           order on the previous tick is still the best answer available. */
        return null;
      }
    },
    [findKitchen],
  );

  /**
   * Read the whole list back from the server.
   *
   * Until now `orders` started empty on every launch and only ever grew from
   * this session's own placements, so an order survived exactly as long as the
   * process did: kill the app between placing dinner and eating it and the
   * pinned card, the history and the receipt were all gone, with the tracking
   * screen reachable only through the deep link in the push notification. The
   * endpoint and its client have existed the whole time with nobody calling
   * them.
   *
   * Signed out is not an error. A guest browsing the menu has no orders, and
   * an empty list is the correct answer rather than a failure to report.
   */
  const refreshOrders = useCallback(async () => {
    if (!signedIn) {
      setOrders([]);
      return;
    }
    try {
      const rows = await fetchMyFoodOrders();
      const now = new Date();
      const fresh = rows.map((row) => toAppOrder(row, row.restaurant?.name || findKitchen(row.restaurantId)?.name || UNNAMED_KITCHEN, now));
      setOrders((current) => {
        /* An order placed in THIS session that the list has not caught up with
           yet keeps its place rather than vanishing under somebody mid-
           checkout — the write is optimistic on purpose. Everything the server
           does know about is replaced by the server's own row, because the
           server is the authority on where an order has got to. */
        const known = new Set(fresh.map((order) => order.id));
        return [...current.filter((order) => !known.has(order.id)), ...fresh];
      });
    } catch {
      /* A list we could not load is not an empty list. What is already held
         stands, rather than one bad request wiping a live order off Home. */
    }
  }, [signedIn, findKitchen]);

  /* Held in a ref for the same reason the tracking screen holds its refresh in
     one: `refreshOrders` is rebuilt whenever the catalogue finishes loading,
     and an effect that depended on it directly would re-read the list every
     time a kitchen name arrived. */
  const readOrders = useRef(refreshOrders);
  readOrders.current = refreshOrders;

  /* On launch, and again whenever a session appears or goes. Signing out has
     to empty the list as surely as signing in fills it — the previous
     account's dinner must not still be pinned to Home. */
  useEffect(() => {
    void readOrders.current();
  }, [signedIn]);

  /*
    ── Naming the orders the catalogue could not name yet ───────────────────

    The hydration above runs the moment auth says `signedIn`, and auth says so
    after a single AsyncStorage read — deliberately, so the app opens signed
    in. The kitchen feed is a network round trip and has not landed by then,
    so `findKitchen` answers undefined for every restored order and each one is
    built with the `UNNAMED_KITCHEN` placeholder. The ref above exists to stop
    the LIST being re-read when the catalogue arrives, and it does its job —
    which is exactly why the placeholder used to survive the whole session:
    every order in the history read "Kitchen".

    So the names are patched in place instead. This is not a second fetch and
    it cannot become one: it reads the catalogue already in memory, rewrites
    only the orders whose name has actually changed, and returns the SAME array
    when nothing has — which is what keeps an effect that depends on
    `findKitchen`, a callback rebuilt on every catalogue change, from
    re-rendering itself in a circle.

    An order whose kitchen is no longer listed at all keeps the placeholder,
    which is as far as the catalogue can go — a delisted restaurant appears in
    no feed. The order row itself carries `restaurant.name`, snapshotted at
    placement, and reading that would answer even this case; it is not read
    here only because `ServerFoodOrder` does not declare the field yet.
  */
  useEffect(() => {
    setOrders((current) => {
      /* `findKitchen` is rebuilt whenever the catalogue does, so this runs
         often. The scan below is skipped entirely once every order has a real
         name, which is the state the list settles into seconds after launch
         and stays in. */
      if (!current.some((order) => order.kitchenName === UNNAMED_KITCHEN)) return current;

      let renamed = false;
      const named = current.map((order) => {
        const listed = findKitchen(order.kitchenId)?.name;
        if (!listed || listed === order.kitchenName) return order;
        renamed = true;
        return { ...order, kitchenName: listed };
      });
      return renamed ? named : current;
    });
  }, [findKitchen]);

  /* And when the diner opens Orders, which is the one moment they are
     explicitly asking where their food is. The tracking screen polls, but only
     for the single order it is showing. */
  useEffect(() => {
    if (foodTab !== 'orders') return;
    void readOrders.current();
  }, [foodTab]);

  const startPayment = useCallback((id: string) => startFoodPayment(id), []);

  /**
   * Pull an order back.
   *
   * A real request now, and the server is the one that decides: it refuses
   * once the kitchen has started cooking, frees whichever rider was already
   * assigned, stops the dispatcher offering it to anybody else, and flags
   * prepaid money as owed back. Doing any of that locally would leave a rider
   * riding to a restaurant for an order the diner thinks is cancelled.
   *
   * The refusal is thrown with the server's own sentence.
   */
  const cancelOrder = useCallback(async (id: string, reason: string) => {
    const row = await cancelFoodOrder(id, reason);
    if (!row) return;
    setOrders((current) =>
      current.map((entry) =>
        entry.id === id
          ? {
            ...entry,
            status: appStatus(row.status, entry.fulfilment === 'pickup'),
            paymentLabel: entry.paymentLabel,
          }
          : entry,
      ),
    );
  }, []);

  /**
   * The one order still in flight — what the pinned card on Home shows.
   *
   * An order that has been PLACED but not paid for is deliberately excluded.
   * Its status is `placed`, which used to be enough to qualify it, and the
   * result was a pinned "your order is with the kitchen" card over an order no
   * kitchen has been told about and no rider has been sent for. A student
   * watching that card would wait for food nobody is cooking.
   *
   * It is still in `orders`, still openable, and its own screen offers to
   * finish the payment — which is the honest place for it.
   */
  const liveOrder = useMemo(
    () =>
      orders.find(
        (order) =>
          ['placed', 'confirmed', 'preparing', 'ready', 'onTheWay', 'pending'].includes(order.status) &&
          order.paymentLabel !== 'Payment not completed',
      ) ?? null,
    [orders],
  );

  /* — preferences and favourites — */

  /*
   * Preferences survive the app being killed.
   *
   * They are a diet, a spice level and a list of allergens — three answers a
   * student gives once — and holding them in `useState` alone meant asking
   * again on every launch. The allergen list is the one that makes this a
   * correctness matter rather than a convenience: the dish screen warns on it,
   * and a warning that quietly stops appearing is worse than one that was
   * never offered.
   *
   * `preferencesSettled` is what keeps the two directions from fighting. Nothing is
   * written before the stored value has been read, so the defaults cannot
   * overwrite a real answer on the way up; and nothing stored is applied once
   * the diner has changed something, so a toggle tapped in the first moments
   * of a launch is not silently reverted by a slow disk.
   */
  const preferencesSettled = useRef(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(FOOD_PREFERENCES_KEY)
      .then((stored) => {
        if (!active || !stored || preferencesSettled.current) return;
        const parsed = JSON.parse(stored) as Partial<FoodPreferences>;
        setPreferencesState((current) => ({
          ...current,
          ...parsed,
          /* Guarded because this comes off a disk somebody else's build wrote.
             Anything that is not a list of strings is discarded rather than
             handed to the dish screen to iterate. */
          allergens: Array.isArray(parsed.allergens)
            ? parsed.allergens.filter((entry): entry is string => typeof entry === 'string')
            : current.allergens,
        }));
      })
      .catch(() => {
        /* A corrupt or unreadable value just means the defaults stand. There
           is nothing here worth putting on a screen. */
      })
      .finally(() => {
        if (active) preferencesSettled.current = true;
      });
    return () => {
      active = false;
    };
  }, []);

  const setPreferences = useCallback((next: Partial<FoodPreferences>) => {
    preferencesSettled.current = true;
    setPreferencesState((current) => ({ ...current, ...next }));
  }, []);

  useEffect(() => {
    if (!preferencesSettled.current) return;
    void AsyncStorage.setItem(FOOD_PREFERENCES_KEY, JSON.stringify(preferences)).catch(() => {
      /* A preference that did not reach the disk is still in effect for this
         session. Nothing to say about it. */
    });
  }, [preferences]);

  /* Straight through to the hook, which is optimistic and rolls back on a
     failure — see `useFoodFavourites` for why the tap must not wait. */
  const toggleFavouriteDish = favourites.toggleDish;
  const toggleFavouriteKitchen = favourites.toggleKitchen;

  /* — order-status notifications — */

  /** Reached steps on one order, counted the same way for both directions:
   *  how many were seen, and how many there are right now. */
  const doneStepCount = (order: FoodOrder): number =>
    (order.timeline ?? []).filter((step) => step.done).length;

  const [seenCounts, setSeenCounts] = useState<Record<string, number>>({});

  /* Read once, on launch. There is no write-back effect mirroring this one —
     unlike preferences, nothing here is ever set except by
     `markFoodNotificationsSeen`, which writes to disk itself the moment it
     changes anything, so there is no second writer for an early hydration to
     race against. */
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(FOOD_NOTIFS_SEEN_KEY)
      .then((stored) => {
        if (!active || !stored) return;
        const parsed = JSON.parse(stored) as unknown;
        if (parsed && typeof parsed === 'object') {
          setSeenCounts(parsed as Record<string, number>);
        }
      })
      .catch(() => {
        /* A corrupt or unreadable watermark just means everything counts as
           unseen once more — the worst case is a bell that over-reports by
           one launch, never one that hides a real status change. */
      });
    return () => {
      active = false;
    };
  }, []);

  const foodUnread = useMemo(
    () =>
      orders.reduce(
        (sum, order) => sum + Math.max(0, doneStepCount(order) - (seenCounts[order.id] ?? 0)),
        0,
      ),
    [orders, seenCounts],
  );

  const markFoodNotificationsSeen = useCallback(() => {
    setSeenCounts((current) => {
      const next = { ...current };
      for (const order of orders) next[order.id] = doneStepCount(order);
      void AsyncStorage.setItem(FOOD_NOTIFS_SEEN_KEY, JSON.stringify(next)).catch(() => {
        /* Not persisted this time — the bell may over-count again next
           launch, which is the same safe-side failure as above. */
      });
      return next;
    });
  }, [orders]);

  const value = useMemo<FoodContextValue>(
    () => ({
      foodTab,
      setFoodTab,
      kitchenId,
      lines,
      count,
      itemTotal,
      packagingCharge,
      deliveryFee,
      toPay,
      fulfilment,
      address,
      addressChoices: choices,
      hasAddress: !!address,
      refreshAddresses,
      add,
      setQty,
      clear,
      qtyOf,
      setFulfilment,
      setAddressId,
      pendingAdd,
      confirmSwitch,
      cancelSwitch,
      orders,
      refreshOrders,
      liveOrder,
      placeOrder,
      refreshOrder,
      startPayment,
      cancelOrder,
      foodUnread,
      markFoodNotificationsSeen,
      preferences,
      setPreferences,
      favouriteDishes,
      favouriteKitchens,
      toggleFavouriteDish,
      toggleFavouriteKitchen,
      isFavouriteDish: favourites.isDishFavourite,
      isFavouriteKitchen: favourites.isKitchenFavourite,
      favouriteDishList: favourites.dishes,
      favouriteKitchenList: favourites.kitchens,
      favouritesUnavailable: favourites.unavailable,
      favouritesLoading: favourites.loading,
      refreshFavourites: favourites.refetch,
    }),
    [
      foodTab,
      kitchenId,
      lines,
      count,
      itemTotal,
      packagingCharge,
      deliveryFee,
      toPay,
      fulfilment,
      address,
      choices,
      refreshAddresses,
      add,
      setQty,
      clear,
      qtyOf,
      setFulfilment,
      pendingAdd,
      confirmSwitch,
      cancelSwitch,
      orders,
      refreshOrders,
      liveOrder,
      placeOrder,
      refreshOrder,
      startPayment,
      cancelOrder,
      foodUnread,
      markFoodNotificationsSeen,
      preferences,
      setPreferences,
      favouriteDishes,
      favouriteKitchens,
      toggleFavouriteDish,
      toggleFavouriteKitchen,
      favourites,
    ],
  );

  return <FoodContext.Provider value={value}>{children}</FoodContext.Provider>;
}

export function useFood(): FoodContextValue {
  const value = useContext(FoodContext);
  if (!value) throw new Error('useFood must be used inside FoodProvider');
  return value;
}
