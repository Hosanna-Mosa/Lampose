/* ══════════════════════════════════════════════════════════════════════════
   What of the public stay feed may be cached, under which key, and what
   clears it. The mechanics are in src/infrastructure/cache/cache.js.

   ## Cached: the listing as the property document describes it

     stay:list:v1:g<gen>:<hash>   the formatted feed (GET /listings) AFTER the
                                  Mongo query, owner names, ratings and the
                                  city / area filters — BEFORE availability.
     stay:listing:v1:<id>         one formatted listing (GET /listings/:id),
                                  plus its status; null = "not found", kept
                                  for 30s so a bad id cannot hammer Mongo.

   ## Never cached, recomputed on every request

     · Beds, the owner's pause switch and everything derived from them —
       which listings are hidden, `requestable`, the paused-last ranking, the
       full-last paging order. Those are `withAvailability` and run live after
       the cache, exactly as before. Paging is applied after them too, so
       `limit`/`offset` are not in the key and every page shares one entry.
     · `joinWindow` — it is "from today", and a feed cached at 23:59 would
       otherwise offer yesterday.
     · "Near me" (`lat`/`lng`) — skipped entirely. Rounding the fix would
       change `distanceKm` and who falls inside the radius, i.e. the response;
       keying it exactly would store one whole feed per GPS reading.
     · `/listings/meta` (counts that depend on the live pause state) and
       `/listings/:id/reviews`.

   Nothing here is more than the public response already shows: the
   formatter strips the owner's phone, the street address and the staff
   email before anything reaches this file.

   ## Cleared by

     properties          any write                → feed generation + that id
     app_partners        a change to a name, or to which number is verified
                         (the feed shows the verified partner's name)
                                                  → feed + every detail
     partner_reviews     any write                → feed (ratings ride on it)
     visit_fee_settings  a console fee change     → feed + every detail
   ══════════════════════════════════════════════════════════════════════════ */
const cache = require('../../infrastructure/cache/cache');
const { touches } = require('../../infrastructure/cache/watchWrites');
const config = require('../../config/env');
const { joinWindow } = require('./stayIntent.util');
const { normaliseCategory } = require('../../shared/constants/categories');

const LIST_NS = 'stay:list:v1';
const DETAIL_PREFIX = 'stay:listing:v1:';

cache.register({ generations: [LIST_NS], patterns: [`${DETAIL_PREFIX}*`] });

/*
 * Two requests that mean the same feed must share a key — and two that do
 * not must never. Each value is normalised exactly as far as
 * `listing.controller.js#getListings` already treats it as equivalent, and no
 * further:
 *
 *   category  split on commas, trimmed, mapped through the same
 *             `normaliseCategory` the filter uses, sorted ("all" = none)
 *   city      lower-cased but NOT trimmed — the filter compares untrimmed
 *   locality  trimmed and lower-cased — the filter does both
 *   maxPrice  as the number the filter uses, or none
 *   search    exactly as sent — it becomes a case-insensitive regex, and
 *             lower-casing is not identity for every Unicode letter
 */
const feedParams = ({
  category, city, locality, maxPrice, search,
} = {}) => ({
  category: category && category !== 'all'
    ? [...new Set(String(category).split(',').map((v) => v.trim()).filter(Boolean)
      .map((v) => normaliseCategory(v) || v.toUpperCase()))].sort()
    : null,
  city: city && city !== 'All Cities' ? String(city).toLowerCase() : null,
  locality: locality ? String(locality).trim().toLowerCase() : null,
  maxPrice: maxPrice && Number.isFinite(Number(maxPrice)) ? Number(maxPrice) : null,
  search: search ? String(search) : null,
});

/* `{ ...listing, joinWindow }` keeps the key where it was, so the JSON is
   ordered exactly as the formatter wrote it. */
const freshDates = (listing) => (listing ? { ...listing, joinWindow: joinWindow() } : listing);

/** The formatted feed before availability. `load` is the uncached read. */
const feed = async (query, load, res) => {
  const { value, status } = await cache.fetch(
    () => cache.listKey(LIST_NS, feedParams(query)),
    config.cache.ttl.list,
    load,
  );
  cache.markResponse(res, status);
  return status === 'BYPASS' ? value : value.map(freshDates);
};

/** `{ status, listing }` for one property, or null when it is not public. */
const detail = async (id, load, res) => {
  const { value, status } = await cache.fetch(
    `${DETAIL_PREFIX}${String(id).toLowerCase()}`,
    config.cache.ttl.detail,
    load,
  );
  cache.markResponse(res, status);
  if (!value || status === 'BYPASS') return value;
  return { ...value, listing: freshDates(value.listing) };
};

/* ── Invalidation ─────────────────────────────────────────────────────────*/

const idList = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object' && Array.isArray(value.$in)) return value.$in.map(String);
  if (typeof value === 'object' && !value._bsontype && !(typeof value.toHexString === 'function')) return null;
  return [String(value)];
};

const forgetEveryDetail = () => cache.delByPattern(`${DETAIL_PREFIX}*`);

/** properties: every write. */
const onPropertyWrite = async ({ docs, filter }) => {
  await cache.bumpGeneration(LIST_NS);
  const ids = docs && docs.length
    ? docs.map((doc) => String(doc._id))
    : idList(filter && filter._id);
  if (ids && ids.length) await cache.del(ids.map((id) => `${DETAIL_PREFIX}${id.toLowerCase()}`));
  else await forgetEveryDetail();
};

/* What `listing.formatter.js#ownerNamesFor` reads. A partner row is saved on
   every sign-in code and every push-token refresh; none of those touch these,
   and none of them should empty the cache. */
const PARTNER_NAME_FIELDS = new Set(['name', 'fullName', 'ownerName', 'phoneDigits', 'phoneVerifiedAt']);

const onPartnerWrite = async ({ paths }) => {
  if (!touches(paths, PARTNER_NAME_FIELDS)) return;
  await cache.bumpGeneration(LIST_NS);
  await forgetEveryDetail();
};

/** partner_reviews: the feed carries averageRating / reviewCount. */
const onReviewWrite = async () => {
  await cache.bumpGeneration(LIST_NS);
};

/** The assisted-visit fee is printed on every listing (`visitToken`). */
const onVisitFeesChanged = async () => {
  await cache.bumpGeneration(LIST_NS);
  await forgetEveryDetail();
};

module.exports = {
  feed,
  detail,
  feedParams,
  onPropertyWrite,
  onPartnerWrite,
  onReviewWrite,
  onVisitFeesChanged,
  LIST_NS,
  DETAIL_PREFIX,
};
