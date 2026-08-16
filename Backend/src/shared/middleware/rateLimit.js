/* ══════════════════════════════════════════════════════════════════════════
   A small fixed-window limiter, in memory.

   Added for the visit-request endpoints: they are anonymous, and every call
   can make a real phone ring and cost real money. Deliberately not a new
   dependency — the whole need is a counter with an expiry.

   Applied per route, never globally. The existing v1 and v2 surfaces are in
   production and are not touched by this; adding a global limiter to a
   working API is how a deploy turns into an outage.

   In memory means per process — two instances behind a load balancer each
   keep their own tally, so the effective limit is the number stated times the
   number of instances. That is a ceiling worth having, not a security
   boundary; the per-phone and per-listing rules enforced against the database
   in the controller hold regardless of instance count.
   ══════════════════════════════════════════════════════════════════════════ */

const buckets = new Map();

/* Without this the map grows for the lifetime of the process. Unref'd so it
   never holds the event loop open on shutdown. */
const SWEEP_MS = 5 * 60 * 1000;
const sweeper = setInterval(() => {
  const now = Date.now();
  buckets.forEach((entry, key) => {
    if (entry.resetAt <= now) buckets.delete(key);
  });
}, SWEEP_MS);
if (typeof sweeper.unref === 'function') sweeper.unref();

/**
 * @param {object}   opts
 * @param {number}   opts.windowMs  width of the window
 * @param {number}   opts.max       calls allowed inside it
 * @param {string}   opts.name      namespace, so two limiters cannot collide
 * @param {Function} [opts.keyOf]   what to count against; defaults to the IP
 */
const rateLimit = ({ windowMs, max, name, keyOf }) => (req, res, next) => {
  const id = keyOf ? keyOf(req) : req.ip;
  if (!id) return next();

  const key = `${name}:${id}`;
  const now = Date.now();
  const entry = buckets.get(key);

  if (!entry || entry.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return next();
  }

  entry.count += 1;
  if (entry.count > max) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    res.set('Retry-After', String(retryAfter));
    return res.status(429).json({
      success: false,
      code: 'RATE_LIMITED',
      retryAfter,
      message: `Too many requests. Try again in ${Math.ceil(retryAfter / 60)} minute(s).`,
    });
  }

  return next();
};

/** Test seam — lets the smoke tests start from a clean slate. */
const resetRateLimits = () => buckets.clear();

module.exports = { rateLimit, resetRateLimits };
