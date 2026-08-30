/* ══════════════════════════════════════════════════════════════════════════
   The three screens a customer sees: the Restaurant Listing, the Food Listing
   (one restaurant and its menu) and the Product Details screen.

   These are the only routes in this module that nobody signs in for, and
   almost every decision in this file follows from that one fact.

   ## Two conditions, and both are load bearing

   Every read here filters on `verificationStatus: 'approved'` AND
   `isActive: true`. They are not the same thing — see the header of
   `foodRestaurant.model.js` — and a route that remembered only the first
   would list a kitchen a human approved in March which switched itself off in
   June. The pair is written once, as `LISTED`, and spread into every query in
   this file, so no handler can carry half of it.

   ## The projections are explicit, and that is belt AND braces

   `foodRestaurant.model.js` already deletes `passwordHash` and
   `payout.bankAccountNumber` in `toJSON`, and this file does not rely on it.
   Every read here is `.lean()` (or an aggregation, which is lean by nature),
   and a lean document never passes through `toJSON` at all — the transform is
   not in the path. More to the point, an unauthenticated route is the one
   place in this process where a mistake is not a leak to a signed-in partner
   but a leak to anybody holding the URL.

   So each handler names the fields it wants, positively, and builds its reply
   from named properties rather than spreading a document into one. What must
   never appear on these three routes is the owner's name, phone and email,
   the password hash, the whole `payout` sub-document, the licence numbers
   (FSSAI, GST, PAN), `verificationDocuments` and the `contract` terms. A
   positive projection means that adding a field to the schema cannot publish
   it here by accident; a deny-list would have meant exactly that, on the day
   somebody forgot to extend it.

   ## Distance, and the order of the pair

   `?lat&lng` is the reason the restaurant carries a GeoJSON point at all. The
   pair is turned into a point by `toGeoPoint(lat, lng)` in
   `foodPartner.util.js`, which is the ONE place in this module that flips it
   into Mongo's `[longitude, latitude]`. Nothing in this file assembles a
   coordinate pair by hand, because the swap does not throw — it returns an
   empty list that looks exactly like "no restaurants near you" rather than
   like a fault.

   The nearby query is an aggregation with `$geoNear` rather than a `find`
   with `$near`, for one reason: `$geoNear` reports the distance it computed,
   and every listing row is required to carry `distanceKm`. Recomputing it in
   JavaScript would be a second implementation of the earth's radius living a
   few lines from the first, and the copy that drifts is always the one nobody
   was watching.

   Counting is the trap inside that decision, and it is worth naming: neither
   `$near` nor `$geoNear` may appear in `countDocuments`, which wraps its
   filter in a `$match`, and `$geoNear` must additionally be the first stage
   of a pipeline. The total is therefore counted with
   `$geoWithin: $centerSphere` over the same circle — same centre, same
   radius, no sort — and both are built from one set of numbers so that a page
   and its total cannot disagree about what "nearby" meant.

   ## `openNow` is derived, so it cannot be a predicate

   `isCurrentlyOpen` is a virtual, and `isOpenNow` the same rule over a plain
   object, because a persisted open flag is stale the moment nobody writes to
   it — the model sets out why at length. The cost of that lands here:
   `?openNow=true` cannot be part of the query, so it is applied after the
   read, which means the database cannot do the paging for that one case.

   It is handled by reading the matching set up to `OPEN_NOW_SCAN_CAP`,
   filtering it, and paging the result in memory, so `total` is the true count
   of open kitchens rather than the count of approved ones. `capped: true`
   appears on the reply when that ceiling was reached, which is the honest way
   to say the total is a floor. At the size this collection will be for a long
   time the cap is never met; when it is, the answer is a stored open/close
   window that Mongo can compare against, not a bigger number here.

   ## Nothing in this file writes

   No handler mutates anything, so there is no view counter and no "recently
   seen" side effect on a GET — the same rule `customers/saved.controller.js`
   keeps, and for the same reason: a prefetch, a retry or a refetch would fire
   it without anybody having looked at anything.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const FoodRestaurant = require('./foodRestaurant.model');
const FoodProduct = require('./foodProduct.model');
const { toGeoPoint } = require('./foodPartner.util');
const {
  logDiscovery, logRejected, logDependencyMissing, startTimer,
} = require('./foodPartner.log');
const { escapeRegex } = require('../../shared/utils/text');

const { isOpenNow, PARTNER_TYPES } = FoodRestaurant;

/* Printed in the 503 that names a missing index, so the line in the console
   says which call it was answering. */
const ROUTE_LIST = 'GET /api/v2/food-partners/restaurants';

/* ── The dials ────────────────────────────────────────────────────────────*/

const DEFAULT_LIMIT = 20;

/* Hard. A client asking for 10000 rows gets 50 and is not told off for it: a
   page size is a client's optimism, not an error worth failing a feed over,
   and `total` on the reply already tells it how much there was. */
const MAX_LIMIT = 50;

const DEFAULT_RADIUS_KM = 10;
const MAX_RADIUS_KM = 50;

/* See the header. The ceiling on the one query the database cannot page. */
const OPEN_NOW_SCAN_CAP = 500;

/* A search term is a literal after escaping, so its only remaining cost is
   the length of the scan it drives. Eighty characters is longer than any
   restaurant name in the collection. */
const MAX_SEARCH_CHARS = 80;

/* `?cuisine=` becomes one anchored regex per value. Twenty is four more than
   the sixteen chips the app draws, and it stops a query string from asking
   this process to compile five thousand of them. Same family of problem as
   the unescaped regex below, and the same shape of answer: bound it. */
const MAX_CUISINE_FILTERS = 20;

/* A public id is `FP-` plus eight characters, or `FPI-` plus eight. Nothing
   is shape-checked against that here — see `getRestaurant` — but a path
   parameter is still cut to a sane length before it becomes a query value. */
const MAX_ID_CHARS = 40;

/*
 * `$centerSphere` takes its radius in RADIANS, which is kilometres over the
 * earth's radius. 6378.1 is the equatorial radius MongoDB's own documentation
 * uses for this conversion; agreeing with it keeps the count and `$geoNear`'s
 * metres talking about the same circle to within a few tens of metres over
 * ten kilometres, which is well inside the accuracy of the pin itself.
 */
const EARTH_RADIUS_KM = 6378.1;

/*
 * The floor under every query in this file. Approved is not the same as
 * listed; both are required, and writing the pair once is what stops a
 * handler from carrying only one of them.
 */
const LISTED = { verificationStatus: 'approved', isActive: true };

/*
 * Newest first, and deliberately not "best rated first".
 *
 * `ratingAvg` is derived from orders this process does not yet place, so it
 * is 0 on every document in the collection — sorting by it would be a random
 * order dressed up as a ranking, which is worse than an obvious one. The
 * compound index in the model ends in `createdAt: -1`, so this is also the
 * sort the database can already serve for the `LISTED` predicate.
 */
const NEWEST_FIRST = { createdAt: -1 };

/* ── Replies ──────────────────────────────────────────────────────────────
   `code`, `message` AND `error` on every failure, matching the rest of this
   module: the website reads `message`, the apps switch on `code`, and older
   screens still render `error`. Any one of the three missing is a blank alert
   on somebody's phone. */
const fail = (res, status, code, message) => res.status(status).json({
  success: false, code, message, error: message,
});

const badInput = (res, message, code = 'BAD_INPUT') => fail(res, 400, code, message);

/* These routes sit behind `requireLamposeDb`, which is the v2 rule and the
   first half of this. The second half is that a connection can drop between
   that guard and this query, and a buffered query surfaces as a generic 500
   ten seconds later rather than as the true answer immediately. */
const dbDown = (res) => fail(
  res,
  503,
  'DB_DISCONNECTED',
  'The server is running but not connected to the database.',
);

const notFound = (res) => fail(
  res,
  404,
  'NOT_FOUND',
  /* Deliberately the same answer for "there is no such id", "that kitchen was
     never approved" and "that kitchen is switched off". Telling them apart
     would turn a public URL into an oracle for which restaurants have applied
     and been refused. Same reasoning as `support/ticket.controller.js`. */
  'We could not find that.',
);

/* ── Reading the query string ─────────────────────────────────────────────*/

const asText = (value) => String(value === undefined || value === null ? '' : value).trim();

/*
 * A number, or null when the client said nothing.
 *
 * `Number(null)` is 0 and `Number.isFinite(Number(null))` is therefore TRUE,
 * which is exactly how a dish with no preparation-time override ends up
 * promising an ETA of no minutes at all. Absence is checked before the
 * conversion here so that it cannot.
 */
const maybeNumber = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const number = (value, fallback = 0) => {
  const parsed = maybeNumber(value);
  return parsed === null ? fallback : parsed;
};

/* `?openNow=false` must not filter anything. Only the four spellings of yes
   do, which is the same set `foodPartner.util.js` accepts for a boolean. */
const isYes = (value) => ['1', 'true', 'yes', 'on'].includes(asText(value).toLowerCase());

const readPaging = (query = {}) => {
  const askedLimit = maybeNumber(query.limit);
  const limit = askedLimit !== null && askedLimit >= 1
    ? Math.min(Math.floor(askedLimit), MAX_LIMIT)
    : DEFAULT_LIMIT;

  const askedPage = maybeNumber(query.page);
  const page = askedPage !== null && askedPage > 1 ? Math.floor(askedPage) : 1;

  return { page, limit, skip: (page - 1) * limit };
};

/**
 * `?cuisine=North Indian,Chinese` — any of these.
 *
 * A repeated parameter (`?cuisine=a&cuisine=b`) arrives from Express as an
 * array, and `String()` joins it with the same comma the single-parameter
 * form already uses, so both spellings land in the same split and neither
 * client has to know which one this endpoint prefers.
 */
const readCuisines = (raw) => {
  const values = [];
  const seen = new Set();

  for (const part of asText(raw).split(',')) {
    const value = part.trim();
    if (!value) continue;

    const key = value.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    values.push(value);
    if (values.length >= MAX_CUISINE_FILTERS) break;
  }

  return values;
};

/**
 * One cuisine, matched case-insensitively and exactly.
 *
 * Anchored, so that "Thai" cannot match "Thai Street Food"; escaped, because
 * the value came from a query string — see `searchFilter` for the whole of
 * that argument. Regexes rather than a plain `$in` follows
 * `listings/listing.controller.js`, where a filter chip has always matched
 * whatever case the caller sent. The stored values come from a fixed list,
 * but a kitchen may have typed its own, and a partner who wrote "biryani"
 * should still be found by a chip that says "Biryani".
 */
const exactly = (value) => new RegExp(`^${escapeRegex(value)}$`, 'i');

/**
 * `?search=` over the name and the tagline.
 *
 * ESCAPED, and the escaping is not decoration. A user-supplied string dropped
 * straight into a `RegExp` is two faults at once: an unbalanced bracket is a
 * syntax error, so a customer typing "(" gets a 500 from a search box, and a
 * nested quantifier is a denial of service — `(a+)+b` costs one query string
 * to send and is then evaluated against every document the filter reaches.
 * `escapeRegex` turns every metacharacter into a literal, so the worst a
 * caller can now do is ask for a slow literal scan of a small collection.
 *
 * A `$text` index would be the usual answer to "search a name", and it is
 * deliberately absent from the model: MongoDB refuses `$text` in the same
 * query as `$near`, and "search near me" is precisely what this screen sends.
 * A search that outgrows a regex wants Atlas Search, not `$text`.
 */
const searchFilter = (term) => {
  if (!term) return null;
  const pattern = new RegExp(escapeRegex(term), 'i');
  return { $or: [{ restaurantName: pattern }, { description: pattern }] };
};

/**
 * `?lat&lng&radiusKm`, or nothing at all.
 *
 * Half a pair is refused rather than ignored. A client that sent a latitude
 * and lost the longitude in a stringify would otherwise get an unsorted,
 * distance-less list that looks like a working screen with the wrong
 * restaurants on it, and "why is it not sorting by distance" is a fault
 * nobody can see from the outside. A named 400 says it in one line.
 */
const readLocation = (query = {}) => {
  const lat = asText(query.lat);
  const lng = asText(query.lng);

  if (!lat && !lng) return { point: null, radiusKm: null, error: null };

  if (!lat || !lng) {
    return {
      point: null,
      radiusKm: null,
      error: {
        code: 'MISSING_COORDINATE',
        message: 'Send both lat and lng, or neither.',
      },
    };
  }

  /* The one place in this module the pair is flipped into Mongo's order. The
     arguments are (lat, lng) because that is the order a person says them and
     a map library hands them over; what comes back is `[lng, lat]`. */
  const point = toGeoPoint(lat, lng);
  if (!point) {
    return {
      point: null,
      radiusKm: null,
      error: {
        code: 'BAD_COORDINATES',
        message: 'Those coordinates are not a place. Send lat between -90 and 90, and lng between -180 and 180.',
      },
    };
  }

  const asked = maybeNumber(query.radiusKm);
  const radiusKm = asked !== null && asked > 0
    ? Math.min(asked, MAX_RADIUS_KM)
    : DEFAULT_RADIUS_KM;

  return { point, radiusKm, error: null };
};

/* ── What each screen is sent ─────────────────────────────────────────────*/

/**
 * An image, as the one half a customer's phone draws.
 *
 * `publicId` is Cloudinary's handle for DELETING an asset. It is on the
 * document because the partner-side controllers need it, it is on no screen
 * in the customer app, and so it is on none of these replies. An object
 * rather than a bare string, so the shape does not change on the day a width
 * or a blur hash is added beside the URL.
 */
const imageUrl = (image) => ({ url: (image && image.url) || '' });

const imageList = (images) => (Array.isArray(images) ? images.map(imageUrl) : []);

const textList = (values) => (Array.isArray(values)
  ? values.map((value) => asText(value)).filter(Boolean)
  : []);

const options = (values) => (Array.isArray(values)
  ? values.map((option) => ({
    name: asText(option && option.name),
    price: number(option && option.price),
  }))
  : []);

/*
 * All four members, even though only one of them is charged.
 *
 * `type` decides which, and nothing else does — the model is explicit that a
 * checkout must never add two of them. The unused members are left at 0 on
 * the document rather than cleared, so sending the whole object is sending
 * what is stored, and the screen reads the one its type names.
 */
const deliveryFeeOf = (fee = {}) => ({
  type: (fee && fee.type) || 'flat',
  amount: number(fee && fee.amount),
  perKm: number(fee && fee.perKm),
  freeAboveValue: number(fee && fee.freeAboveValue),
});

/**
 * The one line of place a listing card prints under the name.
 *
 * There is no locality field on the address — it is line1, line2, city,
 * state, pincode and landmark — so "area" is the nearest thing a partner
 * actually types that reads as a place. The landmark is preferred over line2
 * because line2 is where a floor and a door number go, and "second floor" is
 * not somewhere a customer recognises. The full address is on the detail
 * screen, where it is being read to find the door rather than to choose.
 */
const placeOf = (address = {}) => ({
  city: (address && address.city) || '',
  area: (address && (address.landmark || address.line2)) || '',
});

/**
 * `[longitude, latitude]` out of the database, two NAMED numbers to the app.
 *
 * Handing a client a positional pair is handing it the classic bug in this
 * neighbourhood: a screen that reads `coordinates[0]` as a latitude puts a
 * Hyderabad kitchen in the Arctic Ocean, in range and unvalidatable, because
 * anywhere in India both numbers sit inside each other's legal bounds. Naming
 * them is the only defence that survives the next person to touch either end.
 */
const coordinatesOf = (location) => {
  const pair = location && Array.isArray(location.coordinates) ? location.coordinates : null;
  if (!pair || pair.length !== 2) return null;
  return { lat: pair[1], lng: pair[0] };
};

/**
 * One row of the Restaurant Listing screen, and nothing that screen does not
 * draw.
 *
 * Sending whole documents to a list is how a feed gets slow — twenty
 * restaurants carrying their payout block and their licence numbers is a
 * payload an order of magnitude larger than the cards need, on the screen that
 * opens most often and most often over mobile data. `description` is here
 * because the model calls it the tagline under the name on this very card;
 * `restaurantId` because a row nobody can tap is not a row.
 *
 * ## Why `openingHours` IS on the row, despite the above
 *
 * The customer app slices its day into meal windows — breakfast, lunch,
 * snacks, dinner, late night — and decides which kitchens belong in each by
 * intersecting the window with the kitchen's real trading hours. That
 * derivation happens on the device (`User App/services/adapters/
 * food.adapter.ts`), so the hours have to travel.
 *
 * `isCurrentlyOpen` cannot stand in for them: it answers "right now", and the
 * feed's window rail asks "which kitchens cook at 8pm" while it is 3pm.
 * Leaving the hours off does not error — every kitchen simply matches no
 * window and the feed renders empty on every tab, which is the failure this
 * paragraph exists to prevent happening twice. A handful of
 * {day, openTime, closeTime} rows is a fair price for it.
 */
const listRow = (doc, distanceKm) => ({
  restaurantId: doc.restaurantId,
  restaurantName: doc.restaurantName,
  description: doc.description || '',
  logoImage: imageUrl(doc.logoImage),
  coverBannerImage: imageUrl(doc.coverBannerImage),
  cuisineTypes: textList(doc.cuisineTypes),
  partnerType: doc.partnerType || 'food',
  ratingAvg: number(doc.ratingAvg),
  ratingCount: number(doc.ratingCount),
  avgPreparationTime: number(doc.avgPreparationTime),
  deliveryFee: deliveryFeeOf(doc.deliveryFee),
  minOrderValue: number(doc.minOrderValue),
  /* Derived from `openState` and the hours below. Both travel: this one
     answers "right now", the hours answer "which meal windows". */
  isCurrentlyOpen: isOpenNow(doc),
  openingHours: Array.isArray(doc.openingHours)
    ? doc.openingHours.map((slot) => ({
      day: slot.day,
      openTime: slot.openTime,
      closeTime: slot.closeTime,
    }))
    : [],
  /* Null when the caller sent no coordinates. Not 0 — a distance of zero is a
     customer standing in the kitchen, and a card printing "0.0 km away" to
     everybody who declined location access is worse than one printing
     nothing. */
  distanceKm,
  address: placeOf(doc.address),
});

/*
 * The fields a list row is built from — ONE list, two spellings.
 *
 * `find().select()` takes a space-separated string and an aggregation
 * `$project` takes an object, and a projection that disagrees with the select
 * is a field present on one path and missing on the other. That failure is
 * invisible in testing and obvious in production: the same screen renders
 * differently depending on whether the customer allowed location access,
 * because only one of the two paths goes through `$geoNear`.
 *
 * `openState` and `openingHours` are read in order to be DERIVED FROM rather
 * than sent — `isOpenNow` needs both — which is the whole reason this list is
 * longer than the row above.
 */
const LIST_FIELDS = [
  'restaurantId', 'restaurantName', 'description',
  'logoImage', 'coverBannerImage', 'cuisineTypes', 'partnerType',
  'ratingAvg', 'ratingCount', 'avgPreparationTime',
  'deliveryFee', 'minOrderValue',
  'address.city', 'address.line2', 'address.landmark',
  'openState', 'openingHours',
];

const LIST_SELECT = LIST_FIELDS.join(' ');

const LIST_PROJECT = LIST_FIELDS.reduce(
  (shape, path) => ({ ...shape, [path]: 1 }),
  /* Added by `$geoNear` and consumed by `distanceKmOf`. It exists only on the
     located path, which is why it is not in `LIST_FIELDS`. */
  { distanceMeters: 1 },
);

/*
 * The detail header of the Food Listing screen.
 *
 * Absent from this projection, and absent on purpose: `ownerName`,
 * `ownerPhone`, `ownerEmail`, `phoneKey`, `passwordHash`, the whole `payout`
 * sub-document, `fssaiLicenseNumber`, `fssaiExpiry`, `gstNumber`,
 * `panNumber`, `verificationDocuments`, `verificationNote` and `contract`.
 * `contactNumber` IS here — it is the customer-facing number by definition,
 * which is exactly why the model keeps it apart from `ownerPhone`.
 */
const DETAIL_FIELDS = [
  'restaurantId', 'restaurantName', 'description',
  'logoImage', 'coverBannerImage', 'cuisineTypes', 'partnerType',
  'ratingAvg', 'ratingCount',
  'address', 'location', 'contactNumber',
  'openingHours', 'openState',
  'avgPreparationTime', 'deliveryRadiusKm', 'minOrderValue', 'packagingCharge',
  'deliveryFee', 'acceptsOnlinePayment', 'acceptsCod',
];

const DETAIL_SELECT = DETAIL_FIELDS.join(' ');

const restaurantDetail = (doc) => ({
  restaurantId: doc.restaurantId,
  restaurantName: doc.restaurantName,
  description: doc.description || '',
  logoImage: imageUrl(doc.logoImage),
  coverBannerImage: imageUrl(doc.coverBannerImage),
  cuisineTypes: textList(doc.cuisineTypes),
  partnerType: doc.partnerType || 'food',
  ratingAvg: number(doc.ratingAvg),
  ratingCount: number(doc.ratingCount),

  /* The whole address, unlike the card's one line: this is the screen where
     somebody works out whether they could collect it themselves. */
  address: {
    line1: (doc.address && doc.address.line1) || '',
    line2: (doc.address && doc.address.line2) || '',
    city: (doc.address && doc.address.city) || '',
    state: (doc.address && doc.address.state) || '',
    pincode: (doc.address && doc.address.pincode) || '',
    landmark: (doc.address && doc.address.landmark) || '',
  },
  location: coordinatesOf(doc.location),
  contactNumber: doc.contactNumber || '',

  /* The schedule as typed, so the screen can say "Opens at 19:00" rather than
     only "Closed", and the state that may be overriding it. */
  openingHours: Array.isArray(doc.openingHours)
    ? doc.openingHours.map((slot) => ({
      day: slot.day,
      openTime: slot.openTime,
      closeTime: slot.closeTime,
    }))
    : [],
  openState: doc.openState || 'auto',
  isCurrentlyOpen: isOpenNow(doc),

  avgPreparationTime: number(doc.avgPreparationTime),
  deliveryRadiusKm: number(doc.deliveryRadiusKm),
  minOrderValue: number(doc.minOrderValue),
  packagingCharge: number(doc.packagingCharge),
  deliveryFee: deliveryFeeOf(doc.deliveryFee),
  acceptsOnlinePayment: doc.acceptsOnlinePayment !== false,
  acceptsCod: doc.acceptsCod !== false,
});

/* The parent summary on the Product Details screen — a name to put at the top
   of the screen without a second call. */
const SUMMARY_FIELDS = [
  'restaurantId', 'restaurantName', 'logoImage', 'cuisineTypes',
  'ratingAvg', 'ratingCount', 'avgPreparationTime',
  'deliveryFee', 'minOrderValue',
  'address.city', 'address.line2', 'address.landmark',
  'openState', 'openingHours',
];

const SUMMARY_SELECT = SUMMARY_FIELDS.join(' ');

const restaurantSummary = (doc) => ({
  restaurantId: doc.restaurantId,
  restaurantName: doc.restaurantName,
  logoImage: imageUrl(doc.logoImage),
  cuisineTypes: textList(doc.cuisineTypes),
  ratingAvg: number(doc.ratingAvg),
  ratingCount: number(doc.ratingCount),
  avgPreparationTime: number(doc.avgPreparationTime),
  deliveryFee: deliveryFeeOf(doc.deliveryFee),
  minOrderValue: number(doc.minOrderValue),
  isCurrentlyOpen: isOpenNow(doc),
  address: placeOf(doc.address),
});

/* Everything a menu row draws. `galleryImages`, `allergenInfo` and `calories`
   are the three fields only the Product Details screen shows, so they are
   added there rather than sent eighty times over. */
const MENU_FIELDS = [
  'productId', 'restaurantId', 'productName', 'productImage', 'description',
  'category', 'isVeg', 'price', 'discountedPrice', 'isAvailable',
  'variants', 'addOns', 'spiceLevel', 'serves', 'tags',
  'ratingAvg', 'ratingCount', 'preparationTime', 'displayOrder',
];

const MENU_SELECT = MENU_FIELDS.join(' ');

const menuItem = (doc) => ({
  productId: doc.productId,
  productName: doc.productName,
  description: doc.description || '',
  productImage: imageUrl(doc.productImage),
  category: asText(doc.category),
  isVeg: doc.isVeg || 'veg',
  price: number(doc.price),
  /* Null, never 0. The model is explicit that 0 is a free dish and null is
     "there is no offer"; collapsing them here would strike a price through
     and print nothing beside it. */
  discountedPrice: maybeNumber(doc.discountedPrice),
  isAvailable: doc.isAvailable !== false,
  /* Sent with the menu rather than fetched per dish: the Add button needs the
     choice the moment it is tapped, and a round trip for every card is a
     worse trade than a few hundred bytes on a menu already being loaded. */
  variants: options(doc.variants),
  addOns: options(doc.addOns),
  spiceLevel: doc.spiceLevel || null,
  serves: number(doc.serves, 1),
  tags: textList(doc.tags),
  ratingAvg: number(doc.ratingAvg),
  ratingCount: number(doc.ratingCount),
  /* Null means "no override", which is not the same as no minutes — see
     `etaFor`, which is the only place the two are resolved. */
  preparationTime: maybeNumber(doc.preparationTime),
});

const productDetail = (doc) => ({
  ...menuItem(doc),
  galleryImages: imageList(doc.galleryImages),
  /* Declared by the kitchen and shown as declared. Nothing in this process
     verifies it and the screen says so, for the same reason a menu card
     does. */
  allergenInfo: textList(doc.allergenInfo),
  calories: maybeNumber(doc.calories),
});

/**
 * How long this dish takes, in minutes.
 *
 * The item's own time overrides the restaurant average when it is set, and
 * `??` rather than `||` is the whole of the rule: 0 is a legitimate answer
 * for a bottle of water taken off a shelf, and `||` would quietly promote
 * that zero to the kitchen's average of twenty-five minutes. `maybeNumber`
 * returns null for a field nobody filled in, which is what makes the `??`
 * reachable at all.
 */
const etaFor = (product, restaurant) => (
  maybeNumber(product.preparationTime) ?? maybeNumber(restaurant.avgPreparationTime)
);

/* ── Reading the collection ───────────────────────────────────────────────*/

/** Metres from `$geoNear`, to one decimal place of kilometres, or null. */
const distanceKmOf = (doc) => {
  const metres = maybeNumber(doc.distanceMeters);
  return metres === null ? null : Math.round(metres / 100) / 10;
};

/**
 * The nearby page.
 *
 * `$geoNear` must be the first stage of the pipeline and sorts nearest-first
 * by definition, so the `$skip`/`$limit` after it are a stable page rather
 * than an arbitrary slice. `key` is named explicitly: the stage picks the geo
 * index for you only while there is exactly one, and the day a second
 * geometry is added to this schema it would start guessing.
 */
const findNearby = ({
  filter, point, radiusKm, skip, limit,
}) => FoodRestaurant.aggregate([
  {
    $geoNear: {
      near: point,
      key: 'location',
      distanceField: 'distanceMeters',
      maxDistance: radiusKm * 1000,
      spherical: true,
      query: filter,
    },
  },
  { $project: LIST_PROJECT },
  { $skip: skip },
  { $limit: limit },
]);

/** The same circle as a plain predicate, because `$geoNear` cannot be counted. */
const nearbyFilter = (filter, point, radiusKm) => ({
  ...filter,
  location: {
    $geoWithin: { $centerSphere: [point.coordinates, radiusKm / EARTH_RADIUS_KM] },
  },
});

const findAnywhere = ({ filter, skip, limit }) => FoodRestaurant.find(filter)
  .select(LIST_SELECT)
  .sort(NEWEST_FIRST)
  .skip(skip)
  .limit(limit)
  .lean();

/**
 * One page of restaurants, and the true size of the set it came from.
 *
 * Three shapes of read behind one call, so that the handler holds none of
 * them: located or not, and open-now or not. Only the last combination pages
 * in memory, and only because `isCurrentlyOpen` is derived — see the header.
 */
const collectRestaurants = async ({
  filter, point, radiusKm, openNow, skip, limit,
}) => {
  const fetch = point
    ? (from, size) => findNearby({
      filter, point, radiusKm, skip: from, limit: size,
    })
    : (from, size) => findAnywhere({ filter, skip: from, limit: size });

  if (openNow) {
    const scanned = await fetch(0, OPEN_NOW_SCAN_CAP);
    const open = scanned.filter((doc) => isOpenNow(doc));

    return {
      docs: open.slice(skip, skip + limit),
      total: open.length,
      /* The total is a floor rather than a count when the ceiling was hit, and
         the reply says so rather than quietly reporting the wrong number. */
      capped: scanned.length >= OPEN_NOW_SCAN_CAP,
    };
  }

  const [docs, total] = await Promise.all([
    fetch(skip, limit),
    point
      ? FoodRestaurant.countDocuments(nearbyFilter(filter, point, radiusKm))
      : FoodRestaurant.countDocuments(filter),
  ]);

  return { docs, total, capped: false };
};

/**
 * The one failure of the nearby read that is not the caller's fault.
 *
 * `$geoNear` refuses to run at all without a 2dsphere index — "unable to find
 * index for $geoNear query" — and mongoose builds the one declared in
 * `foodRestaurant.model.js` on connection, so reaching this means a
 * deployment with autoIndex off, or an index build still in flight. That is a
 * missing dependency like any other in this process: a NAMED 503 on the one
 * affected shape of one route, said loudly in the console with the fix in it,
 * rather than an opaque 500 out of the error handler. The same call without
 * `?lat&lng` is untouched, and the message says so.
 */
const isMissingGeoIndex = (error) => Boolean(error)
  && /2dsphere|geonear/i.test(String((error && error.message) || ''));

/* ── The Restaurant Listing screen ────────────────────────────────────────*/

// @route   GET /api/v2/food-partners/restaurants
// @desc    Approved, active restaurants — near me, by cuisine, by name, open now
// @access  Public
const listRestaurants = async (req, res, next) => {
  /* Hung on the request by `tagFoodPartnerRequest`, so the duration printed
     covers the whole call rather than only the part this handler saw. */
  const timer = req.foodPartnerTimer || startTimer();

  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);

    const query = req.query || {};
    const { page, limit, skip } = readPaging(query);
    const { point, radiusKm, error: locationError } = readLocation(query);

    if (locationError) {
      logRejected(locationError.message, {
        code: locationError.code, field: 'lat/lng', status: 400,
      });
      return badInput(res, locationError.message, locationError.code);
    }

    const cuisines = readCuisines(query.cuisine);
    const search = asText(query.search).slice(0, MAX_SEARCH_CHARS);
    const openNow = isYes(query.openNow);
    const partnerType = asText(query.partnerType).toLowerCase();

    const filter = { ...LISTED };

    if (cuisines.length) filter.cuisineTypes = { $in: cuisines.map(exactly) };

    /*
     * Food and meat share this collection — the model explains why — and they
     * do not share a feed. Without this the meat shops appear in the food
     * app's listing, which is not a filter anybody thinks to ask for until
     * they have seen it happen. An unrecognised value is ignored rather than
     * refused: it could only ever narrow the feed to nothing.
     */
    if (PARTNER_TYPES.includes(partnerType)) filter.partnerType = partnerType;

    const byName = searchFilter(search);
    if (byName) Object.assign(filter, byName);

    let found;
    try {
      found = await collectRestaurants({
        filter, point, radiusKm, openNow, skip, limit,
      });
    } catch (error) {
      if (!point || !isMissingGeoIndex(error)) throw error;

      logDependencyMissing({
        dependency: 'the 2dsphere index on food_restaurants.location',
        code: 'GEO_INDEX_MISSING',
        route: ROUTE_LIST,
        hint: 'restart with autoIndex on, or db.food_restaurants.createIndex({ location: "2dsphere" })',
      });

      return fail(
        res,
        503,
        'GEO_INDEX_MISSING',
        'Searching by distance is unavailable on this server right now. The same search without a location still works.',
      );
    }

    const data = found.docs.map((doc) => listRow(doc, distanceKmOf(doc)));

    logDiscovery({
      route: 'restaurants',
      filters: {
        /* Printed the way a person says them, whatever order they are stored
           in: `coordinates` is [lng, lat], and this line is read by somebody
           checking a pin against a map. */
        lat: point ? point.coordinates[1] : undefined,
        lng: point ? point.coordinates[0] : undefined,
        radiusKm: point ? radiusKm : undefined,
        cuisine: cuisines,
        search: search || undefined,
        openNow: openNow || undefined,
        partnerType: filter.partnerType,
        page,
        limit,
      },
      count: data.length,
      total: found.total,
      timer,
    });

    return res.json({
      success: true,
      count: data.length,
      total: found.total,
      page,
      pages: Math.max(1, Math.ceil(found.total / limit)),
      limit,
      /* Only when it means something. A flag that is false on every ordinary
         reply is a flag nobody reads on the one where it is true. */
      ...(found.capped ? { capped: true } : {}),
      data,
    });
  } catch (error) {
    return next(error);
  }
};

/* ── The Food Listing screen: one restaurant and its menu ─────────────────*/

/**
 * The menu, grouped by category, in the partner's own order.
 *
 * The sections come out in ascending order of the lowest `displayOrder` in
 * each, and that falls out of the read: the documents arrive sorted by
 * `displayOrder`, and a Map keeps its insertion order, so the category
 * holding item 0 is the first key created. There is no category-order field
 * on the schema to do better with, and the obvious alternative is worse —
 * sorting section names alphabetically puts Desserts before Main Course on
 * every menu in the catalogue.
 */
const groupMenu = (products) => {
  const sections = new Map();

  for (const product of products) {
    /* `category` is required by the schema, so the fallback is only ever
       reached by a document whose category is whitespace. It is a heading
       rather than a refusal, because a dish that cannot be shown at all is a
       worse answer than a dish under a generic one. */
    const category = asText(product.category) || 'Menu';
    if (!sections.has(category)) sections.set(category, []);
    sections.get(category).push(menuItem(product));
  }

  return [...sections.entries()].map(([category, items]) => ({
    category,
    itemCount: items.length,
    items,
  }));
};

// @route   GET /api/v2/food-partners/restaurants/:restaurantId
// @desc    The detail header plus the menu, grouped by category
// @access  Public
const getRestaurant = async (req, res, next) => {
  const timer = req.foodPartnerTimer || startTimer();

  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);

    /*
     * Upper-cased, because `makeRestaurantId` mints upper case and a link that
     * has been through something which lower-cases URLs should still resolve.
     * Not shape-checked against `FP-[A-Z0-9]{8}`: a malformed id and a missing
     * one are the same 404 to a caller, and a second copy of the id's shape
     * here is a second thing to keep in step with the minting.
     */
    const restaurantId = asText(req.params.restaurantId).slice(0, MAX_ID_CHARS).toUpperCase();

    const restaurant = await FoodRestaurant
      .findOne({ restaurantId, ...LISTED })
      .select(DETAIL_SELECT)
      .lean();

    if (!restaurant) {
      logDiscovery({
        route: 'restaurant detail', filters: { restaurantId }, count: 0, timer,
      });
      return notFound(res);
    }

    /*
     * Sold-out dishes are left out, which is what the second index on
     * `food_products` exists for. A row that can be tapped and not ordered is
     * a support call, and the kitchen's own switch is the kitchen saying so.
     *
     * The consequence is visible rather than hidden: a restaurant that has
     * switched everything off comes back with an empty menu and `count: 0`
     * beside an `isCurrentlyOpen` that explains it.
     */
    const products = await FoodProduct
      .find({ restaurantId, isAvailable: true })
      /* `displayOrder` first — `groupMenu` depends on this order — then
         `createdAt`, so a menu nobody has dragged into an order still comes
         back stably rather than in whatever order the storage engine happened
         to walk. */
      .sort({ displayOrder: 1, createdAt: 1 })
      .select(MENU_SELECT)
      .lean();

    const menu = groupMenu(products);

    logDiscovery({
      route: 'restaurant detail',
      filters: { restaurantId, categories: menu.length },
      count: products.length,
      timer,
    });

    return res.json({
      success: true,
      count: products.length,
      data: {
        restaurant: restaurantDetail(restaurant),
        menu,
      },
    });
  } catch (error) {
    return next(error);
  }
};

/* ── The Product Details screen ───────────────────────────────────────────*/

// @route   GET /api/v2/food-partners/products/:productId
// @desc    One dish, plus enough of its kitchen to render the screen
// @access  Public
const getProduct = async (req, res, next) => {
  const timer = req.foodPartnerTimer || startTimer();

  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);

    const productId = asText(req.params.productId).slice(0, MAX_ID_CHARS).toUpperCase();

    const product = await FoodProduct.findOne({ productId }).lean();
    if (!product) {
      logDiscovery({
        route: 'product detail', filters: { productId }, count: 0, timer,
      });
      return notFound(res);
    }

    /*
     * The parent is loaded under the SAME `LISTED` floor as everything else in
     * this file, and a dish whose kitchen is not listed is a 404.
     *
     * Without that, a product id is a back door: the menu of a restaurant that
     * was rejected, or switched off an hour ago, would stay readable to
     * anybody holding one of its links. The join is on the `restaurantId`
     * string the product carries — never an ObjectId, for the reason the
     * product model gives at length.
     */
    const restaurant = await FoodRestaurant
      .findOne({ restaurantId: product.restaurantId, ...LISTED })
      .select(SUMMARY_SELECT)
      .lean();

    if (!restaurant) {
      logDiscovery({
        route: 'product detail',
        filters: { productId, restaurantId: product.restaurantId, listed: 'no' },
        count: 0,
        timer,
      });
      return notFound(res);
    }

    logDiscovery({
      route: 'product detail',
      filters: { productId, restaurantId: restaurant.restaurantId },
      count: 1,
      timer,
    });

    return res.json({
      success: true,
      data: {
        product: productDetail(product),
        restaurant: restaurantSummary(restaurant),
        /* Resolved here rather than on the phone, so the one rule about which
           preparation time wins lives in one place. */
        etaMinutes: etaFor(product, restaurant),
      },
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listRestaurants,
  getRestaurant,
  getProduct,
};
