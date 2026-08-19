/* ══════════════════════════════════════════════════════════════════════════
   What a production build is allowed to tell a stranger.

   These are regression tests for an audit, not for a feature. Each one pins
   something that was visible on a production host and should not have been,
   so that adding a field to a payload cannot quietly put it back.

   `/api/health` is the surface that matters, because it is public,
   unauthenticated, and was the most detailed description of this system
   available anywhere: the collection names behind each API version, the
   MongoDB host and database name, and whether the process had fallen back to
   its in-memory store.
   ══════════════════════════════════════════════════════════════════════════ */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

/*
 * `config` reads NODE_ENV once, at require time, and the test runner sets it
 * to `test`. So the production payload cannot be reached by setting the
 * variable — the module has already decided. It is stubbed on the config
 * object instead, which is the same object health.routes.js holds a reference
 * to, and restored afterwards.
 */
const config = require('../src/config/env');
const createApp = require('../app');

let server;
let base;
let originalIsProduction;

before(async () => {
  /* Over loopback, like endToEnd.test.js — no CORS middleware, because there
     is no browser origin here. Started rather than mocked so the payload
     under test is the one Express actually serialises. */
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  originalIsProduction = config.isProduction;
});

after(async () => {
  config.isProduction = originalIsProduction;
  await new Promise((resolve) => server.close(resolve));
});

const getJson = async (path) => (await fetch(`${base}${path}`)).json();

describe('the public health endpoint in production', () => {
  const asProduction = async () => {
    config.isProduction = true;
    try {
      return await getJson('/api/health');
    } finally {
      config.isProduction = originalIsProduction;
    }
  };

  test('does not name the database host or the database itself', async () => {
    const body = await asProduction();

    assert.equal(body.database.host, undefined, 'health leaked the MongoDB host');
    assert.equal(body.database.name, undefined, 'health leaked the database name');
    assert.equal(body.databases.lampose.host, undefined);
    assert.equal(body.databases.lampose.name, undefined);
    assert.equal(body.databases.scriper.host, undefined);
    assert.equal(body.databases.scriper.name, undefined);

    /* The whole serialised payload, in case a host reaches it by some route
       these assertions do not name. */
    assert.ok(
      !JSON.stringify(body).includes('mongodb.net'),
      'a mongodb.net host appears somewhere in the production health payload',
    );
  });

  test('does not list the collections or describe the API surfaces', async () => {
    const body = await asProduction();

    assert.equal(body.collections, undefined, 'health listed the collection names');
    assert.equal(body.apis, undefined, 'health described the internal API surfaces');
    assert.equal(body.storage, undefined, 'health named the storage backend');
  });

  test('does not say which environment it is, or that it is degraded internally', async () => {
    const body = await asProduction();

    assert.equal(body.environment, undefined);
    assert.equal(body.inMemoryFallback, undefined, 'health admitted the in-memory fallback');
  });

  test('still answers every question a real client asks it', async () => {
    const body = await asProduction();

    /* Not a wish list — each of these has a named reader. The Frontend's
       listingsApi.diagnose() reads database.connected to tell a dead API from
       a disconnected database; the v1 probe reads status, service and
       uptimeSeconds; smoke-test.js asserts both halves of `databases`. */
    assert.equal(typeof body.status, 'string');
    assert.equal(typeof body.service, 'string');
    assert.equal(typeof body.message, 'string');
    assert.equal(typeof body.database.connected, 'boolean');
    assert.equal(typeof body.database.state, 'string');
    assert.ok(body.databases.lampose, 'databases.lampose disappeared');
    assert.ok(body.databases.scriper, 'databases.scriper disappeared');
    assert.equal(typeof body.uptimeSeconds, 'number');
    assert.equal(typeof body.timestamp, 'string');
  });

  test('and development still says all of it, because that is the point', async () => {
    config.isProduction = false;
    const body = await getJson('/api/health');

    assert.ok(body.collections, 'development lost the collection list');
    assert.ok(body.apis, 'development lost the API description');
    assert.equal(typeof body.environment, 'string');
    assert.equal(typeof body.inMemoryFallback, 'boolean');
    assert.ok('host' in body.database, 'development lost the connection host');
  });
});

describe('the liveness probe', () => {
  test('says nothing but that it is alive', async () => {
    config.isProduction = true;
    try {
      const body = await getJson('/api/health/live');
      assert.deepEqual(Object.keys(body).sort(), ['status', 'timestamp', 'uptime']);
    } finally {
      config.isProduction = originalIsProduction;
    }
  });
});
