/* ══════════════════════════════════════════════════════════════════════════
   The shaping layer for the WEBSITE's food pages.

   ## What this module is for

   `Frontend/src/data/food.js` is a 606-line hand-written fixture. Its own
   header says so: "MOCK FOOD CATALOGUE — the whole food surface runs on this
   file. Nothing here is fetched." Every food page on lampose.com — the feed,
   a kitchen, a dish sheet, the cart, checkout, the orders list and the
   tracking screen — reads that module and nothing else.

   These endpoints replace it. The shapes below reproduce that file's exports
   FIELD FOR FIELD, so swapping the import is a change of source and not a
   rewrite of every component — which is exactly the promise the fixture's own
   header makes.

   ## Why a separate module rather than more routes under /food-partners

   `foodpartners/foodDiscovery.controller.js` already serves a public
   restaurant listing, and it serves it to the MOBILE apps. Its reply is
   shaped for those screens: `restaurantId`, `productName`, `isVeg`,
   `ratingAvg`. The website's components want `id`, `name`, `diet`, `rating`,
   plus a dozen presentational fields the apps have no use for (`tone`,
   `sections`, `walkMinutes`, `deliveryWindow`).

   Bending one reply to feed both would mean every app screen carrying the
   website's fields and every website component carrying the app's. So the
   surfaces stay apart and the ROUTES stay apart, which is what was asked for.

   ## What is NOT duplicated, and this is the important half

   `LISTED` — `{ verificationStatus: 'approved', isActive: true }` — is
   imported from `foodDiscovery.controller.js` rather than retyped here. It is
   the one condition that decides whether an unapproved or switched-off
   kitchen appears in public, and the day somebody narrows it there it must
   narrow here too. A second copy is a second answer.

   The same reasoning governs the projections: every read below names the
   fields it wants POSITIVELY. These routes are unauthenticated, so a
   deny-list would publish the owner's phone number the first time somebody
   added a field to the schema and forgot this file.

   ## Money

   Whole rupees everywhere, no paise and no floats — the fixture's rule, kept
   because the components format with its `rupees()` helper and a float would
   render "₹189.00000000001" on somebody's checkout.
   ══════════════════════════════════════════════════════════════════════════ */

/*
 * The shared serialisers' home, imported for the ONE constant that is a
 * security decision rather than a presentation one. See the header.
 */
const { LISTED } = require('../foodpartners/foodDiscovery.controller');

/*
 * The model's OWN "is this kitchen taking orders" rule - see the header of
 * `opensAtLabel` for why it is imported and not written here. It is the same
 * function the order path calls before it accepts an order.
 */
const FoodRestaurant = require('../foodpartners/foodRestaurant.model');

const { isOpenNow } = FoodRestaurant;

/* ── Small helpers ──────────────────────────────────────────────────────── */

/** Whole rupees. `null`/`undefined`/NaN all become 0 rather than NaN on a bill. */
const rupees = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : 0;
};

/** First non-empty string, or ''. Saves a chain of `||` on every field. */
const firstOf = (...values) => {
  for (const value of values) {
    const text = String(value == null ? '' : value).trim();
    if (text) return text;
  }
  return '';
};

/*
 * The card colours the website uses.
 *
 * `tone` is PURELY presentational — it picks a pastel for a card and means
 * nothing to the kitchen. There is no column for it and there should not be:
 * an owner has no opinion about which pastel their card is, and a nullable
 * enum on `food_restaurants` would be a migration in exchange for nothing.
 *
 * So it is derived from the id, deterministically. Deterministic matters more
 * than pretty here: a random tone per request would repaint every card on
 * every poll of the feed, which reads as the page flickering.
 */
const TONES = ['stone', 'sage', 'sand', 'clay', 'blush', 'lilac'];

const toneFor = (id) => {
  const key = String(id || '');
  let sum = 0;
  for (let i = 0; i < key.length; i += 1) sum = (sum + key.charCodeAt(i)) % 997;
  return TONES[sum % TONES.length];
};

/*
 * `isVeg` → `diet`, and the two vocabularies are NOT the same strings.
 *
 * The database spells it with a hyphen — `IS_VEG_VALUES` on both
 * `foodProduct.model.js` and the order line is `['veg', 'non-veg', 'egg']`.
 * The website's components switch on `'nonveg'`, without one. A straight
 * pass-through therefore renders every chicken biryani in the veg colour,
 * which is the single worst thing this file could get wrong.
 *
 * So the hyphen is stripped and the result checked against the website's
 * three. Both spellings in, one spelling out.
 *
 * ## An unrecognised value is NON-VEG, not veg
 *
 * The model defaults `isVeg` to 'veg', and it is tempting to do the same
 * here. It is the wrong direction. A dish whose diet this function does not
 * recognise is a dish nobody has established the diet of, and the cost of the
 * two mistakes is not symmetrical: labelling meat as veg puts it in front of
 * somebody who does not eat it, and labelling veg as meat costs an order.
 * A fourth enum value added upstream lands here as 'nonveg' and is visible,
 * rather than silently joining the veg list.
 */
const DIETS = new Set(['veg', 'egg', 'nonveg']);

const dietOf = (isVeg) => {
  const normalised = String(isVeg == null ? '' : isVeg).trim().toLowerCase().replace(/-/g, '');
  return DIETS.has(normalised) ? normalised : 'nonveg';
};

/** Cloudinary url off an `imageSchema` sub-document, or ''. */
const imageUrl = (image) => firstOf(image && image.url);

/* ── Opening hours ──────────────────────────────────────────────────────── */

/*
 * Indexed by `Date#getDay()`, which is 0 = Sunday.
 *
 * Capitalised, and Sunday FIRST, because both halves have to match something
 * different: the strings are compared against `openingHours[].day`, whose
 * enum on `foodRestaurant.model.js` is `['Monday' … 'Sunday']` — capitalised
 * and Monday-first — while the INDEX has to line up with `getDay()`.
 *
 * Getting either wrong fails silently and identically: no row matches today,
 * `isOpenNow` returns false, and every kitchen on the feed reads "closed" at
 * lunchtime.
 */
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/*
 * "What day and minute is it in the kitchen's city?" — always India.
 *
 * `openingHours` are wall-clock times in the restaurant's own timezone, and
 * every restaurant on this platform is in India. Reading them against
 * `Date#getHours()` compares them with the SERVER's clock instead, which is
 * only the same thing by coincidence: a developer's laptop is IST and works,
 * while the VPS in `deploy/` is a stock Linux box on UTC, where every kitchen
 * would be judged five and a half hours wrong — open at 5:30 am, shut at
 * lunchtime — with nothing in any log to say why.
 *
 * `Intl` is asked for the two parts it can answer without a timezone
 * database of our own, and `% 24` guards the engines that print midnight as
 * "24".
 */
const KITCHEN_TZ = 'Asia/Kolkata';

const clockIn = (now = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: KITCHEN_TZ, weekday: 'long', hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
  }).formatToParts(now);
  const part = (type) => (parts.find((p) => p.type === type) || {}).value;
  return {
    day: part('weekday'),
    minutes: ((Number(part('hour')) % 24) * 60) + Number(part('minute')),
  };
};

/** "07:00" → minutes past midnight. Returns null on anything malformed. */
const minutesOf = (hhmm) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (hours > 23 || mins > 59) return null;
  return (hours * 60) + mins;
};

/** "07:00" → "7 am", the way the fixture writes a closing time. */
const clockLabel = (hhmm) => {
  const total = minutesOf(hhmm);
  if (total === null) return '';
  const hour24 = Math.floor(total / 60);
  const mins = total % 60;
  const suffix = hour24 < 12 ? 'am' : 'pm';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return mins === 0 ? `${hour12} ${suffix}` : `${hour12}:${String(mins).padStart(2, '0')} ${suffix}`;
};

/*
 * `isOpenNow` is NOT defined in this file, on purpose.
 *
 * It used to be, and it disagreed with the real rule in three ways: a kitchen
 * with no timetable read OPEN here while the model says CLOSED (so the feed
 * offered it and checkout answered `RESTAURANT_CLOSED`), a slot that crosses
 * midnight was judged against today's rows only and was wrong at 1 am in both
 * directions, and a slot whose open and close times were equal was accepted.
 *
 * Two implementations of one question is a website that says "open" while the
 * button underneath says "closed". So there is one - the model's, imported
 * above - and it is what the order path checks before it takes an order.
 */

/**
 * When a CLOSED kitchen next opens, in the words the card prints after
 * "Opens at" — or '' when that cannot be said honestly.
 *
 *   later today    "5 pm"
 *   tomorrow       "tomorrow 11 am"
 *   further out    "Mon 11 am"
 *
 * Empty in three cases, and each is a real answer rather than a gap:
 *
 *   open right now      nothing to say
 *   `openState:closed`  the OWNER shut it by hand. The timetable says nothing
 *                       about when they will reopen, and "opens at 5 pm" for a
 *                       kitchen that closed for a wedding is a promise nobody
 *                       made. The card says "closed right now" instead.
 *   no timetable        nothing to derive it from
 */
const opensAtLabel = (restaurant, now = new Date()) => {
  if (isOpenNow(restaurant, now) || restaurant.openState === 'closed') return '';

  const hours = Array.isArray(restaurant.openingHours) ? restaurant.openingHours : [];
  if (!hours.length) return '';

  const { day: today, minutes: nowMinutes } = clockIn(now);
  const startIndex = WEEKDAYS.indexOf(today);

  for (let ahead = 0; ahead < 7; ahead += 1) {
    const dayIndex = (startIndex + ahead) % 7;
    const rows = hours.filter((row) => row && row.day === WEEKDAYS[dayIndex]);

    /* Today only counts windows still to come; every later day counts all. */
    const opens = rows
      .map((row) => ({ at: minutesOf(row.openTime), raw: row.openTime }))
      .filter((row) => row.at !== null && (ahead > 0 || row.at > nowMinutes))
      .sort((a, b) => a.at - b.at);

    if (opens.length) {
      const clock = clockLabel(opens[0].raw);
      if (ahead === 0) return clock;
      if (ahead === 1) return `tomorrow ${clock}`;
      return `${WEEKDAYS[dayIndex].slice(0, 3)} ${clock}`;
    }
  }
  return '';
};

/** "Open 7:00 am – 11:00 pm, all days", or '' when no timetable was filled. */
const hoursLabel = (restaurant) => {
  const hours = Array.isArray(restaurant.openingHours) ? restaurant.openingHours : [];
  if (!hours.length) return '';
  const opens = hours.map((row) => minutesOf(row.openTime)).filter((v) => v !== null);
  const closes = hours.map((row) => minutesOf(row.closeTime)).filter((v) => v !== null);
  if (!opens.length || !closes.length) return '';

  const earliest = Math.min(...opens);
  const latest = Math.max(...closes);
  const asHHMM = (total) => `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  const everyDay = new Set(hours.map((row) => row.day)).size >= 7;

  return `Open ${clockLabel(asHHMM(earliest))} – ${clockLabel(asHHMM(latest))}, ${everyDay ? 'all days' : 'selected days'}`;
};

/** The closing time on the card — "11 pm". */
const closesAtLabel = (restaurant) => {
  const hours = Array.isArray(restaurant.openingHours) ? restaurant.openingHours : [];
  const closes = hours.map((row) => minutesOf(row.closeTime)).filter((v) => v !== null);
  if (!closes.length) return '';
  const latest = Math.max(...closes);
  return clockLabel(`${String(Math.floor(latest / 60)).padStart(2, '0')}:${String(latest % 60).padStart(2, '0')}`);
};

/* ── Distance ───────────────────────────────────────────────────────────── */

/**
 * Walking minutes from metres, at 75 m/min.
 *
 * A figure, not a route: there is no directions service in this process and
 * one would be a paid API call per card on a feed of thirty. 75 m/min is a
 * loaded student walking, which is the person reading it. Returns null when
 * the caller sent no coordinates — the card then simply omits the line rather
 * than inventing "12 min" for a kitchen that might be in another city.
 */
const walkMinutesFrom = (distanceMeters) => {
  const metres = Number(distanceMeters);
  if (!Number.isFinite(metres) || metres < 0) return null;
  return Math.max(1, Math.round(metres / 75));
};

/*
 * How long the ride takes, as a flat figure.
 *
 * Travel time is not stored and nothing measures it. Eighteen minutes is the
 * figure the fixture used for a nearby kitchen, applied uniformly rather than
 * per-restaurant because a per-restaurant guess would look like a measurement.
 *
 * Exported because the TRACKING page needs the same number: it adds this to
 * the kitchen's own "ready by" to answer "arriving by", and a second copy of
 * 18 is how the feed comes to promise 30 minutes while the tracking page says
 * 45 for the same order.
 */
const RIDE_MINUTES = 18;

/* The platform's own charges, from the file that defines them. Required here
   rather than restated so a rate change is one edit. */
const { GST_RATE, PLATFORM_FEE } = require('../foodpartners/foodCharges.util');

/** "25–30 min", built from prep + travel. Both halves are the kitchen's own. */
const deliveryWindowLabel = (prepMinutes, deliveryMinutes) => {
  const total = rupees(prepMinutes) + rupees(deliveryMinutes);
  if (!total) return '';
  const low = Math.max(5, total - 5);
  return `${low}–${total} min`;
};

/* ── The shapes ─────────────────────────────────────────────────────────── */

/**
 * One row of `KITCHENS`.
 *
 * Every property the fixture exports is present, because a component reading
 * `kitchen.deliveryWindow` does not check first. Where the database has no
 * equivalent the value is '' / 0 / null rather than absent, so the component
 * renders an empty line instead of the string "undefined".
 *
 * Fields with no column behind them, and what each does instead:
 *
 *   tone          derived from the id — see `toneFor`
 *   walkMinutes   derived from `?lat&lng`, null without them
 *   costForOne    the caller passes it; it is an aggregate over the menu and
 *                 is computed once per query rather than once per row
 *   pureVeg       likewise an aggregate — a kitchen is pure veg when NOTHING
 *                 on its menu is egg or non-veg. Computed from the menu and
 *                 never guessed: a kitchen with no dishes loaded yet is NOT
 *                 pure veg, which is the same rule the fixture's `isPureVeg`
 *                 follows for the same reason.
 *   offer         no promotions model exists — see `coupons.controller.js`
 *   ordersInBlock no per-hostel counter exists; see `dishCard`
 *
 * @param {object} doc          a lean `food_restaurants` document
 * @param {object} [extras]     aggregates the caller computed for this row
 * @param {number} [extras.costForOne]
 * @param {boolean}[extras.pureVeg]
 * @param {string[]}[extras.sections]
 * @param {number} [extras.distanceMeters]  from $geoNear, when located
 */
const kitchenCard = (doc, extras = {}) => {
  const prepMinutes = rupees(doc.avgPreparationTime);
  const deliveryMinutes = prepMinutes ? RIDE_MINUTES : 0;

  return {
    id: doc.restaurantId,
    name: doc.restaurantName,
    /* "South Indian · Thali" — the same middot the fixture uses. */
    cuisine: (doc.cuisineTypes || []).join(' · '),
    cuisineTypes: doc.cuisineTypes || [],
    tagline: doc.description || '',
    landmark: firstOf(doc.address && doc.address.landmark, doc.address && doc.address.line1),
    walkMinutes: walkMinutesFrom(extras.distanceMeters),
    costForOne: rupees(extras.costForOne),
    rating: Number(doc.ratingAvg) || 0,
    ratingCount: rupees(doc.ratingCount),
    deliveryFee: rupees(doc.deliveryFee && doc.deliveryFee.amount != null ? doc.deliveryFee.amount : doc.deliveryFee),
    /*
     * "Free delivery above Rs X" - the ONE other rule the order endpoint applies
     * to the fee (`foodCustomerOrder.controller.js`: `type === 'free_above'` and
     * an item total at or over `freeAboveValue`). Without it the website quotes
     * the flat fee on an order the server then charges nothing for, and the
     * total on the checkout page is not the total on the order. 0 means the
     * kitchen has no such rule.
     */
    freeDeliveryAbove: doc.deliveryFee && doc.deliveryFee.type === 'free_above'
      ? rupees(doc.deliveryFee.freeAboveValue)
      : 0,
    /*
     * Both are ZERO now, and both stay in the shape.
     *
     * A kitchen has no minimum order any more and its packaging charge is no
     * longer billed — `foodCharges.util.js` says why. They are reported as 0
     * rather than dropped because the website's cart reads both by name and a
     * missing key would read as `undefined` in an arithmetic line; zero is the
     * honest figure and it falls out of every sum on its own.
     */
    packagingCharge: 0,
    minOrder: 0,

    /*
     * What the platform adds on top, carried on the kitchen card.
     *
     * Neither figure is the kitchen's — they are the same for every
     * restaurant, and `foodCharges.util.js` is where they are decided. They
     * ride on this shape because the CART is what needs them, and the kitchen
     * card is the object a cart already holds: the alternative is each client
     * hardcoding 5 and 2, which is how a cart comes to preview ₹240 for an
     * order the server charges ₹254 for.
     */
    gstRate: GST_RATE,
    platformFee: PLATFORM_FEE,
    prepMinutes,
    deliveryMinutes,
    deliveryWindow: deliveryWindowLabel(prepMinutes, deliveryMinutes),
    pureVeg: Boolean(extras.pureVeg),
    openNow: isOpenNow(doc),
    /* Empty while open, and empty when the owner closed it by hand — see
       `opensAtLabel`. The card copes with both. */
    opensAt: opensAtLabel(doc),
    hours: hoursLabel(doc),
    closesAt: closesAtLabel(doc),
    /* The licence number IS public — it is the one document a diner is
       entitled to see, and every food app prints it at the foot of a menu.
       The other licences (GST, PAN) are not, and are never selected. */
    fssai: doc.fssaiLicenseNumber || '',
    tone: toneFor(doc.restaurantId),
    logoUrl: imageUrl(doc.logoImage),
    coverUrl: imageUrl(doc.coverBannerImage),
    offer: '',
    sections: extras.sections || [],
    acceptsCod: doc.acceptsCod !== false,
    acceptsOnlinePayment: doc.acceptsOnlinePayment !== false,
  };
};

/**
 * One row of `DISHES`.
 *
 * `price` is what the diner pays — `discountedPrice` when the kitchen set
 * one, the list price otherwise. The fixture has a single `price` and the
 * cart multiplies it by quantity, so sending the list price here would
 * under-charge a discounted dish at checkout and the bill would disagree with
 * the order. `mrp` carries the struck-through figure for the card.
 *
 * There is deliberately NO `ordersInBlock`. The fixture had one - "popular in
 * your PG", "orders from your block this week" - and this process has no
 * per-hostel order counter to back it: that needs the diner's address joined
 * to past orders, which nobody has asked for. An earlier version sent the
 * dish's rating count under that name, which the page then described as
 * orders from the diner's block. The popular strip is ranked by `ratingCount`
 * and says so; nothing here pretends to be more local than it is.
 */
const dishCard = (doc) => {
  const listPrice = rupees(doc.price);
  const discounted = rupees(doc.discountedPrice);
  const payable = discounted > 0 && discounted < listPrice ? discounted : listPrice;
  const tags = Array.isArray(doc.tags) ? doc.tags : [];

  return {
    id: doc.productId,
    kitchenId: doc.restaurantId,
    name: doc.productName,
    price: payable,
    mrp: payable < listPrice ? listPrice : null,
    diet: dietOf(doc.isVeg),
    /* The menu heading this dish sits under — the same string the kitchen
       typed, so the sections on the kitchen page are the kitchen's own words
       and not a taxonomy invented here. */
    section: doc.category || 'Recommended',
    recommended: tags.includes('recommended'),
    bestseller: tags.includes('bestseller'),
    rating: Number(doc.ratingAvg) || 0,
    ratingCount: rupees(doc.ratingCount),
    /* `serves` is a NUMBER on the model and a SENTENCE on the card. */
    serves: doc.serves ? `Serves ${doc.serves}` : '',
    tone: toneFor(doc.productId),
    description: doc.description || '',
    imageUrl: imageUrl(doc.productImage),
    allergens: Array.isArray(doc.allergenInfo) ? doc.allergenInfo : [],
    /* `soldOut` rather than dropping the row: a sold-out add-on is shown
       struck through, which is how the diner learns it exists at all. */
    addOns: (Array.isArray(doc.addOns) ? doc.addOns : []).map((addOn) => ({
      id: firstOf(addOn.id, addOn.name),
      label: addOn.name,
      price: rupees(addOn.price),
      soldOut: addOn.isAvailable === false,
    })),
    variants: (Array.isArray(doc.variants) ? doc.variants : []).map((variant) => ({
      id: firstOf(variant.id, variant.name),
      label: variant.name,
      price: rupees(variant.price),
      soldOut: variant.isAvailable === false,
    })),
    spiceFixed: doc.spiceLevel != null,
    spiceLevel: doc.spiceLevel || null,
    calories: doc.calories == null ? null : rupees(doc.calories),
    available: doc.isAvailable !== false,
    /* The same fact, negated, under the name the website's components already
       switch on — the menu's "hide sold out" filter and the add-on rows both
       read `soldOut`. Sent rather than derived on the client so one dish
       cannot be sold out in the list and available in the sheet. */
    soldOut: doc.isAvailable === false,
  };
};

module.exports = {
  LISTED,
  RIDE_MINUTES,
  rupees,
  firstOf,
  toneFor,
  dietOf,
  imageUrl,
  isOpenNow,
  opensAtLabel,
  hoursLabel,
  closesAtLabel,
  clockLabel,
  walkMinutesFrom,
  deliveryWindowLabel,
  kitchenCard,
  dishCard,
};
