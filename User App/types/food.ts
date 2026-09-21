/**
 * The Food module's domain.
 *
 * ## Open or closed is the restaurant's own answer
 *
 * This used to slice the day into five fixed meal windows — breakfast, lunch,
 * snacks, dinner, late night — and index the whole catalogue by them: which
 * kitchens showed up, which dishes could be added, even whether "open now" was
 * true all depended on which of the five the clock was sitting in, INCLUDING
 * the gaps between them, where nothing was in any window and a kitchen with
 * broad real hours could still read as closed. That whole axis is gone.
 * Everything the catalogue shows now, it shows all the time; whether a kitchen
 * is open is exactly what the server says it is — see `openNowOf` in
 * `services/adapters/food.adapter.ts`.
 */

/** Minutes from midnight for a Date, in the device's own timezone. */
export function minuteOfDay(now: Date): number {
  return now.getHours() * 60 + now.getMinutes();
}

/** "7:30 pm", "12 pm" — the app's only clock formatter for food. */
export function clockLabel(minute: number): string {
  const wrapped = ((Math.round(minute) % 1440) + 1440) % 1440;
  const hour24 = Math.floor(wrapped / 60);
  const minutes = wrapped % 60;
  const suffix = hour24 < 12 ? 'am' : 'pm';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return minutes === 0 ? `${hour12} ${suffix}` : `${hour12}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

/** "about 1:28 pm" — a ready time derived from now plus the kitchen's prep. */
export function readyLabel(now: Date, prepMinutes: number): string {
  return clockLabel(minuteOfDay(now) + prepMinutes);
}

/* ------------------------------------------------------------------ *
 * Diet
 * ------------------------------------------------------------------ */

/**
 * Veg, egg and non-veg are told apart by SHAPE first.
 *
 * A dot inside a green square, a dot inside an amber square, a triangle inside
 * a red square. The colour is the second signal, never the only one — this is
 * the same rule the booking statuses follow, and here it also happens to be
 * the mark Indian packaging law already trained everyone to read.
 */
export type Diet = 'veg' | 'egg' | 'nonveg';

export const DIET_LABEL: Record<Diet, string> = {
  veg: 'Veg',
  egg: 'Egg',
  nonveg: 'Non-veg',
};

/** Which diets a preference admits. Veg-only never hides a kitchen, only dishes. */
export function dietAllowed(diet: Diet, preference: Diet): boolean {
  if (preference === 'nonveg') return true;
  if (preference === 'egg') return diet !== 'nonveg';
  return diet === 'veg';
}

export type SpiceLevel = 'mild' | 'medium' | 'hot';

export const SPICE_LABEL: Record<SpiceLevel, string> = {
  mild: 'Mild',
  medium: 'Medium',
  hot: 'Andhra hot',
};

/* ------------------------------------------------------------------ *
 * Catalogue
 * ------------------------------------------------------------------ */

export type Fulfilment = 'delivery' | 'pickup';

export type Kitchen = {
  id: string;
  name: string;
  /** "South Indian, thali" — cuisine before anything subjective. */
  cuisine: string;
  /**
   * The kitchen's own cuisine tags, unflattened — `["South Indian", "Street
   * Food"]` rather than `cuisine`'s joined display string. Kept alongside it
   * rather than replacing it: `cuisine` is a READING line, built to include
   * the kitchen's own description when it has one; this is a FILTERING
   * value, and a category rail built off the display string would break the
   * moment a kitchen's description stopped being just its cuisines.
   */
  cuisineTypes: readonly string[];
  /**
   * A street or landmark, NOT an area.
   *
   * The area is the student's own — whatever locality they picked on the entry
   * screen — and the feed prints that beside the walking time. Storing "Gachibowli"
   * on the kitchen would put a Hyderabad neighbourhood on a card sitting under a
   * header that says Koramangala.
   */
  landmark: string;
  walkMinutes: number;
  rating: number;
  ratingCount: number;
  deliveryFee: number;
  minOrder: number;
  /** Counter-ready time, in minutes from the order. Delivery adds travel. */
  prepMinutes: number;
  deliveryMinutes: number;
  /** Menu section names, in the order the kitchen wants them read. */
  sections: readonly string[];
  /** Set when the kitchen has opted out of every offer. */
  noOffers?: boolean;
  /** Directions text for the pickup counter. */
  directions?: string;
  /**
   * Counter photo. Optional, and every layout is built to be correct without
   * it — roughly half of what onboarding collects from kitchens this size is
   * missing or unusable, so a missing photo is the normal case, not the error
   * case.
   */
  photo?: string;
};

export type AddOn = { id: string; label: string; price: number };

export type Dish = {
  id: string;
  kitchenId: string;
  name: string;
  description: string;
  price: number;
  diet: Diet;
  section: string;
  addOns?: readonly AddOn[];
  /** "Serves 1, about 350 g" — the honest portion line. */
  serves?: string;
  rating?: number;
  ratingCount?: number;
  soldOut?: boolean;
  /** Orders placed from this building this week. Drives "popular in your PG". */
  ordersInBlock?: number;
  spiceFixed?: boolean;
  /** Dish photo. Same rule as the kitchen's: the row must work without it. */
  photo?: string;
};

/* ------------------------------------------------------------------ *
 * Orders
 * ------------------------------------------------------------------ */

/**
 * Twelve states, and only two of them are FILLED chips.
 *
 * A filled chip means the student has to do something or is being waited on:
 * the food is ready at a counter, or it has been handed over. Everything else
 * is a tinted chip, which reads as "we are telling you where this is". If
 * every state shouted, "Ready" would stop meaning anything.
 *
 * `rejected` and `cancelled` are two different events and the diner is owed
 * the difference. A cancellation is something the diner did; a rejection is
 * the KITCHEN refusing the order, with a reason of its own that the tracking
 * screen prints. Folding the first into the second — which is what this union
 * forced for as long as it had no `rejected` — told a student they had called
 * off a dinner the restaurant had turned down.
 */
export type FoodOrderStatus =
  | 'placed'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'onTheWay'
  | 'delivered'
  | 'pickedUp'
  | 'pending'
  | 'rejected'
  | 'cancelled'
  | 'refunded'
  | 'failed';

export type OrderLine = {
  /**
   * The dish this line came from, when it is still on the menu.
   *
   * A receipt has to survive the dish being renamed or delisted, so `name` and
   * `price` are the record and this is only a convenience — it is what lets
   * Reorder rebuild a cart at TODAY'S prices instead of re-charging last
   * week's, and it is allowed to be missing.
   */
  dishId?: string;
  name: string;
  qty: number;
  price: number;
  diet: Diet;
  /** "Extra curd, medium spice" — what was chosen, so a reorder is honest. */
  note?: string;
};

export type FoodOrder = {
  id: string;
  kitchenId: string;
  kitchenName: string;
  status: FoodOrderStatus;
  fulfilment: Fulfilment;
  lines: readonly OrderLine[];
  itemTotal: number;
  deliveryFee: number;
  /**
   * What the kitchen charged to pack it.
   *
   * `food_orders.packagingCharge`, carried across under its own name. This used
   * to be written into `taxes` below, so a real packing charge reached the
   * diner labelled as tax — money nobody has collected on this order named
   * after a levy nobody remitted. Optional because only a server row can fill
   * it in: the demo fixtures never had one.
   */
  packagingCharge?: number;
  /**
   * Nothing on a real order sets this, and nothing should.
   *
   * There is no tax on a Lampose food order: the checkout adds items,
   * packaging and delivery and nothing else — see
   * `foodCustomerOrder.controller.js`. The field survives only because the
   * demo fixtures in `data/food.ts` still carry it, and it is left optional so
   * that a receipt reading it prints nothing rather than an invented line.
   */
  taxes?: number;
  discount: number;
  /** Coupon that produced `discount`, for the receipt line. */
  couponCode?: string;
  paid: number;
  /** Human date, already formatted — mock data has no server to derive it from. */
  placedLabel: string;
  /** ISO-ish day used only for grouping history by month. */
  monthLabel: string;
  paymentLabel: string;
  /** Four digits shown at the counter. Pickup orders only. */
  pickupCode?: string;
  /**
   * Four digits read out to the rider at the door. Delivery orders only.
   *
   * Not a credential and not treated as one — it opens nothing. It is a value
   * the diner and the rider COMPARE, which is what a hand-over is, and it has
   * to be shown on screen to work at all.
   */
  deliveryOtp?: string;
  /**
   * The rider search, which runs BESIDE the kitchen's status rather than
   * inside it — an order is being cooked and looked for at the same time.
   * `unassigned` is "everybody nearby said no", not a failure: the server
   * tries again when the food is ready.
   */
  dispatch?: {
    state: 'idle' | 'searching' | 'assigned' | 'unassigned';
    candidateCount?: number;
    failureReason?: string;
  };
  /** Null until a rider accepts. Everything the diner is told about them. */
  rider?: {
    name: string;
    phone: string;
    vehicle?: { type?: string; model?: string; plate?: string };
    pickedUpAt?: string | null;
    /* Set the moment the rider confirms the hand-over. It is what turns the
       card from a journey in progress into a record of one. */
    deliveredAt?: string | null;
    /** [longitude, latitude]. Null when the last fix is too old to draw. */
    location?: [number, number] | null;
    heading?: number | null;
    /** When that fix was taken — the map shows its age rather than hiding it. */
    at?: string | null;
  } | null;
  /** [longitude, latitude] of the kitchen, snapshotted onto the order. */
  pickupLocation?: [number, number] | null;
  /** [longitude, latitude] of the door. Absent without location access. */
  dropLocation?: [number, number] | null;
  /** Set on cancelled orders; drives the refund block. */
  refund?: {
    amount: number;
    destination: string;
    expectedBy: string;
    reference: string;
    status: 'initiated' | 'sentToBank' | 'credited';
    reason: string;
  };
  /**
   * The order's history, one row per step.
   *
   * `done` is set from the server's own `statusHistory` — a step is complete
   * because an event says it happened, never because a later step did. Left
   * undefined by the demo fixtures, which the renderer falls back to indexing.
   */
  timeline?: readonly { label: string; at?: string; note?: string; done?: boolean }[];
};

export type Coupon = {
  code: string;
  /** "₹20 off" — the saving, stated before the conditions. */
  headline: string;
  body: string;
  discount: number;
  /** Item total the cart must reach. */
  minimum: number;
  /** Set when the coupon cannot run yet, with the reason as the chip label. */
  blockedReason?: string;
  /** Codes this one refuses to stack with. */
  excludes?: readonly string[];
  pickupOnly?: boolean;
};

/* ------------------------------------------------------------------ *
 * Delivery targets
 * ------------------------------------------------------------------ */

export type FoodAddressKind = 'room' | 'common' | 'gate';

export type FoodAddress = {
  id: string;
  kind: FoodAddressKind;
  /** "Block C · Room 214" — the line the rider actually reads. */
  title: string;
  detail: string;
  instructions?: string;
  /** From the stay booking. It cannot be removed, only corrected upstream. */
  fromBooking?: boolean;
  deliveryFee?: number;
  /**
   * Where this actually is, so a rider can be searched for around it.
   *
   * Optional, and absent is an ordinary case rather than a fault: a hostel
   * address typed by hand has no pin, and the dispatcher falls back to
   * searching around the RESTAURANT — a rider near the kitchen can always
   * reach the address written on the order.
   */
  lat?: number;
  lng?: number;
};

/* ------------------------------------------------------------------ *
 * Preferences
 * ------------------------------------------------------------------ */

/**
 * Defaults, not limits — and the module says so twice, because a student who
 * believes veg-only hides non-veg will order at the wrong kitchen once and
 * never trust the setting again.
 */
export type FoodPreferences = {
  diet: Diet;
  vegOnly: boolean;
  /**
   * The stricter half of veg mode: kitchens themselves are filtered to ones
   * whose whole menu is veg, not only their dishes. Meaningless on its own —
   * every reader that cares about it also checks `vegOnly`, which this is
   * always set alongside — but kept as its own field rather than a third
   * value folded into `vegOnly` so every existing "veg-only never hides a
   * kitchen, only dishes" reader (the kitchen screen, search) keeps meaning
   * exactly what it always meant without having to learn a new enum.
   */
  vegRestaurantsOnly: boolean;
  spice: SpiceLevel;
  allergens: readonly string[];
  defaultPickup: boolean;
};

/** The Food Home veg control's three states, derived from the two booleans
 *  above rather than stored as a third one — see `vegRestaurantsOnly`. */
export type VegMode = 'off' | 'items' | 'restaurants';

export function vegModeOf(preferences: Pick<FoodPreferences, 'vegOnly' | 'vegRestaurantsOnly'>): VegMode {
  /* `vegRestaurantsOnly` alone is not "restaurants" — it is meaningless
     without `vegOnly`, and the Food preferences screen's own veg switch sets
     only `vegOnly`, so a diner who had picked pure-veg kitchens on Home and
     later flips that plain switch off must land on 'off', not silently stay
     in restaurant mode with the item filter gone. */
  if (preferences.vegOnly && preferences.vegRestaurantsOnly) return 'restaurants';
  if (preferences.vegOnly) return 'items';
  return 'off';
}

export const ALLERGENS = ['Peanut', 'Dairy', 'Gluten', 'Soy', 'Shellfish', 'Onion, garlic'] as const;
