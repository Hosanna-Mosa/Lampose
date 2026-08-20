/* ══════════════════════════════════════════════════════════════════════════
   Single source of truth for configuration.

   This backend now serves three frontends from one process:

     lampose.com          the public site          → /api/v2/listings
     leads.lampose.com    the leads / scriper panel → /api/v2/{auth,users,scraper,properties}
     onboard.lampose.com  the onboarding app        → /api/v1/{properties,permissions,…}

   Everything the v2 surface needs is read here once. The v1 surface still
   reads process.env directly inside its own route files — deliberately left
   alone, because those files are the ones that must not change behaviour.

   dotenv is loaded from *this* module rather than from server.js so that any
   module reading configuration at require time sees a populated environment,
   whichever entry point pulled it in (server.js, or one of the scripts/).
   ══════════════════════════════════════════════════════════════════════════ */
require('dotenv').config();

const bool = (value, fallback = false) => {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
};

/* Origins are compared as exact strings, so a trailing slash on one side is a
   silent mismatch. Every list entry is normalised the way the incoming Origin
   header is. */
const list = (value) => String(value || '')
  .split(',')
  .map((s) => s.trim().replace(/\/+$/, ''))
  .filter(Boolean);

/* A connection string pasted straight out of the Atlas UI still carries the
   literal `<db_password>` placeholder. Accepting it turns into an
   authentication failure several seconds into boot, which reads as "the
   database is down" rather than "the URI was never filled in". */
const usableUri = (uri) => {
  const value = String(uri || '').trim().replace(/^["']|["']$/g, '');
  if (!value) return null;
  if (/[<>]/.test(value)) return null;
  if (!/^mongodb(\+srv)?:\/\//i.test(value)) return null;
  return value;
};

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';
const isTest = NODE_ENV === 'test';

/* ── Database ─────────────────────────────────────────────────────────────
   One database for everything. The data domains are kept apart by collection
   name, not by database:

     properties, admins, verificationrequests,
     permissionrequests                          the onboarding side (v1)
     scriper_users, scriper_jobs, scriper_leads  the leads panel (v2)

   MONGODB_URI and LAMPOSE_MONGO_URI are accepted as aliases so an existing
   deployment's variable keeps working. */
const mongoUri = usableUri(
  process.env.MONGO_URI || process.env.LAMPOSE_MONGO_URI || process.env.MONGODB_URI,
);
const dbName = (process.env.DB_NAME || process.env.LAMPOSE_DB_NAME || '').trim() || undefined;

/* auto → Mongo when a URI resolved, the local JSON files under data/
   otherwise. The JSON store is a development convenience for the leads data:
   container filesystems are ephemeral, so a production process writing to it
   loses every lead on the next deploy. server.js says so loudly at boot. */
const storageMode = (() => {
  const requested = String(process.env.SCRIPER_STORAGE || 'auto').trim().toLowerCase();
  if (requested === 'json') return 'json';
  if (requested === 'mongo') return 'mongo';
  return mongoUri ? 'mongo' : 'json';
})();

/* ── Secrets ──────────────────────────────────────────────────────────────
   A missing signing key must not be papered over in production. The original
   leads backend refused to boot over this; here it cannot, because the same
   process also serves the onboarding app and the public site — killing it
   would take down two working frontends to protect a third. Instead the v2
   auth routes answer 503 AUTH_NOT_CONFIGURED and no token is ever issued.
   In development a fixed (not random) fallback is used so a restart does not
   log everyone out. */
const DEV_JWT_SECRET = 'lampose-main-backend-development-only-secret-do-not-deploy';
const rawJwtSecret = String(process.env.JWT_SECRET || '').trim();
const jwtSecret = rawJwtSecret || (isProduction ? '' : DEV_JWT_SECRET);

const adminSecretKey = String(process.env.ADMIN_SECRET_KEY || process.env.ADMIN_PASSWORD || '').trim()
  || (isProduction ? '' : 'admin_secret_123');

const config = {
  nodeEnv: NODE_ENV,
  isProduction,
  isDevelopment: !isProduction && !isTest,
  isTest,

  /* 5001 is what this backend has always listened on; the leads backend used
     5000. PORT wins over both. */
  port: Number(process.env.PORT) || 5001,
  host: process.env.HOST || '0.0.0.0',
  /* Render, Railway, Nginx and friends terminate TLS at a proxy. Without
     this, req.ip is the proxy's and req.protocol is always http. */
  trustProxy: bool(process.env.TRUST_PROXY, true),
  /* 25mb, not the leads backend's 1mb: /api/v1/properties/upload-image accepts
     a base64 data URI in the JSON body, and base64 inflates a 15MB photo to
     roughly 20MB. Lowering this silently breaks image upload from the
     onboarding app. */
  bodyLimit: process.env.BODY_LIMIT || '25mb',

  log: {
    enabled: bool(process.env.REQUEST_LOGGING, !isTest),
    /* Bodies are redacted, never raw — see middleware/requestLogger.js. */
    bodies: bool(process.env.REQUEST_LOG_BODY, true),
    maxBodyChars: Number(process.env.REQUEST_LOG_BODY_CHARS) || 500,
    /* The response payload, on the departure line. On by default because the
       question this console is opened to answer is almost always "what did
       the app actually receive". Redacted by the same rules as a request. */
    responses: bool(process.env.REQUEST_LOG_RESPONSE, true),
    /* Roomier than a request body: a listings reply is the thing being
       inspected, and 500 characters cuts off inside the first document. */
    maxResponseChars: Number(process.env.REQUEST_LOG_RESPONSE_CHARS) || 900,
  },

  db: {
    uri: mongoUri,
    dbName,
    options: { serverSelectionTimeoutMS: Number(process.env.DB_TIMEOUT_MS) || 8000 },
    retryMs: Number(process.env.DB_RETRY_MS) || 5000,
  },

  /* ── Push notifications ───────────────────────────────────────────────
     Both apps are Expo, so one endpoint reaches Android and iOS with one
     token format. No key is needed for development; production uploads FCM
     credentials to the Expo project rather than holding them here.

     `enabled` exists so a deployment can turn push off without a code change
     — useful while the apps are being built, and the only honest switch when
     the Expo project is not set up yet. Off means every send is a named
     no-op, never an error. */
  push: {
    enabled: bool(process.env.PUSH_ENABLED, true),
    /* Only needed when the Expo project has push security enabled. */
    accessToken: String(process.env.EXPO_ACCESS_TOKEN || '').trim() || null,
    /* Short: a state transition has already committed and must not wait on a
       gateway to report it. */
    timeoutMs: Number(process.env.PUSH_TIMEOUT_MS) || 6000,
  },

  /* ── The visit token ──────────────────────────────────────────────────
     A bachelor or co-live visit is confirmed by the owner and then paid for:
     a small token that turns a browse into an intent, and buys the joining-date
     step and the address behind it.

     Absent keys are not fatal. Nothing here exits the process — the payment
     routes answer a named 503 and every other flow carries on, which is the
     same rule Mongo, SMS and Twilio follow. */
  razorpay: {
    keyId: String(process.env.RAZORPAY_KEY_ID || '').trim(),
    /* Never leaves the server: it signs orders and verifies callbacks. */
    keySecret: String(process.env.RAZORPAY_KEY_SECRET || '').trim(),
    /* Optional. Set it and the webhook route verifies its own signature. */
    webhookSecret: String(process.env.RAZORPAY_WEBHOOK_SECRET || '').trim(),

    /* In PAISE, because that is the only unit Razorpay accepts and converting
       at the boundary is where rounding bugs get in. 2000 = ₹20. */
    tokenAmountPaise: (() => {
      const raw = Number(process.env.VISIT_TOKEN_AMOUNT_PAISE);
      if (!Number.isFinite(raw) || raw < 100) return 2000;
      return Math.round(raw);
    })(),

    /* How long an accepted request waits to be paid for.
       The owner has agreed and is holding a layout; without a deadline an
       unpaid request holds it for ever. */
    payWindowHours: (() => {
      const raw = Number(process.env.VISIT_TOKEN_WINDOW_HOURS);
      if (!Number.isFinite(raw) || raw < 1 || raw > 168) return 24;
      return Math.round(raw);
    })(),
  },

  /* ── The stay-request flow ────────────────────────────────────────────
     A student asks, an owner has a few minutes to answer on their phone.

     `expiryMinutes` is the whole product decision in one number, and it is
     configuration rather than a constant precisely because three minutes is a
     starting guess: it has to cover push delivery, the owner noticing,
     unlocking, reading and deciding. The number to watch in the first week is
     the ratio of expired to answered, and changing it must not be a deploy of
     new code.

     Read ONCE, here, so the two apps and the expiry worker cannot disagree
     about how long a request lives. */
  booking: {
    expiryMinutes: (() => {
      const value = Number(process.env.REQUEST_EXPIRY_MINUTES);
      /* Bounded rather than trusted. A zero would expire every request the
         instant it was made, and a typo of 300 would hold a bed for five
         hours on a flow whose entire promise is that it is quick. */
      if (!Number.isFinite(value) || value <= 0) return 3;
      return Math.min(value, 60);
    })(),

    /* How many times a student may pull one request back.
       One, and the state machine enforces it for free: a withdrawal is
       terminal, so a second attempt fails the `pending_owner` filter. The
       setting exists for the day a request becomes re-openable — until then
       it is a ceiling nothing can reach. */
    maxWithdrawalsPerRequest: (() => {
      const value = Number(process.env.MAX_WITHDRAWALS_PER_REQUEST);
      return Number.isFinite(value) && value >= 0 ? value : 1;
    })(),

    /* How often the expiry worker looks. One tick of lateness against a
       three-minute deadline is acceptable; the guard on every read and every
       action is what makes it correct rather than merely prompt. */
    expiryTickMs: Number(process.env.REQUEST_EXPIRY_TICK_MS) || 5000,
  },

  storage: { mode: storageMode },

  auth: {
    jwtSecret,
    /* False only when JWT_SECRET is missing in production. The v2 auth and
       user routes answer 503 instead of issuing a forgeable token. */
    configured: Boolean(jwtSecret),
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
    /* The website's sessions are deliberately shorter than the app's.
       A phone is a personal device someone unlocks; a browser may be a shared
       or public machine, and `localStorage` survives closing the tab. One day
       means a forgotten session on someone else's computer is dead by
       tomorrow, and a regular visitor still signs in at most once a day. */
    webJwtExpiresIn: process.env.WEB_JWT_EXPIRES_IN || '1d',
    adminSecretKey,
    /* Guards the v2 routes that only ever run behind the leads panel's login
       screen. Set to false only if a client that cannot send an Authorization
       header needs them. */
    requireAuth: bool(process.env.REQUIRE_AUTH, true),
    /* admin@scriper.com / admin123 is fine on a laptop and a full compromise
       on a public deployment, so seeding is off in production. */
    seedDefaultUsers: bool(process.env.SEED_DEFAULT_USERS, !isProduction),
  },


  scraper: {
    defaultDepth: Number(process.env.SCRAPER_DEFAULT_DEPTH) || 15,
    maxDepth: Number(process.env.SCRAPER_MAX_DEPTH) || 100,
    /* The original engine topped up short Google Maps results with generated
       rows so a demo always looked full. Real leads and invented ones are
       indistinguishable downstream, so it is opt-in and off by default. */
    fillShortResults: bool(process.env.SCRAPER_FILL_SHORT_RESULTS, false),
    enabled: bool(process.env.SCRAPER_ENABLED, true),
  },
};

/* Problems worth saying out loud once at boot. Collected rather than thrown:
   this process serves three frontends, and a misconfiguration that only
   affects one of them must not stop the other two. */
const configErrors = [];
const configWarnings = [];

if (!mongoUri) {
  configWarnings.push(
    'MONGO_URI is not set — v2 data routes answer 503 and v1 falls back to its in-memory store.',
  );
}

if (!jwtSecret) {
  configErrors.push(
    'JWT_SECRET is not set. /api/v2/auth and /api/v2/users will answer 503 rather than '
    + 'issue forgeable tokens. The v1 onboarding and admin routes are unaffected.',
  );
} else if (isProduction) {
  if (jwtSecret.length < 32) {
    configWarnings.push(`JWT_SECRET is only ${jwtSecret.length} characters — use 32 or more in production.`);
  }
  if (jwtSecret === DEV_JWT_SECRET || jwtSecret === 'change_me_to_a_long_random_string') {
    configErrors.push('JWT_SECRET is still the example value. Replace it before deploying.');
  }
}

if (!adminSecretKey) {
  configErrors.push('ADMIN_SECRET_KEY is not set — registering an ADMIN through /api/v2/auth/register is refused for everyone.');
} else if (isProduction && adminSecretKey === 'admin_secret_123') {
  configWarnings.push('ADMIN_SECRET_KEY is still the example value — anyone who has read the repo can register as ADMIN.');
}

if (storageMode === 'mongo' && !mongoUri) {
  configErrors.push('SCRIPER_STORAGE=mongo but MONGO_URI is missing or unusable.');
}

if (storageMode === 'json' && isProduction) {
  configWarnings.push(
    'Leads data is on the local JSON store in production. Container filesystems are ephemeral: '
    + 'users, jobs and leads will be lost on the next deploy. Set MONGO_URI.',
  );
}

if (isProduction && config.auth.seedDefaultUsers) {
  configWarnings.push('SEED_DEFAULT_USERS is on in production — the well-known demo accounts will be created.');
}


module.exports = config;
module.exports.config = config;
module.exports.configErrors = configErrors;
module.exports.configWarnings = configWarnings;
