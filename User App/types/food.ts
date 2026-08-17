/**
 * The Food module's domain.
 *
 * ## The clock outranks everything
 *
 * A stay listing is available or it is not. A dish is available *for the next
 * two hours*, and a kitchen that is the best in Gachibowli is worth nothing at
 * 4 pm if it only cooks lunch and dinner. So the meal window is not a filter
 * sitting on top of the catalogue — it is the axis the catalogue is indexed by,
 * and every food surface states which window it is showing before it shows
 * anything.
 *
 * That is why the rail rolls rather than resets: at 11:52 pm the student is
 * looking at late night, and the window they will use next is breakfast, so
 * both have to be on screen. A rail pinned to breakfast-first would put the
 * only two relevant windows at opposite ends of it.
 */

/* ------------------------------------------------------------------ *
 * Meal windows
 * ------------------------------------------------------------------ */

export type MealWindowId = 'breakfast' | 'lunch' | 'snacks' | 'dinner' | 'lateNight';

export type MealWindow = {
  id: MealWindowId;
  label: string;
  /**
   * Minutes from midnight.
   *
   * `end` may be numerically SMALLER than `start` — late night runs 11 pm to
   * 2 am and crosses midnight, which is exactly the window a hostel uses most.
   * Every comparison below has to handle that; `containsMinute` is the only
   * place allowed to know how.
   */
  startMinute: number;
  endMinute: number;
  /** What the rail prints under the name. Short, because the cell is 1/4 wide. */
  hours: string;
};

/** Order matters: this is the sequence the rail rolls through. */
export const MEAL_WINDOWS: readonly MealWindow[] = [
  { id: 'breakfast', label: 'Breakfast', startMinute: 7 * 60, endMinute: 10 * 60, hours: '7–10' },
  { id: 'lunch', label: 'Lunch', startMinute: 12 * 60, endMinute: 15 * 60 + 30, hours: '12–3:30' },
  { id: 'snacks', label: 'Snacks', startMinute: 16 * 60, endMinute: 19 * 60, hours: '4–7' },
  { id: 'dinner', label: 'Dinner', startMinute: 19 * 60 + 30, endMinute: 23 * 60, hours: '7:30–11' },
  { id: 'lateNight', label: 'Late night', startMinute: 23 * 60, endMinute: 2 * 60, hours: '11–2' },
];

export function findWindow(id: MealWindowId): MealWindow {
  const found = MEAL_WINDOWS.find((window) => window.id === id);
  // The id type makes this unreachable; the fallback is here so a bad value
  // arriving from persisted state degrades to lunch rather than crashing a feed.
  return found ?? MEAL_WINDOWS[1];
}

/** Minutes from midnight for a Date, in the device's own timezone. */
export function minuteOfDay(now: Date): number {
  return now.getHours() * 60 + now.getMinutes();
}

/** The one place that knows a window may wrap past midnight. */
export function containsMinute(window: MealWindow, minute: number): boolean {
  return window.endMinute > window.startMinute
    ? minute >= window.startMinute && minute < window.endMinute
    : minute >= window.startMinute || minute < window.endMinute;
}

/** The window being cooked right now, or null in the gap between two. */
export function openWindow(now: Date): MealWindow | null {
  const minute = minuteOfDay(now);
  return MEAL_WINDOWS.find((window) => containsMinute(window, minute)) ?? null;
}

/** How many minutes until a window opens — 0 if it is already open. */
export function minutesUntilOpen(window: MealWindow, now: Date): number {
  const minute = minuteOfDay(now);
  if (containsMinute(window, minute)) return 0;
  const delta = window.startMinute - minute;
  return delta >= 0 ? delta : delta + 1440;
}

/** How many minutes until the open window closes. Null when it is not open. */
export function minutesUntilClose(window: MealWindow, now: Date): number | null {
  const minute = minuteOfDay(now);
  if (!containsMinute(window, minute)) return null;
  const delta = window.endMinute - minute;
  return delta >= 0 ? delta : delta + 1440;
}

/**
 * The window the app should be showing.
 *
 * Between windows this is the NEXT one, not the last one — a student opening
 * the app at 10:40 am is deciding about lunch, and a screen full of struck-out
 * breakfast is a screen with nothing on it.
 */
export function focusWindow(now: Date): MealWindow {
  const open = openWindow(now);
  if (open) return open;
  const minute = minuteOfDay(now);
  let best = MEAL_WINDOWS[0];
  let bestWait = Number.POSITIVE_INFINITY;
  for (const window of MEAL_WINDOWS) {
    const wait = window.startMinute - minute >= 0 ? window.startMinute - minute : window.startMinute - minute + 1440;
    if (wait < bestWait) {
      bestWait = wait;
      best = window;
    }
  }
  return best;
}

export type RailToken = {
  window: MealWindow;
  state: 'past' | 'current' | 'upcoming';
  /** Current AND actually cooking. Between windows the current token is not. */
  openNow: boolean;
};

/**
 * The four tokens the rail draws, rolled so the focus window is always on it
 * and at least one upcoming window follows it.
 *
 * The focus sits at position `min(index, 2)`, which is what makes 11:52 pm
 * render Snacks · Dinner · **Late night** · Breakfast rather than pushing
 * breakfast — the next window anyone will actually use — off the end.
 */
export function railFor(now: Date, focusId?: MealWindowId): RailToken[] {
  const focus = focusId ? findWindow(focusId) : focusWindow(now);
  const total = MEAL_WINDOWS.length;
  const focusIndex = MEAL_WINDOWS.findIndex((window) => window.id === focus.id);
  const offset = Math.min(focusIndex, 2);
  const start = (focusIndex - offset + total) % total;
  const open = openWindow(now);

  return Array.from({ length: 4 }, (_, slot) => {
    const window = MEAL_WINDOWS[(start + slot) % total];
    const state: RailToken['state'] = slot === offset ? 'current' : slot < offset ? 'past' : 'upcoming';
    return { window, state, openNow: state === 'current' && open?.id === window.id };
  });
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
  /** Which windows this kitchen cooks. Everything else is a closed preview. */
  windows: readonly MealWindowId[];
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
  windows: readonly MealWindowId[];
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
 * Nine states, and only two of them are FILLED chips.
 *
 * A filled chip means the student has to do something or is being waited on:
 * the food is ready at a counter, or it has been handed over. Everything else
 * is a tinted chip, which reads as "we are telling you where this is". If
 * every state shouted, "Ready" would stop meaning anything.
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
  window: MealWindowId;
  lines: readonly OrderLine[];
  itemTotal: number;
  deliveryFee: number;
  taxes: number;
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
  /** Set on cancelled orders; drives the refund block. */
  refund?: {
    amount: number;
    destination: string;
    expectedBy: string;
    reference: string;
    status: 'initiated' | 'sentToBank' | 'credited';
    reason: string;
  };
  timeline?: readonly { label: string; at?: string; note?: string }[];
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
  serviceable: boolean;
  /** Why it is not serviceable, said plainly. */
  unserviceableNote?: string;
  deliveryFee?: number;
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
  spice: SpiceLevel;
  allergens: readonly string[];
  defaultPickup: boolean;
};

export const ALLERGENS = ['Peanut', 'Dairy', 'Gluten', 'Soy', 'Shellfish', 'Onion, garlic'] as const;
