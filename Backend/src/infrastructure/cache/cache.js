/* ══════════════════════════════════════════════════════════════════════════
   The Redis read cache — one client, cache-aside, and never a dependency.

   ## What it is for

   The public stay and food feeds read whole collections on every request
   (`GET /api/v2/listings` loads every listed property). This sits in front of
   the READ half of those handlers and nothing else. What it caches, and what
   it deliberately does not, is decided by the two callers —
   `listings/listing.cache.js` and `foodpartners/foodDiscovery.cache.js` —
   not here. This file only knows keys and JSON.

   ## It may never be the reason a request fails

   Same rule as every other integration in this process (CLAUDE.md, "Nothing
   exits the process"):

     · Off unless `CACHE_ENABLED=true` AND `REDIS_URL` is set. Off means every
       read goes to Mongo exactly as it did before this file existed.
     · Not connected → no command is even sent (`enableOfflineQueue: false`
       plus the `isReady()` check), so a dead Redis costs nothing per request.
     · Connected but slow → each command gives up after `commandTimeoutMs` and
       the read falls through to Mongo.
     · Every Redis error is caught, counted and logged (throttled); the
       client's 'error' event is handled, so a dropped connection can never
       become an unhandled 'error' that takes the process down.

   ## Staleness, and the three things that bound it

     1. Invalidation on write — `watchWrites.js` hooks the models, so a
        committed write deletes its detail key and bumps its feed generation.
     2. A load that straddles an invalidation is not stored (`epoch`), so a
        read that began before a write cannot put the old answer back after it.
     3. Every key has a TTL, so anything the hooks cannot see (a script
        writing through the raw driver) is gone within minutes.

   And on every (re)connect our namespaces are flushed, because invalidations
   attempted while Redis was unreachable were lost.

   ## Stampede

   Concurrent misses for one key share ONE load (`inflight`). In-process is
   enough: this backend runs as one process by design (see the dispatch note
   in CLAUDE.md). Moving to several would want a `SET NX PX` lock here.
   ══════════════════════════════════════════════════════════════════════════ */
const crypto = require('crypto');
const config = require('../../config/env');

let Redis = null;
try {
  // eslint-disable-next-line global-require
  Redis = require('ioredis');
} catch (error) {
  Redis = null;
}

const STATS_INTERVAL_MS = 60 * 1000;
const WARN_EVERY_MS = 10 * 1000;

const state = {
  client: null,
  /* Why the cache is off, for the banner. Null once a client exists — its
     own status is the answer from then on. */
  reason: 'not started',
  stats: { hit: 0, miss: 0, bypass: 0, error: 0 },
  statsTimer: null,
  lastWarnAt: 0,
};

/* Bumped by every invalidation. A load that sees it change while it runs
   returns its answer but does not store it. */
let epoch = 0;
/* key → the shared promise of the load currently filling it. */
const inflight = new Map();
/* What to clear on (re)connect — registered by the two callers. */
const namespaces = { generations: new Set(), patterns: new Set() };

const warn = (message) => {
  const now = Date.now();
  if (now - state.lastWarnAt < WARN_EVERY_MS) return;
  state.lastWarnAt = now;
  console.warn(`⚠️  [cache] ${message} — reads fall through to MongoDB`);
};

const isReady = () => Boolean(state.client) && state.client.status === 'ready';

/** One Redis command, or undefined. Never throws. */
const run = async (label, command) => {
  if (!isReady()) return undefined;
  try {
    return await command(state.client);
  } catch (error) {
    state.stats.error += 1;
    warn(`${label} failed: ${error.message}`);
    return undefined;
  }
};

/** ±10%, so a burst of keys written together does not expire together. */
const jitter = (seconds) => Math.max(1, Math.round(seconds * (0.9 + Math.random() * 0.2)));

/* Values are stored wrapped, so a cached `null` (a remembered "not found") is
   told apart from a miss. */
const encode = (value) => JSON.stringify({ v: value === undefined ? null : value });
const decode = (raw) => JSON.parse(raw).v;

/* ── Primitives ───────────────────────────────────────────────────────────*/

/** The cached value (possibly null), or undefined on a miss or any failure. */
const get = async (key) => {
  const raw = await run('GET', (c) => c.get(key));
  if (raw === undefined || raw === null) return undefined;
  try {
    return decode(raw);
  } catch (error) {
    return undefined;
  }
};

const setRaw = (key, raw, ttlSeconds) => run('SET', (c) => c.set(key, raw, 'EX', jitter(ttlSeconds)));

const set = (key, value, ttlSeconds) => setRaw(key, encode(value), ttlSeconds);

const del = async (...keys) => {
  const flat = keys.flat().filter(Boolean);
  epoch += 1;
  if (!flat.length) return 0;
  if (!isReady()) state.missedInvalidation = true;
  return (await run('DEL', (c) => c.del(...flat))) || 0;
};

/** Delete every key matching a glob. SCAN, never KEYS — KEYS blocks Redis. */
const delByPattern = async (pattern) => {
  epoch += 1;
  if (!isReady()) state.missedInvalidation = true;
  return (await run(`SCAN ${pattern}`, async (c) => {
    let cursor = '0';
    let removed = 0;
    do {
      // eslint-disable-next-line no-await-in-loop
      const [next, keys] = await c.scan(cursor, 'MATCH', pattern, 'COUNT', 250);
      cursor = String(next);
      if (keys.length) {
        // eslint-disable-next-line no-await-in-loop
        removed += await c.del(...keys);
      }
    } while (cursor !== '0');
    return removed;
  })) || 0;
};

/* ── Feed generations ─────────────────────────────────────────────────────
   A feed is cached under many keys (one per filter combination), and a write
   cannot know which of them it touched. So every feed key carries its
   namespace's generation, and invalidating the feed is one write: a new
   generation, after which every old key is simply never read again and
   expires on its own TTL.

   A generation is a fresh random token, never a counter. A counter that Redis
   evicted (allkeys-lru) would restart at 1 and resurrect old keys; a token
   that has never existed cannot. */
const newToken = () => `${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;

const generation = async (namespace) => {
  const key = `${namespace}:gen`;
  const current = await run('GET gen', (c) => c.get(key));
  if (current) return current;
  await run('SET gen', (c) => c.set(key, newToken(), 'NX'));
  return (await run('GET gen', (c) => c.get(key))) || 'nogen';
};

const bumpGeneration = async (namespace) => {
  epoch += 1;
  if (!isReady()) state.missedInvalidation = true;
  await run('SET gen', (c) => c.set(`${namespace}:gen`, newToken()));
};

/** Keys sorted, so `{a,b}` and `{b,a}` are one entry. */
const stable = (value) => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
};

const hashParams = (params) => crypto.createHash('sha1').update(stable(params)).digest('hex').slice(0, 20);

/** `<namespace>:g<generation>:<hash of the normalised params>` */
const listKey = async (namespace, params) => `${namespace}:g${await generation(namespace)}:${hashParams(params)}`;

/* ── Cache-aside ──────────────────────────────────────────────────────────*/

/**
 * The cached value or the loaded one, and which it was.
 *
 *   HIT     read from Redis
 *   MISS    loaded, and stored (unless a write landed meanwhile)
 *   BYPASS  the cache is off or unreachable; `loader()` ran exactly as it
 *           would have without this file
 *
 * On HIT and MISS alike the value is the JSON round-trip of what the loader
 * returned — so a MISS is byte-for-byte what the following HIT will be, and
 * two requests sharing one load never share one mutable object.
 *
 * `key` may be a function, so a feed's generation is only fetched when Redis
 * is actually there to be asked.
 */
const fetch = async (key, ttlSeconds, loader, { notFoundTtl = config.cache.ttl.notFound } = {}) => {
  if (!isReady()) {
    state.stats.bypass += 1;
    return { value: await loader(), status: 'BYPASS' };
  }

  const resolvedKey = typeof key === 'function' ? await key() : key;
  const cached = await get(resolvedKey);
  if (cached !== undefined) {
    state.stats.hit += 1;
    return { value: cached, status: 'HIT' };
  }

  state.stats.miss += 1;
  let pending = inflight.get(resolvedKey);
  if (!pending) {
    const startedAt = epoch;
    pending = (async () => {
      const raw = encode(await loader());
      if (epoch === startedAt) {
        const isNull = decode(raw) === null;
        await setRaw(resolvedKey, raw, isNull ? notFoundTtl : ttlSeconds);
      }
      return raw;
    })().finally(() => inflight.delete(resolvedKey));
    inflight.set(resolvedKey, pending);
  }
  return { value: decode(await pending), status: 'MISS' };
};

const getOrSet = async (key, ttlSeconds, loader, options) => (await fetch(key, ttlSeconds, loader, options)).value;

/* Worst status wins when one response is built from several lookups. */
const RANK = { HIT: 0, MISS: 1, BYPASS: 2 };

/** `X-Cache` outside production — a debugging aid, never a contract. */
const markResponse = (res, status) => {
  if (!res || !status || config.isProduction) return;
  const previous = res.locals && res.locals.cacheStatus;
  const next = previous && RANK[previous] > RANK[status] ? previous : status;
  if (res.locals) res.locals.cacheStatus = next;
  if (!res.headersSent) res.set('X-Cache', next);
};

/* ── Lifecycle ────────────────────────────────────────────────────────────*/

/** Namespaces flushed on every (re)connect. Called by the two callers at load. */
const register = ({ generations = [], patterns = [] } = {}) => {
  generations.forEach((name) => namespaces.generations.add(name));
  patterns.forEach((pattern) => namespaces.patterns.add(pattern));
};

/* Anything written while we were away may be stale, and any invalidation
   attempted meanwhile was lost — so a (re)connect starts every namespace
   over. A cold cache is the price, and it is a few seconds of misses. */
const flushNamespaces = async () => {
  for (const name of namespaces.generations) await bumpGeneration(name);
  for (const pattern of namespaces.patterns) await delByPattern(pattern);
  state.missedInvalidation = false;
};

const logStats = () => {
  const { hit, miss, bypass, error } = state.stats;
  if (!hit && !miss && !bypass && !error) return;
  const total = hit + miss;
  const ratio = total ? ` (${Math.round((hit / total) * 100)}% hit)` : '';
  console.log(`🧊 [cache] last minute: ${hit} hit · ${miss} miss · ${bypass} bypass · ${error} error${ratio}`);
  state.stats = { hit: 0, miss: 0, bypass: 0, error: 0 };
};

const attach = (client) => {
  state.client = client;
  state.reason = null;
  /* A client replaced or closed since must not count against, or flush, the
     current one. The 'error' listener stays regardless — without one, an
     emitted 'error' would throw. */
  const current = () => state.client === client;
  client.on('error', (error) => {
    if (!current()) return;
    state.stats.error += 1;
    warn(`Redis: ${error.message}`);
  });
  client.on('ready', () => {
    if (!current()) return;
    console.log('🧊 [cache] Redis ready — public stay and food reads are cached');
    flushNamespaces().catch(() => {});
  });
  if (!state.statsTimer) {
    state.statsTimer = setInterval(logStats, STATS_INTERVAL_MS);
    if (state.statsTimer.unref) state.statsTimer.unref();
  }
  return client;
};

/**
 * Connect, if configured. Called once by server.js (and by tests, which hand
 * in an `ioredis-mock` client). Scripts never call it, so a seed script with
 * CACHE_ENABLED in its .env does not open a socket that keeps it alive —
 * their writes are covered by the TTLs instead.
 */
const init = ({ client } = {}) => {
  if (state.client) return state.client;
  if (client) return attach(client);

  const { enabled, url, username, password, commandTimeoutMs } = config.cache;
  if (!enabled) { state.reason = 'off (CACHE_ENABLED is not true)'; return null; }
  if (!url) { state.reason = 'off (REDIS_URL is not set)'; return null; }
  if (!Redis) { state.reason = 'off (ioredis is not installed — npm install)'; return null; }

  return attach(new Redis(url, {
    ...(username ? { username } : {}),
    ...(password ? { password } : {}),
    /* Not connected → fail now, not queue. A queued command is a request
       waiting on a cache that is not there. */
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    commandTimeout: commandTimeoutMs,
    connectTimeout: 3000,
    /* Keep trying in the background, forever, at most every 10s. */
    retryStrategy: (times) => Math.min(times * 500, 10000),
  }));
};

const close = async () => {
  if (state.statsTimer) clearInterval(state.statsTimer);
  state.statsTimer = null;
  const { client } = state;
  state.client = null;
  state.reason = 'closed';
  inflight.clear();
  if (client) {
    try { await client.quit(); } catch (error) { client.disconnect(); }
  }
};

/** For the boot banner. */
const describe = () => {
  if (!state.client) return state.reason;
  return isReady()
    ? `on (Redis ${config.cache.url ? 'connected' : 'client attached'})`
    : `connecting (Redis ${state.client.status}) — reads go to MongoDB meanwhile`;
};

module.exports = {
  init,
  close,
  describe,
  isReady,
  register,
  get,
  set,
  del,
  delByPattern,
  getOrSet,
  fetch,
  markResponse,
  listKey,
  hashParams,
  generation,
  bumpGeneration,
  stats: () => ({ ...state.stats }),
};
