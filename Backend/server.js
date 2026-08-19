/* ══════════════════════════════════════════════════════════════════════════
   Boot.

   config/env.js is required first because it is what loads .env — every other
   module reads its configuration from there rather than from process.env, so
   nothing can observe a half-loaded environment.

   This process now serves all three frontends:

     lampose.com          → /api/v2/listings                    (public site)
     leads.lampose.com    → /api/v2/{auth,users,scraper,properties}
     onboard.lampose.com  → /api/v1/{properties,permissions,…}  + /api/v2/auth
   ══════════════════════════════════════════════════════════════════════════ */
const cors = require('cors');

const config = require('./src/config/env');
const { configErrors, configWarnings } = require('./src/config/env');
const { connectDB, closeConnections, getIsInMemory } = require('./src/infrastructure/database/db');
const dbStore = require('./src/modules/scraper/scraper.store');
const { initStore, countUsers } = require('./src/modules/scraper/scraper.store');
const { stopAllJobs } = require('./src/modules/scraper/playwrightScraper.service');
const { startExpiryWorker, stopExpiryWorker, setExpiryHandler } = require('./src/modules/visits/expiry.worker');
const { notifyExpired } = require('./src/modules/notifications/stayRequest.notifier');
const { logSmsStatus } = require('./src/infrastructure/sms/sms');
const { routeMap } = require('./routes');
const createApp = require('./app');

/* ══════════════════════════════════════════════════════════════════════════
   ██  CORS — EDIT THIS BLOCK. NOTHING ELSE DECIDES WHO MAY CALL THIS API.  ██
   ══════════════════════════════════════════════════════════════════════════

   Add a frontend's origin to ALLOWED_ORIGINS below and restart. That is the
   whole procedure. There is no ALLOWED_ORIGINS env var any more, no list in
   config/env.js, and no allowlist in nginx — one place, on purpose, because
   a CORS failure at 2am is not the moment to discover the answer lives in a
   third file.

   An ORIGIN is scheme + host + port and NOTHING else:

     OK   https://onboard.lampose.com
     NO   https://onboard.lampose.com/         <- trailing slash
     NO   https://onboard.lampose.com/api      <- path
     NO   onboard.lampose.com                  <- no scheme

   Trailing slashes and casing are normalised for you; a path is not. A
   browser never sends a path in the Origin header, so an entry carrying one
   can never match anything.

   Do NOT also set Access-Control-Allow-Origin in nginx. This app sets it,
   and two of the same header is a hard failure in every browser — which
   presents exactly like a missing allowlist entry.
   ══════════════════════════════════════════════════════════════════════════ */

const ALLOWED_ORIGINS = [
  // -- Production frontends ----------------------------------------------
  'https://lampose.com',
  'https://www.lampose.com',
  'https://onboard.lampose.com',
  'https://leads.lampose.com',

  // The API's own hosts, for tools and same-host pages.
  'https://api.lampose.com',
  'https://api.leads.lampose.com',

  // -- Local development --------------------------------------------------
  'http://localhost:3000',
  'http://localhost:4173',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:8004',
  'http://localhost:8020',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:4173',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:5175',

  /* Expo web. 8081 is Metro's own port and the origin `expo start --web`
     serves the User App and the driver app from; 19006 is the older web
     port. A native build sends no Origin header at all and never reaches
     this list — see the `!origin` case below. */
  'http://localhost:8081',
  'http://localhost:19006',
  'http://127.0.0.1:8081',
  'http://127.0.0.1:19006',
];

/* Hosts that change on every deploy cannot be listed one by one, so they are
   matched by shape. Keep this short: every pattern is a hole in the
   allowlist, and the first one already covers any *.lampose.com subdomain
   you were about to add above. */
const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/([a-z0-9-]+\.)*lampose\.com$/i,
  /^https:\/\/([a-z0-9-]+\.)*(vercel\.app|netlify\.app|onrender\.com|railway\.app|fly\.dev)$/i,
];

/* Outside production an unlisted origin is almost always a teammate on a
   different Vite port, not an attacker. In production it is refused. */
const ALLOW_UNLISTED_IN_DEV = true;

/* -- Below here is policy, not configuration. Change with care. ----------- */

/** Compare on the origin alone: no trailing slash, no case. */
const normalizeOrigin = (origin) => String(origin || '').trim().replace(/\/+$/, '').toLowerCase();

const NORMALIZED_ORIGINS = ALLOWED_ORIGINS.map(normalizeOrigin);

const isOriginAllowed = (origin) => {
  /* No Origin header at all: curl, Postman, the Twilio webhooks, uptime
     probes, React Native. None of these are browser cross-origin requests,
     so CORS has no opinion on them. Refusing here would break the WhatsApp
     verification chain rather than secure it. */
  if (!origin) return true;

  const clean = normalizeOrigin(origin);
  if (NORMALIZED_ORIGINS.includes(clean)) return true;
  if (ALLOWED_ORIGIN_PATTERNS.some((pattern) => pattern.test(clean))) return true;

  return ALLOW_UNLISTED_IN_DEV && !config.isProduction;
};

const corsOptions = {
  origin(origin, callback) {
    if (isOriginAllowed(origin)) return callback(null, true);

    /* Answer without the CORS headers rather than throwing. Throwing turns a
       browser policy decision into a 500 from the error handler: a confusing
       log line, and a response the browser blocks either way. */
    console.warn(`🚫 [CORS] Blocked origin "${origin}" — add it to ALLOWED_ORIGINS in server.js`);
    return callback(null, false);
  },
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  /* A browser preflight rejects any header the server did not allow, so a
     header the frontends send has to be named here or the call never
     happens. */
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Accept',
    'Origin',
    'Cache-Control',
    'X-Requested-With',
    'X-Correlation-ID',
    'x-employee-email', // Identifies the field agent on gated v1 writes
    'x-user-email',
    /* Every Lampose client names itself. These are the only thing that
       identifies a React Native app in the log, since it sends no Origin. */
    'X-Client',
    'X-Client-Version',
    'X-Request-Id',
  ],
  /* Without Content-Disposition the leads panel cannot read the filename the
     server chose for a CSV fetched with XHR rather than opened in a tab. */
  exposedHeaders: ['Content-Disposition', 'Content-Length'],
  /* `credentials: true` and `Access-Control-Allow-Origin: *` are mutually
     exclusive in every browser. Because `origin` above is a function, the
     cors package echoes the actual request origin instead of `*`, so the
     Authorization header keeps working. */
  credentials: true,
  maxAge: 86400, // Cache the preflight for a day
  /* Safari and some corporate proxies choke on 204 for a preflight. */
  optionsSuccessStatus: 200,
};

const app = createApp({ corsMiddleware: cors(corsOptions) });

const banner = () => {
  const map = routeMap();
  const line = '='.repeat(78);

  console.log(`\n${line}`);
  console.log(`🚀 [Lampose Main Backend] listening on port ${config.port}  (${config.nodeEnv})`);
  console.log(line);

  console.log('\n📦 Datastore');
  console.log(`   MongoDB       ${config.db.uri ? `configured (${config.db.dbName || 'database named in the URI'})` : 'NOT CONFIGURED'}`);
  console.log(`   leads store   ${config.storage.mode === 'mongo' ? 'MongoDB (scriper_* collections)' : 'local JSON files under data/'}`);
  console.log(`   v1 failover   ${getIsInMemory() ? 'ACTIVE — writes are in memory only' : 'idle (MongoDB reachable)'}`);

  /* The SMS gateway is what the availability flow's one-time codes go out
     through. A misconfigured one is otherwise invisible until a customer
     tries to use it, which is the worst moment to find out. */
  logSmsStatus();

  console.log('\n🔐 Guards');
  console.log(`   v2 auth       ${config.auth.configured ? (config.auth.requireAuth ? 'on' : 'OFF (REQUIRE_AUTH=false)') : 'UNCONFIGURED — /api/v2/auth and /api/v2/users answer 503'}`);
  console.log(`   request log   ${config.log.enabled ? `on${config.log.bodies ? ' (with redacted bodies)' : ''}` : 'off'}`);
  console.log(`   body limit    ${config.bodyLimit}`);

  console.log('\n🛣️  API v1  — onboard.lampose.com, admin console');
  map.v1.forEach(({ path, description }) => {
    console.log(`   ${path.padEnd(26)} ${description}`);
  });

  console.log('\n🛣️  API v2  — lampose.com, leads.lampose.com');
  map.v2.forEach(({ path, description }) => {
    console.log(`   ${path.padEnd(26)} ${description}`);
  });

  console.log('\n🔁 Unversioned aliases (what the current frontends call)');
  map.legacy.forEach(({ path, servedBy }) => {
    console.log(`   ${path.padEnd(26)} → ${servedBy}`);
  });

  console.log('\n🌍 CORS allowed origins  (edit ALLOWED_ORIGINS at the top of server.js)');
  ALLOWED_ORIGINS.forEach((origin) => console.log(`   - ${origin}`));
  ALLOWED_ORIGIN_PATTERNS.forEach((pattern) => console.log(`   ~ ${pattern}`));
  console.log('   · no Origin header (curl, Twilio, uptime probes, native apps) always passes');
  console.log(`   · an unlisted origin is ${ALLOW_UNLISTED_IN_DEV && !config.isProduction ? 'ALLOWED (non-production)' : 'REFUSED'}`);

  console.log(`\n${line}\n`);
};

/* An empty user collection in production is not an error, but it does mean
   nobody can sign in to the leads panel — and the reason (seeding is off
   outside development) is not something an operator would guess from a failed
   login. */
const reportFirstAdmin = async () => {
  try {
    const users = await countUsers();
    if (users === 0) {
      console.warn(
        '\n[setup] No leads-panel accounts exist yet. Demo accounts are not seeded in production.\n'
        + '[setup] Create the first administrator with:\n'
        + `[setup]   curl -X POST http://localhost:${config.port}/api/v2/auth/register \\\n`
        + '[setup]     -H "Content-Type: application/json" \\\n'
        + '[setup]     -d \'{"name":"Admin","email":"you@lampose.in","password":"<password>",'
        + '"role":"ADMIN","adminCode":"<ADMIN_SECRET_KEY>"}\'\n',
      );
    }
  } catch { /* the store is still connecting; not worth a warning of its own */ }
};

const startServer = async () => {
  for (const warning of configWarnings) console.warn(`⚠️  [config] ${warning}`);
  for (const error of configErrors) console.error(`❌ [config] ${error}`);

  /* Unlike the leads backend this merge came from, a configuration error does
     not exit here. One process now serves three frontends, and a missing
     JWT_SECRET — which only affects the leads panel's login — must not take
     the public site and the onboarding app down with it. The affected routes
     answer 503 AUTH_NOT_CONFIGURED instead, so no forgeable token is ever
     issued and the fault is still loud. */
  if (configErrors.length && config.isProduction) {
    console.error('❌ [config] Starting anyway: the routes above are disabled, the rest keep serving.');
  }

  /* Does not block the listen: connectDB retries in the background, the v2
     routes answer 503 until it lands, and the v1 routes fall back to their
     in-memory store. A server that refuses to start because the database is
     unreachable can only report the wrong fault. */
  await connectDB();
  await initStore();

  /*
   * The only thing in this process that acts without being asked.
   *
   * Started after `connectDB` rather than beside it, because a tick against a
   * disconnected database is a wasted query every five seconds — the worker
   * checks the connection state itself too, so this is tidiness rather than
   * correctness. Nothing else about boot depends on it, and a process whose
   * worker failed to start still serves every route.
   */
  /* The worker records the transition; this is what tells the student. Set
     here rather than imported inside the worker so that module stays free of
     the notification layer and can be tested without it. */
  setExpiryHandler(notifyExpired);
  startExpiryWorker();

  const server = app.listen(config.port, config.host, () => {
    banner();
    if (config.isProduction) reportFirstAdmin();
  });

  /* Load balancers hold connections open; without this a slow client can keep
     a shutting-down process alive past the platform's kill timeout. */
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`❌ [server] Port ${config.port} is already in use. `
        + 'Stop the other process or set PORT to something else.');
      process.exit(1);
    }
    console.error('❌ [server] failed to start:', error);
    process.exit(1);
  });

  /* ── Shutdown ───────────────────────────────────────────────────────────
     Platforms send SIGTERM and then SIGKILL a few seconds later. Closing the
     listener first lets in-flight requests finish; the timer is the backstop
     for a connection that never does. */
  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n[server] ${signal} received — shutting down.`);

    const forceExit = setTimeout(() => {
      console.error('[server] did not close in 10s, exiting anyway.');
      process.exit(1);
    }, 10000);
    if (forceExit.unref) forceExit.unref();

    stopAllJobs();
    /* Stopped before the listener closes: a tick that starts during shutdown
       would write to a connection `closeConnections` is about to drop. */
    stopExpiryWorker();
    server.close(async () => {
      await closeConnections();
      clearTimeout(forceExit);
      console.log('[server] closed cleanly.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  /* A rejected promise nobody awaited must not take the process down: a
     transient database write inside a background scrape is not a reason to
     stop serving listings. It is logged loudly instead. */
  process.on('unhandledRejection', (reason) => {
    console.error('[server] unhandled promise rejection:', reason);
  });

  /* An uncaught exception leaves the process in an unknown state, so this one
     does exit — after letting the platform's restart handle it. */
  process.on('uncaughtException', (error) => {
    console.error('[server] uncaught exception:', error);
    shutdown('uncaughtException');
  });

  return server;
};

if (require.main === module) {
  startServer().catch((error) => {
    console.error('❌ [server] failed to start:', error);
    process.exit(1);
  });
}

module.exports = { startServer, app, dbStore };
