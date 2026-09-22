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
 * ## "Open right now" is the server's answer, and only the server's
 *
 * Whether the counter is taking orders this minute is not something this file
 * derives from the opening-hours rows — it used to, against a fixed set of
 * meal windows, and a kitchen open through a gap between two of them could
 * read as closed despite genuinely broad hours. The partner also has a switch
 * (`openState`) that overrides the whole schedule, and the hours are per
 * weekday, both of which only the server can weigh. So it sends its own
 * answer as `isCurrentlyOpen`, carried across untouched — see `FoodKitchen`.
 */
import { type Diet, type Dish, type Kitchen } from '@/types/food';
import { formatRupees } from '@/utils/money';

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
  /**
   * The customer-facing number, on the detail response only.
   *
   * `foodDiscovery.controller.js` keeps it apart from `ownerPhone` precisely so
   * that this one may be shown; the list row does not carry it, so a kitchen
   * known only from the feed has no number to dial.
   */
  contactNumber?: string;
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

/**
 * The delivery rule the partner configured, kept whole rather than flattened
 * to one number.
 *
 * The number alone lies on two of the three schemes. `free_above` waives the
 * fee entirely once the basket reaches its threshold — the checkout in
 * `foodCustomerOrder.controller.js` does exactly that — so a card printing a
 * flat ₹19 is quoting money that will not be asked for. `distance_based` is
 * the reverse: the partner configures a per-kilometre rate and that same
 * checkout charges `amount` and nothing per kilometre, so a screen that
 * multiplied the rate by a distance would be inventing a charge.
 *
 * `amount` here is therefore what the server charges when no waiver applies,
 * on every scheme, and `freeAbove` is the only condition that changes it.
 */
export type DeliveryRule = {
  type: 'flat' | 'free_above' | 'distance_based';
  amount: number;
  /** Basket value at or above which delivery is free. `free_above` only. */
  freeAbove?: number;
};

const DELIVERY_TYPES: readonly DeliveryRule['type'][] = ['flat', 'free_above', 'distance_based'];

function deliveryRuleOf(kitchen: BackendKitchen): DeliveryRule {
  const fee = kitchen.deliveryFee;
  const type = DELIVERY_TYPES.find((known) => known === fee?.type) ?? 'flat';
  const freeAbove = num(fee?.freeAboveValue) ?? 0;

  return {
    type,
    amount: num(fee?.amount) ?? 0,
    /* Only when it can actually be reached. A threshold of 0 would read as
       "free over ₹0", which is a free-delivery kitchen described the long way
       round — and the checkout ignores it too. */
    ...(type === 'free_above' && freeAbove > 0 ? { freeAbove } : null),
  };
}

const dietOf = (isVeg: BackendDish['isVeg']): Diet =>
  isVeg === 'non-veg' ? 'nonveg' : isVeg === 'egg' ? 'egg' : 'veg';

/* ------------------------------------------------------------------ *
 * Kitchens
 * ------------------------------------------------------------------ */

/**
 * A kitchen as a live server answers it: the shared `Kitchen` shape, plus the
 * three facts only a server has.
 *
 * All three are OPTIONAL and every reader has to work without them, because
 * the same `Kitchen` type is also satisfied by the mock catalogue behind
 * `EXPO_PUBLIC_FOOD_MODE`, by a row cached before these fields shipped, and —
 * in the case of `contactNumber` — by every row that came from the feed rather
 * than from a kitchen's own page.
 *
 * They are read through the three functions below rather than off the object,
 * so that a screen holding a plain `Kitchen` can still ask, and so that what
 * "no answer" means is decided in one place instead of at each call site.
 */
export type FoodKitchen = Kitchen & {
  /** The server's own "taking orders this minute" answer. See the header. */
  openNow?: boolean;
  /** Which delivery scheme the checkout will price this kitchen with. */
  deliveryRule?: DeliveryRule;
  /** The number a diner may ring. Detail responses only. */
  contactNumber?: string;
  /**
   * What the kitchen adds to every order for packing it.
   *
   * A real charge, not a presentational one: `foodCustomerOrder.controller.js`
   * reads `restaurant.packagingCharge` and puts it into `grandTotal` on every
   * order it writes, pickup included. It travels on the DETAIL response only —
   * `foodDiscovery.controller.js` keeps it out of the feed projection — so a
   * kitchen known from the feed alone has no answer, which is why this is
   * optional and read through `packagingChargeOf` below.
   */
  packagingCharge?: number;

  /** Platform-wide, carried per kitchen — see `gstRateOf`. */
  gstRate?: number;
  platformFee?: number;
};

/** The server's open/closed answer, or undefined when none travelled. */
export function openNowOf(kitchen: FoodKitchen): boolean | undefined {
  return typeof kitchen.openNow === 'boolean' ? kitchen.openNow : undefined;
}

/** The number to ring, or undefined — in which case nothing may offer a call. */
export function contactNumberOf(kitchen: FoodKitchen): string | undefined {
  return kitchen.contactNumber?.trim() || undefined;
}

/**
 * GST and the platform fee, as the server reports them on every kitchen.
 *
 * Neither is the kitchen's: `foodCharges.util.js` on the server decides both
 * and they are the same for every restaurant. They ride on the kitchen shape
 * because the CART is what needs them, and the fallbacks below are what a
 * kitchen fetched before this change carries — the same figures rather than
 * zero, because a preview that quietly drops the tax is the version a diner
 * finds out about on the receipt.
 */
export function gstRateOf(kitchen: FoodKitchen): number {
  return typeof kitchen.gstRate === 'number' ? kitchen.gstRate : 5;
}

export function platformFeeOf(kitchen: FoodKitchen): number {
  return typeof kitchen.platformFee === 'number' ? kitchen.platformFee : 2;
}

/**
 * The packing charge this kitchen will add, or undefined when nobody has said.
 *
 * Undefined is a real answer and must not be flattened to zero by whatever
 * shows money: the feed does not carry the field, so "we have not loaded
 * this kitchen's own row yet" and "this kitchen packs for free" arrive looking
 * identical unless they are kept apart here. A bill that printed zero for the
 * first case would be quoting a total the server is about to exceed.
 */
export function packagingChargeOf(kitchen: FoodKitchen): number | undefined {
  return typeof kitchen.packagingCharge === 'number' ? kitchen.packagingCharge : undefined;
}

/**
 * What the checkout will actually charge to deliver this basket.
 *
 * The mirror of `foodCustomerOrder.controller.js`, and deliberately the only
 * copy of that rule on the device: the fee is waived outright once the items
 * reach a `free_above` threshold, and no other scheme carries a condition. A
 * per-kilometre rate is configured by the partner and never charged by that
 * endpoint, so it is not applied here either — a screen that multiplied it out
 * would be quoting money nobody collects.
 */
export function deliveryFeeFor(kitchen: FoodKitchen, itemsTotal: number): number {
  const freeAbove = kitchen.deliveryRule?.freeAbove;
  return freeAbove && itemsTotal >= freeAbove ? 0 : kitchen.deliveryFee;
}

/**
 * "Free over ₹199" — the condition that makes the printed fee disappear.
 *
 * Null on every other scheme, and null on a kitchen that delivers free anyway,
 * where there is no threshold worth reaching.
 */
export function freeDeliveryAbove(kitchen: FoodKitchen): string | null {
  const freeAbove = kitchen.deliveryRule?.freeAbove;
  if (!freeAbove || kitchen.deliveryFee === 0) return null;
  return `Free over ${formatRupees(freeAbove)}`;
}

/**
 * The one delivery sentence a card is allowed to print.
 *
 * A flat fee on a `free_above` kitchen is a fee the checkout will waive, so
 * the threshold travels with the number rather than being dropped for want of
 * room. Nothing here mentions kilometres: see `DeliveryRule`.
 */
export function deliveryLabel(kitchen: FoodKitchen): string {
  if (kitchen.deliveryFee === 0) return 'Free delivery';
  const waiver = freeDeliveryAbove(kitchen);
  const flat = `${formatRupees(kitchen.deliveryFee)} delivery`;
  return waiver ? `${flat}, ${waiver.toLowerCase()}` : flat;
}

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

export function toKitchen(raw: BackendKitchen, sections: readonly string[] = []): FoodKitchen {
  const rating = num(raw.ratingAvg) ?? 0;
  const ratingCount = num(raw.ratingCount) ?? 0;
  const delivery = deliveryRuleOf(raw);

  return {
    id: raw.restaurantId,
    name: raw.restaurantName?.trim() || 'Unnamed kitchen',
    /* The tagline is the restaurant's own words and beats a joined list of
       tags; the cuisines are the fallback. */
    cuisine: raw.description?.trim() || (raw.cuisineTypes ?? []).join(', ') || '',
    /* The raw tags, kept alongside the reading line above — see the note on
       `Kitchen.cuisineTypes`. */
    cuisineTypes: raw.cuisineTypes ?? [],
    landmark: raw.address?.landmark?.trim() || raw.address?.line1?.trim() || '',
    /* Zero rather than absent: `Kitchen.walkMinutes` is required, and the
       card treats 0 as "we do not know" and prints nothing. */
    walkMinutes: walkMinutesFrom(raw.distanceKm) ?? 0,
    rating,
    ratingCount,
    /* What the checkout charges when no waiver applies. The rule beside it is
       what lets a screen say so honestly. */
    deliveryFee: delivery.amount,
    deliveryRule: delivery,
    minOrder: num(raw.minOrderValue) ?? 0,
    /* Carried only when the response actually carried it. `num` answers 0 for
       a null — which is what the checkout's own `money()` does with the same
       value — and undefined for a field that never travelled, and those two
       must stay apart: one is a kitchen that packs for free, the other is a
       kitchen whose row we have not read. */
    ...(num(raw.packagingCharge) !== undefined ? { packagingCharge: num(raw.packagingCharge) } : null),
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
    /* Carried, never recomputed. Absent on anything that predates the field,
       which is the one case a screen falls back to the hours for. */
    ...(typeof raw.isCurrentlyOpen === 'boolean' ? { openNow: raw.isCurrentlyOpen } : null),
    ...(raw.contactNumber?.trim() ? { contactNumber: raw.contactNumber.trim() } : null),
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

export function toDish(raw: BackendDish, kitchenId: string): Dish {
  const full = num(raw.price) ?? 0;
  const offer = num(raw.discountedPrice ?? undefined);
  /* What one of this dish costs before any option — the offer price when the
     kitchen is running one, exactly as the checkout picks it. */
  const base = offer && offer > 0 ? offer : full;

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

     The difference is measured from `base`, the price this dish is actually
     charged at, and not from `price`. The checkout replaces the whole base
     with the variant's own price — an offer on the dish does not survive
     choosing a bigger portion — so a delta taken from the full price would
     leave the cart quoting `offer + variant − full` for a line the server
     charges `variant` for, and the two would disagree by the discount on every
     order of a discounted dish in a large portion.

     The id prefix is load-bearing, not cosmetic: when the order is placed the
     two have to be told apart again, because the server treats a variant as
     REPLACING the price and an add-on as adding to it. `splitOptions` below is
     the only thing allowed to read it. */
  const portions = (raw.variants ?? [])
    .filter((v) => v?.name && (num(v.price) ?? 0) > base)
    .map((v, i) => ({
      id: `${VARIANT_PREFIX}${raw.productId}-${i}`,
      label: String(v.name),
      price: (num(v.price) ?? 0) - base,
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
    price: base,
    diet: dietOf(raw.isVeg),
    section: raw.category?.trim() || 'Menu',
    /* A dish is orderable whenever its kitchen is trading — there is no
       per-dish availability window on the server, only `isAvailable`. */
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

export type KitchenWithMenu = { kitchen: FoodKitchen; dishes: Dish[] };

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
      .map((item) => toDish(item, kitchen.id)),
  );

  return { kitchen, dishes };
}
