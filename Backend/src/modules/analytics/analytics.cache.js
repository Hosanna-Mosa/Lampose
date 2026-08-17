/* ══════════════════════════════════════════════════════════════════════════
   A short in-memory cache for GA4 report responses.

   The dashboard's four tiles can all reload on one date-range change, and an
   admin tab left open re-renders on every focus — without this, that is a
   fresh Data API call per tile per glance. GA4's Data API also has a real
   daily quota per property, so caching is not just about latency.

   Deliberately a plain Map, not a package: one process, no cross-instance
   sharing needed, and TTL eviction is a handful of lines. If this backend
   ever runs behind more than one node, move this to a shared store — until
   then it would be complexity with nothing to show for it.
   ══════════════════════════════════════════════════════════════════════════ */
const store = new Map();

const TTL_MS = Number(process.env.GA_CACHE_TTL_MS) || 5 * 60 * 1000; // 5 minutes

/** Runs `loader` and caches the resolved value under `key` for TTL_MS,
 *  returning the cached value on a hit without calling `loader` again. A
 *  rejected loader is never cached, so a transient GA failure does not stick
 *  around for the rest of the TTL window. */
async function cached(key, loader) {
  const hit = store.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const value = await loader();
  store.set(key, { value, expiresAt: Date.now() + TTL_MS });
  return value;
}

/** Test/debug escape hatch — not wired to a route. */
function clearCache() {
  store.clear();
}

module.exports = { cached, clearCache, TTL_MS };
