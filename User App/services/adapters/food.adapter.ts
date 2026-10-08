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
import { type Diet, type DineInFloor, type Dish, type Kitchen } from '@/types/food';
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
  /** The restaurant's own photos. On the detail response only. */
  galleryImages?: BackendFoodImage[];
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
  /** Feed rows only: taking table bookings right now. */
  dineInAvailable?: boolean;
  /** Detail only: the floor, or null when it takes no table bookings. */
  dineIn?: BackendDineIn | null;
};

/** `dineIn` as `foodDiscovery.controller.js` projects it — see `DineInFloor`. */
export type BackendDineIn = {
  available?: boolean;
  paused?: boolean;
  seatingCapacity?: number;
  tableCount?: number;
  tableTypes?: { seats?: number; count?: number }[];
  maxPartySize?: number;
  acSeating?: string | null;
  indoorSeating?: boolean;
  outdoorSeating?: boolean;
  familySeating?: boolean;
  coupleSeating?: boolean;
  smoking?: string | null;
  wheelchairAccessible?: boolean;
  parkingAvailable?: boolean;
  valetParking?: boolean;
  kidsFriendly?: boolean;
  petFriendly?: boolean;
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

/** Every real link in a list, once each, in order. */
const urls = (images: readonly BackendFoodImage[] | undefined): string[] => {
  const seen = new Set<string>();
  return (images ?? [])
    .map(url)
    .filter((value): value is string => !!value && !seen.has(value) && !!seen.add(value));
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
  /**
   * Taking table bookings right now. From the feed row, or — once the
   * kitchen's own page has been read — from its floor's `available`, which is
   * the same rule on the server. Absent on a row from before the field.
   */
  dineInAvailable?: boolean;
  /**
   * The floor. Detail responses only: null is "takes no table bookings",
   * undefined is "only the feed row has been read" — read through `dineInOf`.
   */
  dineIn?: DineInFloor | null;
};

/** Whether the "Dine-in" filter keeps this kitchen. Nobody saying is a no. */
export function takesTableBookings(kitchen: FoodKitchen): boolean {
  return kitchen.dineInAvailable === true;
}

/**
 * The floor, null when there is none, undefined when it has not been read.
 *
 * Those two are kept apart for the same reason `packagingChargeOf` keeps its
 * two apart: a kitchen known only from the feed has not said it takes no
 * bookings, and a page that hid "Book a table" on that would hide it from
 * every kitchen past the first page of menus.
 */
export function dineInOf(kitchen: FoodKitchen): DineInFloor | null | undefined {
  return kitchen.dineIn;
}

const AC_SEATING: readonly NonNullable<DineInFloor['acSeating']>[] = ['ac', 'non_ac', 'both'];
const SMOKING: readonly NonNullable<DineInFloor['smoking']>[] = ['non_smoking', 'smoking_area'];

/**
 * The floor, carried across. Null for a kitchen that takes no bookings —
 * which is what the server sends — and for anything that is not an object.
 */
export function toDineInFloor(raw: BackendDineIn | null | undefined): DineInFloor | null {
  if (!raw || typeof raw !== 'object') return null;
  const tableTypes = (raw.tableTypes ?? [])
    .map((type) => ({ seats: num(type?.seats) ?? 0, count: num(type?.count) ?? 0 }))
    .filter((type) => type.seats > 0 && type.count > 0);

  return {
    available: raw.available === true,
    paused: raw.paused === true,
    seatingCapacity: num(raw.seatingCapacity) ?? 0,
    tableCount: num(raw.tableCount) ?? 0,
    tableTypes,
    maxPartySize: num(raw.maxPartySize) ?? 0,
    acSeating: AC_SEATING.find((value) => value === raw.acSeating) ?? null,
    indoorSeating: raw.indoorSeating === true,
    outdoorSeating: raw.outdoorSeating === true,
    familySeating: raw.familySeating === true,
    coupleSeating: raw.coupleSeating === true,
    smoking: SMOKING.find((value) => value === raw.smoking) ?? null,
    wheelchairAccessible: raw.wheelchairAccessible === true,
    parkingAvailable: raw.parkingAvailable === true,
    valetParking: raw.valetParking === true,
    kidsFriendly: raw.kidsFriendly === true,
    petFriendly: raw.petFriendly === true,
  };
}

/** The server's open/closed answer, or undefined when none travelled. */
export function openNowOf(kitchen: FoodKitchen): boolean | undefined {
  return typeof kitchen.openNow === 'boolean' ? kitchen.openNow : undefined;
}

/** The number to ring, or undefined — in which case nothing may offer a call. */
export function contactNumberOf(kitchen: FoodKitchen): string | undefined {
  return kitchen.contactNumber?.trim() || undefined;
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
  /* Delivery is priced by distance at checkout (`foodPricing.js`), so a card
     can only promise where it starts — the first slab, which the server
     reports as `deliveryFee`. */
  if (kitchen.deliveryFee === 0) return 'Free delivery';
  return `Delivery from ${formatRupees(kitchen.deliveryFee)}`;
}


/** Join the parts we actually have, so a missing one leaves no stray separator. */
export function metaLine(...parts: (string | null | undefined)[]): string {
  return parts.filter((part) => !!part && String(part).trim()).join(' · ');
}

export function toKitchen(raw: BackendKitchen, sections: readonly string[] = []): FoodKitchen {
  const rating = num(raw.ratingAvg) ?? 0;
  const ratingCount = num(raw.ratingCount) ?? 0;
  const delivery = deliveryRuleOf(raw);
  const floor = toDineInFloor(raw.dineIn);

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
    /* Read at checkout — they were dropped here, so a cash-only kitchen was
       offered UPI and an online-only one was offered cash. Only an explicit
       `false` turns a method off. */
    acceptsCod: raw.acceptsCod !== false,
    acceptsOnline: raw.acceptsOnlinePayment !== false,
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
    /* Dine-in: the feed row says yes or no; the kitchen's own page carries
       the floor, whose `available` is the same answer. Neither is invented
       for a response that carried neither. */
    ...(raw.dineIn !== undefined ? { dineIn: floor } : null),
    ...(typeof raw.dineInAvailable === 'boolean'
      ? { dineInAvailable: raw.dineInAvailable }
      : raw.dineIn !== undefined
        ? { dineInAvailable: floor?.available === true }
        : null),
    ...(url(raw.coverBannerImage) || url(raw.logoImage)
      ? { photo: url(raw.coverBannerImage) ?? url(raw.logoImage) }
      : null),
    ...(url(raw.coverBannerImage) ? { cover: url(raw.coverBannerImage) } : null),
    ...(url(raw.logoImage) ? { logo: url(raw.logoImage) } : null),
    ...(urls(raw.galleryImages).length ? { gallery: urls(raw.galleryImages) } : null),
  };
}

/* ------------------------------------------------------------------ *
 * Dishes
 * ------------------------------------------------------------------ */

/* The two kinds of option, kept apart by their id. A variant REPLACES the
   dish's price on the server; an add-on adds to it. */
const VARIANT_PREFIX = 'v:';
const ADDON_PREFIX = 'a:';

/** Whether an option is a PORTION (a variant) rather than an add-on. A dish
 *  takes at most one portion — the server prices it by replacing the base. */
export const isPortionOption = (id: string): boolean => id.startsWith(VARIANT_PREFIX);

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
    /* Every named portion with a price — CHEAPER ones too. A half plate below
       the full price was dropped here (only dearer portions survived), so a
       dish sold as half/full could only ever be ordered full. The difference
       may be negative; the server prices the variant outright either way. */
    .filter((v) => v?.name && (num(v.price) ?? 0) > 0 && (num(v.price) ?? 0) !== base)
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
    ...(urls([raw.productImage ?? null, ...(raw.galleryImages ?? [])]).length > 1
      ? { photos: urls([raw.productImage ?? null, ...(raw.galleryImages ?? [])]) }
      : null),
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
