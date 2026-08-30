/**
 * A `food_restaurants` / `food_products` document, as the Food module renders it.
 *
 * This is the whole boundary between the food database and the UI, and it
 * follows the same governing rule as `listing.adapter.ts`: **it converts, it
 * does not invent.** Where the server has a fact it is carried across and
 * renamed; where the server has nothing the field is left absent, never
 * filled with a plausible default.
 *
 * That rule costs something here and is worth it. The fixtures this replaces
 * carried ratings, walking times, "orders in your block" and per-dish meal
 * windows, all written by a designer who knew they were invented. The
 * database has none of those. So a kitchen with no ratings shows no rating
 * rather than a comfortable 4.3, and a feed asked for without coordinates
 * shows no walking time rather than a made-up eight minutes.
 *
 * ## Meal windows are DERIVED, not stored
 *
 * The app slices its day into five windows; the backend stores opening hours
 * as `{ day, openTime, closeTime }` rows, which is what a restaurant actually
 * told us. `windowsFrom` intersects the two, so "which kitchens are open for
 * dinner" is answered from real trading hours instead of a tag somebody set.
 * A kitchen open 11:00–23:00 lands in lunch, snacks and dinner without anyone
 * having to say so.
 */
import {
  MEAL_WINDOWS,
  type Diet,
  type Dish,
  type Kitchen,
  type MealWindow,
  type MealWindowId,
} from '@/types/food';

/* ------------------------------------------------------------------ *
 * What the server sends
 * ------------------------------------------------------------------ */

export type BackendFoodImage = { url?: string; publicId?: string } | null;

export type BackendOpeningHour = { day?: string; openTime?: string; closeTime?: string };

export type BackendKitchen = {
  restaurantId: string;
  restaurantName?: string;
  description?: string;
  cuisineTypes?: string[];
  logoImage?: BackendFoodImage;
  coverBannerImage?: BackendFoodImage;
  address?: { line1?: string; line2?: string; city?: string; state?: string; pincode?: string; landmark?: string };
  openingHours?: BackendOpeningHour[];
  isCurrentlyOpen?: boolean;
  avgPreparationTime?: number;
  deliveryRadiusKm?: number;
  minOrderValue?: number;
  packagingCharge?: number;
  deliveryFee?: { type?: string; amount?: number; perKm?: number; freeAboveValue?: number };
  acceptsOnlinePayment?: boolean;
  acceptsCod?: boolean;
  ratingAvg?: number;
  ratingCount?: number;
  /** Only present when the feed was asked with coordinates. */
  distanceKm?: number;
};

export type BackendDish = {
  productId: string;
  restaurantId?: string;
  productName?: string;
  description?: string;
  category?: string;
  price?: number;
  discountedPrice?: number | null;
  isVeg?: 'veg' | 'non-veg' | 'egg';
  isAvailable?: boolean;
  productImage?: BackendFoodImage;
  galleryImages?: { url?: string }[];
  variants?: { name?: string; price?: number }[];
  addOns?: { name?: string; price?: number }[];
  spiceLevel?: string | null;
  serves?: number | null;
  calories?: number | null;
  preparationTime?: number | null;
  tags?: string[];
  ratingAvg?: number;
  ratingCount?: number;
  displayOrder?: number;
};

export type BackendMenuGroup = { category?: string; items?: BackendDish[] };

/* ------------------------------------------------------------------ *
 * Small conversions
 * ------------------------------------------------------------------ */

const num = (value: unknown): number | undefined => {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

const url = (image: BackendFoodImage | undefined): string | undefined => {
  const value = image?.url?.trim();
  /* Only a real remote link. A local path stored by mistake would render as a
     broken tile on every device except the one that uploaded it, and a missing
     photo is a case every food layout already handles properly. */
  return value && /^https?:\/\//.test(value) ? value : undefined;
};

const minutesOf = (hhmm?: string): number | null => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? '').trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
};

/** Does a trading slot overlap a meal window? Both may wrap past midnight. */
function slotCoversWindow(open: number, close: number, window: MealWindow): boolean {
  /* Expand each range into one or two non-wrapping spans, then test for any
     overlap. Doing it this way rather than with modular arithmetic is what
     keeps the late-night window (23:00–02:00) correct against a kitchen that
     trades 18:00–01:00 — both wrap, and the naive comparison says no. */
  const spans = (from: number, to: number): [number, number][] =>
    to > from ? [[from, to]] : [[from, 24 * 60], [0, to]];

  const slot = spans(open, close);
  const win = spans(window.startMinute, window.endMinute);

  return slot.some(([a1, a2]) => win.some(([b1, b2]) => a1 < b2 && b1 < a2));
}

/**
 * The meal windows a kitchen's real opening hours cover.
 *
 * Empty when the kitchen recorded no hours — which the UI reads as "no window
 * fits", and is the truth. Inventing all five would put a closed kitchen at
 * the top of the breakfast feed.
 */
export function windowsFrom(hours: readonly BackendOpeningHour[] | undefined): MealWindowId[] {
  if (!hours?.length) return [];

  const covered = new Set<MealWindowId>();
  for (const row of hours) {
    const open = minutesOf(row.openTime);
    const close = minutesOf(row.closeTime);
    if (open === null || close === null) continue;
    for (const window of MEAL_WINDOWS) {
      if (slotCoversWindow(open, close, window)) covered.add(window.id);
    }
  }
  return MEAL_WINDOWS.filter((w) => covered.has(w.id)).map((w) => w.id);
}

/**
 * Walking minutes from the distance the geo query measured.
 *
 * 5 km/h is the ordinary figure for an adult on a pavement. Rounded up and
 * floored at one minute, because "0 min away" reads as a bug. Undefined when
 * the feed was asked without coordinates — there is genuinely nothing to say.
 */
export function walkMinutesFrom(distanceKm: number | undefined): number | undefined {
  const km = num(distanceKm);
  if (km === undefined) return undefined;
  return Math.max(1, Math.round((km / 5) * 60));
}

/** The flat delivery figure a card can print, from whichever rule is set. */
function deliveryFeeOf(kitchen: BackendKitchen): number {
  const fee = kitchen.deliveryFee;
  if (!fee) return 0;
  if (fee.type === 'distance_based') {
    /* A per-km rate cannot be shown as one number without a distance, and the
       card has room for one number. The base is the honest floor. */
    return num(fee.amount) ?? 0;
  }
  return num(fee.amount) ?? 0;
}

const dietOf = (isVeg: BackendDish['isVeg']): Diet =>
  isVeg === 'non-veg' ? 'nonveg' : isVeg === 'egg' ? 'egg' : 'veg';

/* ------------------------------------------------------------------ *
 * Kitchens
 * ------------------------------------------------------------------ */

/**
 * "8 min walk", or nothing.
 *
 * Null when the feed was asked without coordinates, because then the distance
 * is genuinely unknown and `walkMinutes` is 0 — and "0 min walk" printed on a
 * card reads as a kitchen next door rather than as a missing measurement.
 * Every screen that shows a walking time goes through this.
 */
export function walkLabel(kitchen: Pick<Kitchen, 'walkMinutes'>): string | null {
  return kitchen.walkMinutes > 0 ? `${kitchen.walkMinutes} min walk` : null;
}

/** Join the parts we actually have, so a missing one leaves no stray separator. */
export function metaLine(...parts: (string | null | undefined)[]): string {
  return parts.filter((part) => !!part && String(part).trim()).join(' · ');
}

export function toKitchen(raw: BackendKitchen, sections: readonly string[] = []): Kitchen {
  const rating = num(raw.ratingAvg) ?? 0;
  const ratingCount = num(raw.ratingCount) ?? 0;

  return {
    id: raw.restaurantId,
    name: raw.restaurantName?.trim() || 'Unnamed kitchen',
    /* The tagline is the restaurant's own words and beats a joined list of
       tags; the cuisines are the fallback. */
    cuisine: raw.description?.trim() || (raw.cuisineTypes ?? []).join(', ') || '',
    landmark: raw.address?.landmark?.trim() || raw.address?.line1?.trim() || '',
    /* Zero rather than absent: `Kitchen.walkMinutes` is required, and the
       card treats 0 as "we do not know" and prints nothing. */
    walkMinutes: walkMinutesFrom(raw.distanceKm) ?? 0,
    rating,
    ratingCount,
    windows: windowsFrom(raw.openingHours),
    deliveryFee: deliveryFeeOf(raw),
    minOrder: num(raw.minOrderValue) ?? 0,
    prepMinutes: num(raw.avgPreparationTime) ?? 0,
    /* ZERO, always — and read as "unknown" by every screen that prints it.
       An earlier revision guessed this from the distance at a made-up three
       minutes per kilometre. Nothing in `food_restaurants` records how long a
       rider takes: it depends on the rider, the traffic and the queue, none
       of which this app can see. A guessed delivery estimate is the one
       number a hungry student plans around, so it is left absent until
       something real produces it. */
    deliveryMinutes: 0,
    sections,
    ...(url(raw.coverBannerImage) || url(raw.logoImage)
      ? { photo: url(raw.coverBannerImage) ?? url(raw.logoImage) }
      : null),
  };
}

/* ------------------------------------------------------------------ *
 * Dishes
 * ------------------------------------------------------------------ */

/* The two kinds of option, kept apart by their id. A variant REPLACES the
   dish's price on the server; an add-on adds to it. */
const VARIANT_PREFIX = 'v:';
const ADDON_PREFIX = 'a:';

/**
 * A cart line's chosen option ids, back into what the order endpoint wants.
 *
 * The app flattens variants and add-ons into one `addOns` list so a single
 * control can present them. The server does not: it prices a variant by
 * replacing the base and an add-on by adding to it, and it matches both BY
 * NAME against the stored dish. This is the one place that unflattens them.
 */
export function splitOptions(
  dish: Pick<Dish, 'addOns'>,
  chosenIds: readonly string[],
): { variantName?: string; addOnNames: string[] } {
  const chosen = (dish.addOns ?? []).filter((option) => chosenIds.includes(option.id));
  /* Only one portion can apply. If a cart somehow holds two, the first wins —
     sending both would have the server price the line twice over. */
  const variant = chosen.find((option) => option.id.startsWith(VARIANT_PREFIX));
  const addOnNames = chosen
    .filter((option) => option.id.startsWith(ADDON_PREFIX))
    .map((option) => option.label);

  return { ...(variant ? { variantName: variant.label } : null), addOnNames };
}

export function toDish(raw: BackendDish, kitchenId: string, windows: readonly MealWindowId[]): Dish {
  const full = num(raw.price) ?? 0;
  const offer = num(raw.discountedPrice ?? undefined);

  const addOns = (raw.addOns ?? [])
    .filter((a) => a?.name)
    .map((a, i) => ({
      id: `${ADDON_PREFIX}${raw.productId}-${i}`,
      label: String(a.name),
      price: num(a.price) ?? 0,
    }));

  /* Portions are `variants` on the server. The app has no variant concept, so
     they ride as add-ons priced at the DIFFERENCE from the base — which is
     what the cart would have to charge anyway. A variant cheaper than the
     base is dropped rather than shown as a negative.

     The id prefix is load-bearing, not cosmetic: when the order is placed the
     two have to be told apart again, because the server treats a variant as
     REPLACING the price and an add-on as adding to it. `splitOptions` below is
     the only thing allowed to read it. */
  const portions = (raw.variants ?? [])
    .filter((v) => v?.name && (num(v.price) ?? 0) > full)
    .map((v, i) => ({
      id: `${VARIANT_PREFIX}${raw.productId}-${i}`,
      label: String(v.name),
      price: (num(v.price) ?? 0) - full,
    }));

  const rating = num(raw.ratingAvg);
  const ratingCount = num(raw.ratingCount);
  const serves = num(raw.serves ?? undefined);

  return {
    id: raw.productId,
    kitchenId,
    name: raw.productName?.trim() || 'Unnamed dish',
    description: raw.description?.trim() || '',
    /* The offer price when there is one — it is what the diner pays. */
    price: offer && offer > 0 ? offer : full,
    diet: dietOf(raw.isVeg),
    section: raw.category?.trim() || 'Menu',
    /* A dish is orderable whenever its kitchen is trading. The backend has no
       per-dish window and the app must not invent one. */
    windows,
    ...(portions.length || addOns.length ? { addOns: [...portions, ...addOns] } : null),
    ...(serves !== undefined ? { serves: `Serves ${serves}` } : null),
    ...(rating !== undefined && rating > 0 ? { rating } : null),
    ...(ratingCount !== undefined && ratingCount > 0 ? { ratingCount } : null),
    /* The spice picker is hidden on every dish, because there is nowhere to
       send the answer. `food_products.spiceLevel` is how hot the KITCHEN makes
       it — a fact about the dish — and no order endpoint carries a customer's
       preference. Offering the control would promise a kitchen is listening to
       something it never receives. */
    spiceFixed: true,
    ...(raw.isAvailable === false ? { soldOut: true } : null),
    ...(url(raw.productImage) ? { photo: url(raw.productImage) } : null),
  };
}

/* ------------------------------------------------------------------ *
 * A whole kitchen page
 * ------------------------------------------------------------------ */

export type KitchenWithMenu = { kitchen: Kitchen; dishes: Dish[] };

/**
 * The detail response — a kitchen and its menu already grouped by category.
 *
 * Section order is taken from the order the groups arrive in, which is the
 * order the restaurant arranged them by `displayOrder`. Re-sorting here would
 * throw away the one piece of editorial control a kitchen has over its menu.
 */
export function toKitchenWithMenu(payload: {
  restaurant?: BackendKitchen;
  menu?: BackendMenuGroup[];
}): KitchenWithMenu | null {
  if (!payload?.restaurant?.restaurantId) return null;

  const groups = payload.menu ?? [];
  const sections = groups.map((g) => g.category?.trim()).filter((c): c is string => !!c);

  const kitchen = toKitchen(payload.restaurant, sections);
  const dishes = groups.flatMap((group) =>
    (group.items ?? [])
      .filter((item) => item?.productId)
      .map((item) => toDish(item, kitchen.id, kitchen.windows)),
  );

  return { kitchen, dishes };
}
