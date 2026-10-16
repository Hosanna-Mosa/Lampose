/* ══════════════════════════════════════════════════════════════════════════
   The Redis read cache on its own — src/infrastructure/cache/cache.js.

   What has to hold:

     · a miss loads and stores; the next read is a hit and does not load
     · keys expire on their TTL; "not found" is remembered too, briefly
     · concurrent misses for one key share ONE load (stampede)
     · a load that straddles an invalidation is not stored
     · SCAN-based prefix delete, and feed generations
     · Redis unreachable, or failing mid-command → the loader answers, every
       time, and nothing throws

   `ioredis-mock` stands in for a server (it has no `status`, so the tests set
   the one the real client reports when connected). The unreachable case uses
   the REAL client against a closed port, because that is the case that
   matters: what the production client does when there is nobody there.
   ══════════════════════════════════════════════════════════════════════════ */
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const RedisMock = require('ioredis-mock');
const Redis = require('ioredis');

const cache = require('../src/infrastructure/cache/cache');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const connectMock = async () => {
  /* Connected (and its 'ready' emitted) BEFORE it is handed over, so the
     reconnect flush cannot land in the middle of a test. */
  const client = new RedisMock({ lazyConnect: true });
  await client.connect();
  client.status = 'ready';
  await client.flushall();
  cache.init({ client });
  return client;
};

describe('cache-aside against a working Redis', () => {
  let client;
  beforeEach(async () => { client = await connectMock(); });
  afterEach(async () => { await cache.close(); });

  it('a miss loads and stores, the next read is a hit that does not load', async () => {
    let loads = 0;
    const loader = async () => { loads += 1; return { name: 'Kitchen', n: 1 }; };

    const first = await cache.fetch('t:one', 60, loader);
    const second = await cache.fetch('t:one', 60, loader);

    assert.equal(first.status, 'MISS');
    assert.equal(second.status, 'HIT');
    assert.equal(loads, 1);
    assert.deepEqual(second.value, first.value);
    assert.deepEqual(await cache.get('t:one'), { name: 'Kitchen', n: 1 });
  });

  it('get / set / del, and getOrSet returns just the value', async () => {
    assert.equal(await cache.get('t:absent'), undefined);
    await cache.set('t:k', [1, 2], 60);
    assert.deepEqual(await cache.get('t:k'), [1, 2]);
    await cache.del('t:k');
    assert.equal(await cache.get('t:k'), undefined);
    assert.equal(await cache.getOrSet('t:gos', 60, async () => 'v'), 'v');
    assert.equal(await cache.getOrSet('t:gos', 60, async () => 'other'), 'v');
  });

  it('expires on its TTL', async () => {
    let loads = 0;
    await cache.fetch('t:ttl', 1, async () => { loads += 1; return 'x'; });
    assert.equal((await cache.fetch('t:ttl', 1, async () => { loads += 1; return 'x'; })).status, 'HIT');
    await wait(1600);
    assert.equal((await cache.fetch('t:ttl', 1, async () => { loads += 1; return 'x'; })).status, 'MISS');
    assert.equal(loads, 2);
  });

  it('jitters the TTL by about ±10%', async () => {
    const seen = new Set();
    for (let i = 0; i < 40; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await cache.set(`t:j${i}`, 1, 100);
      // eslint-disable-next-line no-await-in-loop
      const ttl = await client.ttl(`t:j${i}`);
      assert.ok(ttl >= 90 && ttl <= 110, `ttl ${ttl}`);
      seen.add(ttl);
    }
    assert.ok(seen.size > 1, 'not every key gets the same TTL');
  });

  it('remembers "not found" (null) on the short TTL, apart from a miss', async () => {
    let loads = 0;
    const first = await cache.fetch('t:nf', 600, async () => { loads += 1; return null; }, { notFoundTtl: 30 });
    const second = await cache.fetch('t:nf', 600, async () => { loads += 1; return null; }, { notFoundTtl: 30 });
    assert.equal(first.value, null);
    assert.equal(second.status, 'HIT');
    assert.equal(second.value, null);
    assert.equal(loads, 1);
    assert.ok((await client.ttl('t:nf')) <= 33);
  });

  it('concurrent misses for one key share one load', async () => {
    let loads = 0;
    const loader = async () => { loads += 1; await wait(30); return { at: Date.now() }; };
    const results = await Promise.all(Array.from({ length: 10 }, () => cache.fetch('t:hot', 60, loader)));
    assert.equal(loads, 1);
    assert.ok(results.every((r) => r.value.at === results[0].value.at));
    /* …and no two callers were handed the same object to mutate. */
    results[0].value.at = 0;
    assert.notEqual(results[1].value.at, 0);
  });

  it('does not store a load that an invalidation landed during', async () => {
    const slow = cache.fetch('t:race', 60, async () => { await wait(30); return 'old'; });
    await wait(5);
    await cache.del('t:race'); /* the write commits while the old read is in flight */
    assert.equal((await slow).value, 'old', 'the in-flight caller still gets its answer');
    assert.equal(await cache.get('t:race'), undefined, '…but it is not put back in the cache');
  });

  it('delByPattern removes only the matching keys, with SCAN', async () => {
    await cache.set('food:menu:v1:A', 1, 60);
    await cache.set('food:menu:v1:B', 1, 60);
    await cache.set('food:restaurant:v1:A', 1, 60);
    const removed = await cache.delByPattern('food:menu:v1:*');
    assert.equal(removed, 2);
    assert.equal(await cache.get('food:menu:v1:A'), undefined);
    assert.equal(await cache.get('food:restaurant:v1:A'), 1);
  });

  it('a new generation retires every feed key at once; equal params share a key', async () => {
    const a = await cache.listKey('t:list', { b: 1, a: [1, 2] });
    const b = await cache.listKey('t:list', { a: [1, 2], b: 1 });
    assert.equal(a, b, 'key order does not matter');
    assert.notEqual(a, await cache.listKey('t:list', { a: [2, 1], b: 1 }));
    await cache.bumpGeneration('t:list');
    assert.notEqual(await cache.listKey('t:list', { a: [1, 2], b: 1 }), a);
  });

  it('a lost generation key starts a fresh token, never an old one', async () => {
    const before = await cache.listKey('t:gen', { x: 1 });
    await client.del('t:gen:gen'); /* evicted under allkeys-lru */
    const after = await cache.listKey('t:gen', { x: 1 });
    assert.notEqual(after, before);
  });

  it('marks X-Cache with the worst status of the lookups behind one response', () => {
    const headers = {};
    const res = { locals: {}, headersSent: false, set: (k, v) => { headers[k] = v; } };
    cache.markResponse(res, 'HIT');
    assert.equal(headers['X-Cache'], 'HIT');
    cache.markResponse(res, 'MISS');
    cache.markResponse(res, 'HIT');
    assert.equal(headers['X-Cache'], 'MISS');
  });
});

describe('cache-aside when Redis is not there', () => {
  afterEach(async () => { await cache.close(); });

  it('unreachable: every read goes to the loader, immediately, and nothing throws', async () => {
    /* Port 1 — nothing listens. The real client, configured as init() does. */
    const client = new Redis('redis://127.0.0.1:1', {
      enableOfflineQueue: false, maxRetriesPerRequest: 1, commandTimeout: 150, retryStrategy: () => 1000,
    });
    client.on('error', () => {});
    cache.init({ client });

    let loads = 0;
    const started = Date.now();
    for (let i = 0; i < 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const { value, status } = await cache.fetch('t:down', 60, async () => { loads += 1; return 'from mongo'; });
      assert.equal(value, 'from mongo');
      assert.equal(status, 'BYPASS');
    }
    assert.equal(loads, 3);
    assert.ok(Date.now() - started < 500, 'no waiting on a dead cache');

    /* Every primitive is safe to call. */
    assert.equal(await cache.get('t:down'), undefined);
    await cache.set('t:down', 1, 60);
    await cache.del('t:down');
    await cache.delByPattern('t:*');
    await cache.bumpGeneration('t:list');
    assert.equal(await cache.getOrSet('t:down', 60, async () => 'v'), 'v');
  });

  it('failing mid-command: the error is counted, the loader answers', async () => {
    const client = new RedisMock();
    client.status = 'ready';
    client.get = async () => { throw new Error('Command timed out'); };
    client.set = async () => { throw new Error('Command timed out'); };
    cache.init({ client });

    const { value, status } = await cache.fetch('t:err', 60, async () => 'from mongo');
    assert.equal(value, 'from mongo');
    assert.equal(status, 'MISS');
    assert.ok(cache.stats().error >= 2);
  });

  it('not configured: init() connects nothing and says why', () => {
    assert.equal(cache.init(), null);
    assert.match(cache.describe(), /off/);
    assert.equal(cache.isReady(), false);
  });
});
