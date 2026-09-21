/* ══════════════════════════════════════════════════════════════════════════
   The production guard: what a script must pass before it writes.

   ## Why this is not just a list of names

   `scripts/seed-booking-dev.js` has carried a PROTECTED list since it was
   written, and it is the reason that script may exist at all. But it checks
   `TARGET_DB` — a string the script itself chose — rather than the database
   the connection will actually land on. A script that never reads that
   variable, or reads a different one, walks straight past it.

   So this module resolves the target the way mongoose does, in the same
   order (`dbName` argument → `DB_NAME` → the path segment of the URI), and
   judges THAT.

   ## It fails closed on "unknown"

   A denylist answers "is this one of the databases we thought of?". The
   database that eats a client's listings is the one nobody thought of. So a
   name that is neither recognisably production nor recognisably a scratch
   database is refused, and the message says how to make it recognisable:
   suffix it `_dev`. A reviewer can argue with a refusal; nobody can argue
   with data that is already gone.

   ## Opting in names the database

   LAMPOSE_ALLOW_WRITES_TO=<database> is deliberately not `--force`. A flag
   copied out of a chat log unlocks whatever database happens to be
   configured at the time; a name only unlocks the one database somebody
   typed out in full.

     assertDevTargetOrExit()                 refuse unless this is a dev database
     announce()                              one line before the first write
     guardedConnect({ dbName })              the two above, then mongoose.connect

   ## The server does not use this

   `db.js` warns and carries on. Refusing to boot would turn "pointed at the
   wrong database" into "nothing is listening", and this backend's standing
   rule is that nothing exits the process. Refusal belongs in scripts, which
   have no users waiting on them.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const config = require('../../config/env');

/* Never these, whatever is passed. Extend the list, never shorten it.
   When the clean database goes live its name belongs here AND in every
   machine's PROTECTED_DATABASES, so a stale checkout still refuses it. */
const BUILT_IN_PROTECTED = ['lamp_onboarding', 'lampose', 'production', 'prod'];

const fromEnvList = (name) => String(process.env[name] || '')
  .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

const protectedNames = () => [...new Set([...BUILT_IN_PROTECTED, ...fromEnvList('PROTECTED_DATABASES')])];

/* A database a script may scribble on says so in its own name. Both halves
   are needed: the suffix rule covers names nobody has registered yet, the
   list covers the two that predate the rule. */
const SAFE_SUFFIX = /(_dev|_test|_local|_scratch|_staging|_sandbox)$/;
const SAFE_NAMES = ['lamp_booking_dev', 'lampose_test', 'lampose_local'];

/** Strips credentials so a target can be printed in a log or a CI run. */
const redact = (uri) => String(uri || '').replace(/\/\/[^@/]*@/, '//<credentials>@');

const hostOf = (uri) => {
  try {
    /* `mongodb+srv://` is not a scheme the URL parser knows; the authority
       and path parse identically once it is swapped for one that is. */
    return new URL(String(uri).replace(/^mongodb(\+srv)?:/i, 'https:')).host;
  } catch { return ''; }
};

const dbFromUri = (uri) => {
  try {
    const { pathname } = new URL(String(uri).replace(/^mongodb(\+srv)?:/i, 'https:'));
    return decodeURIComponent(pathname.replace(/^\//, '').split('/')[0] || '');
  } catch { return ''; }
};

/**
 * Resolve the database a connection would actually reach, in mongoose's own
 * precedence. An explicit `dbName` wins over DB_NAME, which wins over the
 * URI path — the same order `db.js` produces when it spreads
 * `{ dbName: config.db.dbName }` over a connect.
 */
const resolveTarget = ({ uri = config.db.uri, dbName } = {}) => {
  const db = String(dbName || config.db.dbName || dbFromUri(uri) || '').trim();
  return { db, host: hostOf(uri), uri: redact(uri) };
};

/**
 * 'production' | 'development' | 'unknown'.
 * NODE_ENV can only ever ADD suspicion — a laptop set to `development` while
 * pointed at the live cluster is the exact bug this module exists for, so
 * `NODE_ENV !== 'production'` is never taken as evidence of safety.
 */
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d+)?$/i;

const classify = (target) => {
  const name = String(target.db || '').toLowerCase();
  if (!name) return 'unknown';
  /* A mongodb-memory-server instance and a local mongod are both bound to
     the loopback address, and neither can be anybody's production cluster.
     This is checked FIRST, before the name: `scripts/verify-partner-login.js`
     spins up an in-memory server on a database called `lampose-verify`, and
     a developer running a local restore is entitled to call it whatever the
     dump was called. A tunnel that forwards a remote cluster to localhost
     defeats this, which is a trade for making the two safest setups work
     without ceremony. */
  if (LOCAL_HOST.test(String(target.host || ''))) return 'development';
  if (protectedNames().includes(name)) return 'production';
  if (config.isProduction) return 'production';
  if (SAFE_NAMES.includes(name) || SAFE_SUFFIX.test(name)) return 'development';
  return 'unknown';
};

/** The deliberate override, and the one database it unlocks. */
const allowedByEnv = (target) => {
  const named = String(process.env.LAMPOSE_ALLOW_WRITES_TO || '').trim();
  return Boolean(named) && named === target.db;
};

class GuardError extends Error {}

/**
 * Refuse unless the resolved target is a development database, or the
 * operator named this exact database in LAMPOSE_ALLOW_WRITES_TO.
 */
const assertDevTarget = (opts = {}) => {
  const target = resolveTarget(opts);
  const verdict = classify(target);

  if (verdict === 'development') return target;
  if (allowedByEnv(target)) {
    console.warn(`\n  ⚠  Writing to "${target.db}", which is ${verdict}.`);
    console.warn('     Allowed because LAMPOSE_ALLOW_WRITES_TO names it.\n');
    return target;
  }

  const lines = [
    '',
    `  Refusing to write to "${target.db || '(no database resolved)'}" @ ${target.host || 'unknown host'}.`,
    '',
    verdict === 'production'
      ? '  That database is on the protected list.'
      : `  "${target.db}" is not a name this guard recognises as a development`
        + '\n  database, so it is refused rather than guessed at.',
    '',
    '  Point at a development database:',
    '      DB_NAME=lamp_booking_dev npm run <script>',
    '',
    '  A new scratch database just needs a name ending in _dev, _test,',
    '  _local, _scratch, _staging or _sandbox.',
    '',
    '  If you genuinely mean this database, name it:',
    `      LAMPOSE_ALLOW_WRITES_TO=${target.db} npm run <script>`,
    '',
  ];
  throw new GuardError(lines.join('\n'));
};

/** Same, for a script that would rather exit than catch. */
const assertDevTargetOrExit = (opts = {}) => {
  try {
    return assertDevTarget(opts);
  } catch (error) {
    if (!(error instanceof GuardError)) throw error;
    console.error(error.message);
    process.exit(1);
  }
  return null;
};

/** One line, before the first write. A mistake should be visible in the
    first second of output, not inferred from the last. */
const announce = (target, verb = 'writing to') => {
  const verdict = classify(target);
  console.log(`\n  ▸ ${verb}  ${target.db}  @ ${target.host || 'local'}   (${verdict})\n`);
  return target;
};

/**
 * A script's connection: never builds an index.
 *
 * Mongoose defaults `autoIndex` to true, so merely requiring a model and
 * connecting is enough to start an index build — including the TTL indexes
 * that delete documents on a timer, and the 2dsphere and text indexes that
 * are expensive on a live cluster. A script has no business doing either.
 * The server is left alone: it builds its indexes at boot, on purpose.
 */
const guardedConnect = async ({ dbName, uri = config.db.uri, verb } = {}) => {
  if (!uri) {
    console.error('MONGO_URI is missing from Backend/.env');
    process.exit(1);
  }
  const target = assertDevTargetOrExit({ uri, dbName });
  announce(target, verb);
  mongoose.set('autoIndex', false);
  mongoose.set('strictQuery', false);
  await mongoose.connect(uri, { ...config.db.options, dbName: target.db });
  return target;
};

module.exports = {
  BUILT_IN_PROTECTED,
  GuardError,
  announce,
  assertDevTarget,
  assertDevTargetOrExit,
  classify,
  guardedConnect,
  protectedNames,
  redact,
  resolveTarget,
};
