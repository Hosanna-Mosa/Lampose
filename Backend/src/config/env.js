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

  /* ── The assisted visit ───────────────────────────────────────────────
     ONE payment, on bachelor and co-live: the owner confirms, the customer
     pays ₹199 for a visit a Lampose representative accompanies, then picks a
     slot — in WhatsApp on the web channel, in the app on the app channel —
     and only then gets the address. There is no other charge: the ₹20 token
     and the ₹99 contact unlock this replaced are gone.

     Absent keys are not fatal. Nothing here exits the process — the payment
     routes answer a named 503 and every other flow carries on, which is the
     same rule Mongo, SMS and Twilio follow. */
  razorpay: {
    keyId: String(process.env.RAZORPAY_KEY_ID || '').trim(),
    /* Never leaves the server: it signs orders and verifies callbacks. */
    keySecret: String(process.env.RAZORPAY_KEY_SECRET || '').trim(),
    /* Optional. Set it and the webhook route verifies its own signature. */
    webhookSecret: String(process.env.RAZORPAY_WEBHOOK_SECRET || '').trim(),

    /*
     * DEVELOPMENT ONLY — mark a visit's ₹199 token paid without paying it.
     *
     * Not a product feature and not a payment method: a button that skips the
     * gateway so the screens behind it can be worked on while the real
     * checkout is unavailable. There is no cash, no collection, and nobody
     * owes anything afterwards — the row simply says the token was waived for
     * development.
     *
     * OFF unless explicitly `true`, and it can never be on in production —
     * `NODE_ENV=production` refuses it outright here rather than trusting
     * anybody to unset it. This is a deliberate hole in the one rule the
     * payments obey ("paid only when an HMAC over `orderId|paymentId`
     * verified against our own secret"), which is exactly why it is a flag
     * and not a hardcoded button: a flag is switched off, and a hardcoded
     * button is forgotten.
     *
     * A request settled this way is never indistinguishable from a real
     * payment — `payment.mode: 'dev'` with a null `paymentId` marks every one.
     */
    devAllowMarkPaid: String(process.env.DEV_ALLOW_MARK_PAID || '').trim().toLowerCase() === 'true'
      && String(process.env.NODE_ENV || '').trim() !== 'production',

    /*
     * DEVELOPMENT ONLY — force a move-in without waiting for the date.
     *
     * Checking in is gated by a real calendar day (the Stay Partner button
     * says "Check-in available 25 September") and by an ORDER — the owner
     * marks the guest in, then the guest confirms. Both are correct and both
     * make the hotel settlement flow untestable until the day arrives.
     *
     * This flag unlocks a bypass that stamps both halves at once, so the
     * whole chain — check-in → settlement releasable → Withdraw in the admin
     * Monitor — can be walked through in a minute.
     *
     * A SEPARATE flag from `devAllowMarkPaid` rather than one shared
     * development switch: they unlock different powers over different things,
     * and a single flag would mean enabling a payment bypass to test a
     * calendar. Refused under NODE_ENV=production the same way.
     */
    devAllowForceCheckIn: String(process.env.DEV_ALLOW_FORCE_CHECKIN || '').trim().toLowerCase() === 'true'
      && String(process.env.NODE_ENV || '').trim() !== 'production',

    /*
     * What Lampose keeps from a HOTEL booking, as a percentage.
     *
     * The DEFAULT only. Every settlement stores its own `commissionPercent`,
     * copied from here when the row is created and editable per booking by an
     * administrator — so changing this figure reprices future bookings and
     * never one already made. A settlement that has left `releasable` freezes
     * it entirely.
     *
     * Applies to HOTEL alone. PG/Hostel and Co-living take no money through
     * the platform, and Bachelor's ₹199 is a fixed fee that is entirely ours
     * with no owner share to take a percentage of.
     *
     * Clamped to 0–100: a percentage outside that is not a bigger or smaller
     * commission, it is a negative payout or a debt.
     */
    hotelCommissionPercent: (() => {
      const raw = Number(process.env.HOTEL_COMMISSION_PERCENT);
      if (!Number.isFinite(raw) || raw < 0 || raw > 100) return 5;
      return raw;
    })(),

    /* In PAISE, because that is the only unit Razorpay accepts and converting
       at the boundary is where rounding bugs get in. 19900 = ₹199, charged in
       one shot — there is no advance/balance split any more. */
    assistedVisitAmountPaise: (() => {
      const raw = Number(process.env.VISIT_ASSISTED_AMOUNT_PAISE);
      if (!Number.isFinite(raw) || raw < 100) return 19900;
      return Math.round(raw);
    })(),

    /* DISPLAY ONLY: how the ₹199 is explained to the customer, on the site
       and in the WhatsApp message — "₹100 for the representative who
       accompanies you, the rest is the Lampose fee". Nothing is charged
       against this figure; the fee half is derived (total − this) in
       `toPublic` so the two lines always add up to the total. */
    assistedRepresentativePaise: (() => {
      const raw = Number(
        process.env.VISIT_ASSISTED_REPRESENTATIVE_PAISE
        ?? process.env.VISIT_ASSISTED_ADVANCE_PAISE,   // the variable's old name
      );
      if (!Number.isFinite(raw) || raw < 100) return 10000;
      return Math.round(raw);
    })(),

    /* How long an accepted request waits to be paid for.
       The owner has agreed and is holding a layout; without a deadline an
       unpaid request holds it for ever. */
    payWindowHours: (() => {
      const raw = Number(process.env.VISIT_PAY_WINDOW_HOURS
        ?? process.env.VISIT_TOKEN_WINDOW_HOURS);      // the variable's old name
      if (!Number.isFinite(raw) || raw < 1 || raw > 168) return 24;
      return Math.round(raw);
    })(),

    /* How long a paid visit may sit without a slot before the customer is
       reminded and the team is told to call. One reminder, ever — after it,
       the follow-up is a person's job, not a message loop's. */
    slotReminderHours: (() => {
      const raw = Number(process.env.VISIT_SLOT_REMINDER_HOURS);
      if (!Number.isFinite(raw) || raw < 1 || raw > 48) return 2;
      return Math.round(raw);
    })(),
  },

  /*
   * RazorpayX — moving money OUT, to a Stay Partner owner's bank account or
   * UPI id. A separate product from `razorpay` above (which only ever takes
   * the ₹199 IN), with its own credentials and its own dashboard, so it gets
   * its own config block rather than being folded into that one.
   *
   * Absent keys are not fatal, on the same rule every other integration here
   * follows: `PartnerPayout` rows can still be REQUESTED with this
   * unconfigured (see `payout.service.js`) — they simply sit `pending`
   * rather than being dispatched, which is an honest state rather than a
   * silent no-op. `POST /admin/partner-payouts/:id/process` answers a named
   * 503 until this is set.
   */
  razorpayx: {
    keyId: String(process.env.RAZORPAYX_KEY_ID || '').trim(),
    keySecret: String(process.env.RAZORPAYX_KEY_SECRET || '').trim(),
    /* The RazorpayX virtual account payouts are drawn from — NOT the same
       thing as a bank account number belonging to a partner. Found on the
       RazorpayX dashboard. */
    accountNumber: String(process.env.RAZORPAYX_ACCOUNT_NUMBER || '').trim(),

    /*
     * The secret RazorpayX signs PAYOUT webhooks with.
     *
     * Separate from `razorpay.webhookSecret` because they are separate
     * products with separate dashboards, and a deployment can legitimately
     * have one and not the other. It falls back to the payment-gateway secret
     * only because a merchant who configures ONE webhook endpoint for both
     * products will have set one secret — and a payout event silently failing
     * signature verification is the worst of both worlds: money moved and
     * nothing recorded it.
     *
     * `verifyPayoutWebhook` tries this first and the PG secret second, so
     * either configuration verifies and neither is guessed at.
     */
    webhookSecret: String(
      process.env.RAZORPAYX_WEBHOOK_SECRET || process.env.RAZORPAY_WEBHOOK_SECRET || '',
    ).trim(),

    /*
     * MANUAL PAYOUTS — the mode this deployment is actually in.
     *
     * RazorpayX is built, tested and dormant. Until the account has
     * credentials, an owner is paid by a person making a bank transfer and
     * recording the reference here, and every automatic dispatch path refuses
     * with a sentence saying so rather than half-working.
     *
     * It is a FLAG rather than deleted or commented-out code because the
     * automatic path is the destination, not a mistake: flip this to `false`
     * once the keys are in and the whole rail wakes up with its tests still
     * passing. Defaults to manual, so a deployment that has never heard of
     * this variable cannot accidentally try to move money over a rail it has
     * no credentials for.
     */
    manualPayouts: String(process.env.PAYOUTS_MANUAL ?? 'true').trim().toLowerCase() !== 'false',
    get configured() {
      return Boolean(this.keyId && this.keySecret && this.accountNumber);
    },
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

  /*
   * Where the restaurant owner's console is served from.
   *
   * Used to build the link in the "you have a new order" WhatsApp — see
   * `foodOrder.notifier.js`. It is a CONFIGURED value rather than something
   * derived from the request that happened to place the order, because the
   * order is placed by a diner on lampose.com or in the User App, and the
   * link has to point at a completely different front end.
   *
   * Empty by default and never guessed. A message that arrives with a
   * localhost link, or a link to the diner's own site, is worse than one
   * with no link at all: the kitchen taps it, nothing sensible opens, and
   * they stop tapping. `orderLink` below returns null when this is unset and
   * the notifier sends the message without a link.
   */
  restaurantConsoleUrl: String(process.env.RESTAURANT_CONSOLE_URL || '').trim().replace(/\/+$/, ''),

  /*
   * The delivery desk — who is asked, on WhatsApp, to send a driver.
   *
   * When a restaurant accepts an order and picks "a Lampose driver" instead of
   * delivering it themselves, this is the number that gets the request. See
   * `foodDelivery.service.js`.
   *
   * A CONFIGURED value with a working default rather than a literal buried in
   * the sending code: the desk's phone changes (a new hire, a second number)
   * and that must be a one-line environment change, not a code change and a
   * deploy. The default is the desk's current number, so the flow works the
   * moment the code does.
   */
  deliveryDesk: {
    whatsapp: String(process.env.DELIVERY_PARTNER_WHATSAPP || '+916302321942').trim(),
  },

  /* Inbound webhooks that must prove who sent them — see
     shared/middleware/twilioSignature.js. */
  webhooks: {
    publicBaseUrl: String(process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, ''),
    /* The exact URL configured in the Twilio console, when the rebuilt one
       would differ (a path rewrite in nginx, say). */
    twilioUrl: String(process.env.TWILIO_WEBHOOK_URL || '').trim(),
    /* Never true in production — refused below with a warning, like the
       DEV_ALLOW_* flags. */
    allowUnsigned: !isProduction && bool(process.env.ALLOW_UNSIGNED_WEBHOOKS, false),
  },

  auth: {
    jwtSecret,
    /* False only when JWT_SECRET is missing in production. The v2 auth and
       user routes answer 503 instead of issuing a forgeable token. */
    configured: Boolean(jwtSecret),
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
    /*
     * The website's sessions, now the same length as the app's.
     *
     * They were a day, on the reasoning that a phone is a personal device
     * somebody unlocks while a browser may be shared, and `localStorage`
     * survives closing the tab. That is still true, and it is the argument
     * for shortening this again — but it was decided the other way: the
     * website asks people to sign in with an SMS, and a day means a regular
     * visitor pays for that SMS every day. Signing out is the answer to the
     * shared-machine case, and it is one tap in the bar.
     *
     * Kept as its own knob rather than folded into `jwtExpiresIn`, because
     * the two are separate decisions that happen to agree today. Shortening
     * the web back to a day is `WEB_JWT_EXPIRES_IN=1d` and nothing else —
     * both places that open a browser session read this one value: the
     * sign-in on lampose.com and the session a visit request opens off its
     * own one-time code.
     */
    webJwtExpiresIn: process.env.WEB_JWT_EXPIRES_IN || process.env.JWT_EXPIRES_IN || '7d',
    /* The admin console's session. Brought in line with every other identity
       in this process — one token lifetime, one number to reason about —
       rather than the desk/pocket distinction this used to encode. A stolen
       token still outlives that distinction; revocation is what actually
       bounds it, not the TTL. See admins/adminToken.js. */
    adminSessionTtl: process.env.ADMIN_SESSION_TTL || '7d',
    adminSecretKey,
    /*
     * Guards the v2 routes that only ever run behind the leads panel's login
     * screen — and in production it is TRUE whatever the environment says.
     *
     * `protect` and `protectRole` in `shared/middleware/authMiddleware.js`
     * become pass-throughs when this is false. That is a useful escape hatch
     * on a laptop and a total bypass on a deployment: it would reopen
     * `POST /api/v2/auth/register` to anonymous callers, and `/api/v2/users`
     * with it, so a single environment variable could silently undo the guard
     * that closed that hole.
     *
     * Forced rather than fatal, because nothing in this process exits over
     * configuration — the rule the whole file follows. A deployment that asked
     * for the hatch gets the safe behaviour and a loud line in the boot banner
     * saying it was refused, rather than a server that will not start.
     */
    requireAuth: isProduction ? true : bool(process.env.REQUIRE_AUTH, true),
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

/* The WhatsApp webhook is where an owner's YES publishes a property. Unsigned
   means anybody can say YES for them. Off in production no matter what. */
if (bool(process.env.ALLOW_UNSIGNED_WEBHOOKS, false)) {
  configWarnings.push(
    isProduction
      ? 'ALLOW_UNSIGNED_WEBHOOKS is set but NODE_ENV=production — REFUSED. Inbound WhatsApp '
        + 'must carry a valid X-Twilio-Signature here.'
      : '⚠️  ALLOW_UNSIGNED_WEBHOOKS is ON — /api/whatsapp/webhook accepts unsigned requests. '
        + 'Development only. Unset it before anybody real uses this server.',
  );
}

/* Loud, because this one is a hole in the payment rule rather than a missing
   integration: it is the difference between "the ₹199 was verified" and
   "a developer tapped a button". Refused outright in production above. */
if (String(process.env.DEV_ALLOW_MARK_PAID || '').trim().toLowerCase() === 'true') {
  configWarnings.push(
    String(process.env.NODE_ENV || '').trim() === 'production'
      ? 'DEV_ALLOW_MARK_PAID is set but NODE_ENV=production — REFUSED. A visit can only be '
        + 'settled by a verified Razorpay signature here.'
      : '⚠️  DEV_ALLOW_MARK_PAID is ON — the ₹199 visit token can be marked paid WITHOUT a '
        + 'payment. Development only. Unset it before anybody real uses this server.',
  );
}

/* The same shape, and it was missing: this flag unlocks three bypasses across
   two apps — a move-in stamped with no PIN and no date, and an owner marked
   payable with an invented fund account — and said nothing at boot. A hole
   that announces itself is one somebody closes. Refused in production above. */
if (String(process.env.DEV_ALLOW_FORCE_CHECKIN || '').trim().toLowerCase() === 'true') {
  configWarnings.push(
    String(process.env.NODE_ENV || '').trim() === 'production'
      ? 'DEV_ALLOW_FORCE_CHECKIN is set but NODE_ENV=production — REFUSED. A move-in needs the '
        + 'real date and the real entry PIN here.'
      : '⚠️  DEV_ALLOW_FORCE_CHECKIN is ON — a move-in can be stamped WITHOUT the date or the '
        + 'entry PIN, and an owner marked payable with a fake account. Development only. Unset '
        + 'it before anybody real uses this server.',
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

/* Said out loud, because the override is silent otherwise: an operator who set
   this expecting the guards off would find the hatch simply not working, with
   nothing anywhere explaining why. */
if (isProduction && bool(process.env.REQUIRE_AUTH, true) === false) {
  configWarnings.push(
    'REQUIRE_AUTH=false was IGNORED — the v2 auth guards stay on in production. '
    + 'Turning them off would reopen anonymous staff-account creation.',
  );
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
