/* ══════════════════════════════════════════════════════════════════════════
   What of the public food discovery reads may be cached, under which key,
   and what clears it. The mechanics are in src/infrastructure/cache/cache.js.

   ## Cached: the DOCUMENTS, never the response

     food:list:v1:g<gen>:<hash>   one page of `food_restaurants` (lean docs +
                                  the total) for GET /food-partners/restaurants.
                                  With `openNow`, the whole scanned set instead,
                                  and the page is cut after the live filter.
     food:restaurant:v1:<id>      the detail document; null = "not found / not
                                  listed", kept for 30s.
     food:menu:v1:<id>            the available dishes, in menu order.

   The documents, because `isCurrentlyOpen` is derived from the clock every
   time a row is built (`isOpenNow`). A cached response would keep telling a
   diner a kitchen is open after it closed; cached documents are re-rendered
   by the same `listRow` / `restaurantDetail` / `groupMenu` on every request.

   Only the fields those renderers already select are stored — the projections
   in foodDiscovery.controller.js leave out the owner's phone, payout, licence
   numbers and every credential before anything reaches this file.

   ## Never cached

     · "Near me" (`lat`/`lng`) — skipped, for the reason in listing.cache.js.
     · `/products/:id`, dine-in slots, quotes, orders, payment, anything signed in.

   ## Cleared by

     food_restaurants  a write to a field a diner can see, or to whether the
                       kitchen is listed at all → feed generation + its detail
                       and menu. Sign-ins, push tokens, payouts and the like
                       leave the cache alone.
     food_products     any write → that kitchen's menu
   ══════════════════════════════════════════════════════════════════════════ */
const cache = require('../../infrastructure/cache/cache');
const { touches } = require('../../infrastructure/cache/watchWrites');
const config = require('../../config/env');

const LIST_NS = 'food:list:v1';
const RESTAURANT_PREFIX = 'food:restaurant:v1:';
const MENU_PREFIX = 'food:menu:v1:';

cache.register({
  generations: [LIST_NS],
  patterns: [`${RESTAURANT_PREFIX}*`, `${MENU_PREFIX}*`],
});

/*
 * Normalised only as far as `listRestaurants` already treats values as equal:
 * cuisines are matched case-insensitively and in any order, so they are
 * lower-cased and sorted; `search` is already trimmed and capped by the
 * handler and is used as given.
 */
const listParams = ({
  cuisines = [], search = '', openNow = false, partnerType = null, dineIn = false, scan = false, skip = 0, limit = 0,
}) => ({
  cuisines: [...new Set(cuisines.map((c) => String(c).toLowerCase()))].sort(),
  search: search || null,
  openNow: Boolean(openNow),
  partnerType: partnerType || null,
  dineIn: Boolean(dineIn),
  ...(scan ? { scan: true } : { skip, limit }),
});

const list = async (params, load, res) => {
  const { value, status } = await cache.fetch(
    () => cache.listKey(LIST_NS, listParams(params)),
    config.cache.ttl.list,
    load,
  );
  cache.markResponse(res, status);
  return value;
};

const restaurant = async (restaurantId, load, res) => {
  const { value, status } = await cache.fetch(`${RESTAURANT_PREFIX}${restaurantId}`, config.cache.ttl.detail, load);
  cache.markResponse(res, status);
  return value;
};

const menu = async (restaurantId, load, res) => {
  const { value, status } = await cache.fetch(`${MENU_PREFIX}${restaurantId}`, config.cache.ttl.menu, load);
  cache.markResponse(res, status);
  return value;
};

/* ── Invalidation ─────────────────────────────────────────────────────────*/

/*
 * Every field the list row, the detail header or the product summary is
 * rendered from (LIST_FIELDS ∪ DETAIL_FIELDS ∪ SUMMARY_FIELDS), plus what
 * decides whether a kitchen is listed at all and where it sorts.
 */
const PUBLIC_RESTAURANT_FIELDS = new Set([
  'restaurantId', 'restaurantName', 'description',
  'logoImage', 'coverBannerImage', 'galleryImages', 'cuisineTypes', 'partnerType',
  'ratingAvg', 'ratingCount', 'avgPreparationTime',
  'deliveryFee', 'minOrderValue', 'packagingCharge',
  'address', 'location', 'contactNumber',
  'openState', 'openingHours', 'deliveryRadiusKm',
  'acceptsOnlinePayment', 'acceptsCod', 'dineIn',
  'verificationStatus', 'isActive', 'createdAt',
]);

const restaurantIdsOf = (docs, filter) => {
  const fromDocs = (docs || []).map((doc) => doc && doc.restaurantId).filter(Boolean);
  if (fromDocs.length) return fromDocs;
  const wanted = filter && filter.restaurantId;
  if (typeof wanted === 'string') return [wanted];
  if (wanted && Array.isArray(wanted.$in)) return wanted.$in.map(String);
  return null;
};

const onRestaurantWrite = async ({ docs, filter, paths }) => {
  if (!touches(paths, PUBLIC_RESTAURANT_FIELDS)) return;
  await cache.bumpGeneration(LIST_NS);
  const ids = restaurantIdsOf(docs, filter);
  if (ids) {
    await cache.del(ids.flatMap((id) => [`${RESTAURANT_PREFIX}${id}`, `${MENU_PREFIX}${id}`]));
  } else {
    await cache.delByPattern(`${RESTAURANT_PREFIX}*`);
  }
};

const onProductWrite = async ({ docs, filter }) => {
  const ids = restaurantIdsOf(docs, filter);
  if (ids) await cache.del(ids.map((id) => `${MENU_PREFIX}${id}`));
  else await cache.delByPattern(`${MENU_PREFIX}*`);
};

module.exports = {
  list,
  restaurant,
  menu,
  listParams,
  onRestaurantWrite,
  onProductWrite,
  LIST_NS,
  RESTAURANT_PREFIX,
  MENU_PREFIX,
};
