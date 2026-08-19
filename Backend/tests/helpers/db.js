/* ══════════════════════════════════════════════════════════════════════════
   A real database, per test file.

   ## Why a real one and not a mock

   The things worth testing in this backend are the things Mongo itself
   decides. `claimBed` is correct because a conditional update matches at most
   once no matter how many callers race for it; a mocked collection would
   answer whatever the mock was written to answer, which is to say it would
   test the author's belief about Mongo rather than Mongo. The race tests in
   particular are worthless without a server that actually serialises writes on
   a document.

   `mongodb-memory-server` runs a genuine `mongod` on a random port with its
   files in a temp directory. Same wire protocol, same update semantics, same
   index behaviour — and no replica set, which matches production: transactions
   are unavailable here exactly as they are there, so a test cannot
   accidentally pass using a feature the deployment does not have.

   ## Usage

     const { withDatabase } = require('./helpers/db');
     withDatabase();               // before/after hooks for the whole file

   Collections are emptied between tests rather than the server restarted —
   a restart is seconds, a drop is milliseconds, and test isolation only needs
   the data gone.
   ══════════════════════════════════════════════════════════════════════════ */
const { before, after, beforeEach } = require('node:test');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let server = null;

/** Registers the hooks. Call once at the top of a test file. */
const withDatabase = () => {
  before(async () => {
    server = await MongoMemoryServer.create();
    await mongoose.connect(server.getUri(), { dbName: 'lampose_test' });
  });

  beforeEach(async () => {
    const { collections } = mongoose.connection;
    await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
  });

  after(async () => {
    await mongoose.disconnect();
    if (server) await server.stop();
  });
};

/**
 * Fire N calls at once and report how many succeeded.
 *
 * The shape every race test needs. `Promise.all` alone would reject on the
 * first failure and hide the others, so each call is caught and classified —
 * what matters is the COUNT that won, not which one did.
 */
const race = async (n, makeCall) => {
  const settled = await Promise.allSettled(
    Array.from({ length: n }, (_, i) => makeCall(i)),
  );
  return settled.map((outcome) => (outcome.status === 'fulfilled' ? outcome.value : null));
};

module.exports = { withDatabase, race };
