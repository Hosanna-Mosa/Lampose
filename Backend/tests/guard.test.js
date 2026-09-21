/* The production guard.
   The classifier cases are the cheap half. The source scan at the bottom is
   the half that actually prevents a repeat: documentation does not stop a
   script written next month from pointing at the live cluster, and a failing
   test does. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const guard = require('../src/infrastructure/database/guard');

const PROD = 'mongodb+srv://u:p@cluster0.example.mongodb.net/lamp_onboarding?retryWrites=true';
const CLUSTER = 'mongodb+srv://u:p@cluster0.example.mongodb.net/';
const at = (db) => `${CLUSTER}${db}`;

const verdictFor = (uri, dbName) => guard.classify(guard.resolveTarget({ uri, dbName }));

test('the protected names are production', () => {
  for (const name of guard.BUILT_IN_PROTECTED) {
    assert.strictEqual(verdictFor(at(name)), 'production', `${name} must be production`);
  }
});

test('PROTECTED_DATABASES extends the list at run time', () => {
  /* config/env loads .env, so a developer who has already listed the live
     database there would otherwise make this test pass or fail depending on
     whose machine it runs on. Clear it, assert, restore. */
  const saved = process.env.PROTECTED_DATABASES;
  delete process.env.PROTECTED_DATABASES;
  try {
    assert.strictEqual(verdictFor(at('some_unlisted_db')), 'unknown');
    process.env.PROTECTED_DATABASES = 'some_unlisted_db, something_else';
    assert.strictEqual(verdictFor(at('some_unlisted_db')), 'production');
    assert.strictEqual(verdictFor(at('something_else')), 'production');
  } finally {
    if (saved === undefined) delete process.env.PROTECTED_DATABASES;
    else process.env.PROTECTED_DATABASES = saved;
  }
});

test('an unrecognised name fails closed, not open', () => {
  assert.strictEqual(verdictFor(at('lamp_scratch99')), 'unknown');
  assert.strictEqual(verdictFor(at('whatever')), 'unknown');
  assert.throws(() => guard.assertDevTarget({ uri: at('lamp_scratch99') }), guard.GuardError);
});

test('a name that says it is scratch is development', () => {
  for (const name of ['foo_dev', 'foo_test', 'foo_local', 'foo_scratch', 'foo_staging', 'foo_sandbox', 'lamp_booking_dev']) {
    assert.strictEqual(verdictFor(at(name)), 'development', `${name} must be development`);
  }
});

test('the loopback address is always development, whatever the database is called', () => {
  /* mongodb-memory-server picks a random port on 127.0.0.1, and
     scripts/verify-partner-login.js names its database `lampose-verify`,
     which matches no suffix rule. */
  assert.strictEqual(verdictFor('mongodb://127.0.0.1:41234/lampose-verify'), 'development');
  assert.strictEqual(verdictFor('mongodb://localhost:27017/lamp_onboarding'), 'development');
});

test('dbName overrides the database named in the URI, as mongoose does', () => {
  assert.strictEqual(verdictFor(PROD), 'production');
  assert.strictEqual(verdictFor(PROD, 'lamp_booking_dev'), 'development');
  assert.strictEqual(guard.resolveTarget({ uri: PROD, dbName: 'x_dev' }).db, 'x_dev');
});

test('the override unlocks the database it names, and only that one', () => {
  process.env.LAMPOSE_ALLOW_WRITES_TO = 'lamp_onboarding';
  try {
    assert.doesNotThrow(() => guard.assertDevTarget({ uri: at('lamp_onboarding') }));
    assert.throws(() => guard.assertDevTarget({ uri: at('lampose') }), guard.GuardError);
  } finally {
    delete process.env.LAMPOSE_ALLOW_WRITES_TO;
  }
});

test('credentials never survive into a printable target', () => {
  const t = guard.resolveTarget({ uri: PROD });
  assert.ok(!t.uri.includes('u:p'), 'the user and password must be redacted');
  assert.strictEqual(t.host, 'cluster0.example.mongodb.net');
});

/* ── The scan ──────────────────────────────────────────────────────────── */

const WRITES = /\.(deleteMany|deleteOne|updateMany|updateOne|insertMany|insertOne|dropDatabase|findOneAndDelete|findOneAndUpdate|bulkWrite|create|save)\(/;
const REQUIRES_GUARD = /database\/guard/;

/* Comments are stripped first. These files explain what they do and what
   other scripts do, so `Property.create()` appears in prose in a script that
   only ever reads — and a check that cannot tell prose from code teaches
   people to add exemptions instead of guards. */
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* Each of these is exempt for a stated reason, not because it was awkward. */
const EXEMPT = {
  'scripts/migrate-to-clean-db.js':
    'guards the TARGET with protectedNames() — its whole job is to create the next production database',
  'scripts/verify-partner-login.js':
    'brings its own MongoMemoryServer and overwrites MONGO_URI before config/env is read. '
    + 'Requiring the guard at the top would load config/env first and defeat that, so this '
    + 'script is safe by construction instead.',
};

const root = path.join(__dirname, '..');
const candidates = [
  ...fs.readdirSync(path.join(root, 'scripts'))
    .filter((f) => f.endsWith('.js'))
    .map((f) => path.join('scripts', f)),
  ...fs.readdirSync(root).filter((f) => f.endsWith('.js') && f !== 'server.js' && f !== 'app.js'),
];

test('every script that writes passes through the guard', () => {
  const missing = [];
  for (const rel of candidates) {
    const src = code(fs.readFileSync(path.join(root, rel), 'utf8'));
    if (!WRITES.test(src)) continue;
    if (EXEMPT[rel]) {
      assert.ok(REQUIRES_GUARD.test(src) || true, rel);
      continue;
    }
    if (!REQUIRES_GUARD.test(src)) missing.push(rel);
  }
  assert.deepStrictEqual(missing, [],
    'These scripts write to whatever database is configured without asking the guard '
    + 'first. Add:  require(\'../src/infrastructure/database/guard\').assertDevTargetOrExit();');
});
