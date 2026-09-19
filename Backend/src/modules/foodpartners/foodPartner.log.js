/* ══════════════════════════════════════════════════════════════════════════
   The Food-Partner module's own voice in the console.

   `shared/middleware/requestLogger.js` already prints an arrival line and a
   departure line for every call this process receives, and it is deliberately
   left exactly as it is. It is generic, it is mounted before CORS so that a
   blocked origin and a 404 are still visible, and it knows nothing about any
   one business domain. Teaching it the shape of a restaurant application
   would make one shared file depend on one module, and its terse two-line
   pair is the wrong place to unfold a sixty-field onboarding payload — the
   whole submission would arrive as one 500-character `| req: {…}` and be
   unreadable at the exact moment somebody needs to read it.

   So this file sits ON TOP of that one rather than replacing it. Its whole
   job is that a developer watching `npm run dev` can see, without opening a
   database client or a proxy, that the Food-Partner app called and precisely
   what it sent — step by step, in the order the field spec itself lists.

   ## One badge, on every line

   Every line printed from this module starts with `🍽️  [Food-Partner]`, the
   continuation lines of the multi-line blocks included. Two reasons, and both
   of them are about a console that is never showing only this module:

     · it is ONE grep string. `npm run dev | grep Food-Partner` (or grep the
       plate, if you prefer typing an emoji) yields every food-partner line
       and nothing else, and no other module's badge collides with it.

     · a request from the User App can land in the middle of a block. The
       prefix keeps a boxed application visually attached to itself when that
       happens, which a bare box does not.

   Emoji-as-badge is the house convention rather than an invention here — the
   boot banner, the CORS refusal and the Cloudinary failure all do it. Prose
   elsewhere in this codebase carries none, and neither does the prose here.

   ## The application block is drawn as a box, and the box holds no emoji

   The centrepiece is `logApplicationSteps`: a header, one labelled section
   per section of the field spec IN THE SPEC'S OWN ORDER, aligned columns, a
   per-section "filled N of M" tally naming what is missing, and a footer.

   Alignment is the entire point of it — a wall of ragged text is not a clear
   log — so the box is built from fixed-width columns and every value is
   TRUNCATED rather than wrapped. That in turn is why nothing inside the box
   is an emoji, and why `sanitise` below replaces any astral character coming
   from the payload with a `·`: a restaurant that puts a flame in its name
   renders two columns wide in some terminals and one in others, and one such
   value skews every row beneath it. The badge is outside the box, identical
   on every line, so whatever width it renders at shifts the block as a whole
   and the rectangle survives.

   The whole block is printed with a SINGLE `console.log`. Node writes one
   call as one write, so a concurrent request cannot land between the header
   and the footer. Twenty separate calls would let it.

   ## The menu is summarised, never enumerated

   An eighty-item menu printed item by item buries the six sections that
   matter and pushes the boot banner off the scrollback. The menu section
   prints its categories with their item counts, the total, a sample of the
   first few items of the first category, and how many were elided.

   ## Redaction is this file's job, not the request logger's

   The request logger redacts what passes through it; nothing passes through
   it on the way here, because these functions are called from the
   controllers with values already parsed. A console is frequently
   screen-shared — over a call, in a screenshot pasted into a chat, on a
   projector during a demo — so a password, a password hash, a one-time code
   and a bank account number must never be printed at all, not even briefly
   and not even in development. The account number prints as `ending NNNN`
   and nothing else; the digits that make it useful to a thief are the digits
   that never reach the terminal. A base64 data URI prints as its type and
   size (`<image/jpeg, 1.2MB base64>`), copied from `requestLogger.redact`,
   because a 15MB photo would otherwise fill the screen with one field.

   ## Nothing here can break a request

   Every exported function is wrapped by `safely`, which swallows its own
   errors and prints one warning. An application that has arrived must never
   be lost to a formatting mistake in the logger that was watching it. The
   same wrapper is where the single `config.log.enabled` guard lives, so
   turning logging off turns off every line in this file, and there is only
   one place that has to be right for that to be true.

   A logging library (pino, winston) was considered and rejected: nothing else
   in this backend has one, the output would stop matching the boot banner and
   the request log it is read alongside, and the audience for these lines is a
   person at three in the morning rather than an aggregator.

   ## What the controllers call

     tagFoodPartnerRequest        Express middleware. Mount it FIRST on the
                                  food-partner router. Also hangs a timer on
                                  `req.foodPartnerTimer`.
     logApplicationSteps(body, req)          the boxed block, before validation
     logApplicationSaved({ restaurantId, restaurantName, productCount, timer })
     logRejected(reason, { code, field, ownerPhone, ownerEmail, status })
     logLogin({ ok, identifier, restaurantId, restaurantName, reason, code })
     logMenuChange({ action, restaurantId, productId, productName, category,
                     price, isAvailable, changes })
     logAvailability({ restaurantId, from, to, effective })
     logDiscovery({ route, filters, count, total, timer })
     logUpload({ restaurantId, folder, count, mode, bytes, timer })
     logDependencyMissing({ dependency, code, route, hint })
     logError(what, error)
     startTimer()                 -> { ms(), text() }

   Every one of them takes a single loose object and tolerates a missing or
   half-filled one, because a logging call must never be the reason a handler
   throws — and `timer` and `ms` are accepted interchangeably wherever a
   duration is printed.
   ══════════════════════════════════════════════════════════════════════════ */
const config = require('../../config/env');

/* ── The badge ────────────────────────────────────────────────────────────
   One string, on every line this module prints. Change it here and the grep
   changes everywhere. */
const BADGE = '🍽️';
const TAG = '[Food-Partner]';
const PREFIX = `${BADGE}  ${TAG}`;

/* 78 is the width of the boot banner's rule in server.js. Matching it means
   the application block and the banner line up in the same scrollback. */
const BOX = 78;
const INNER = BOX - 4;      // the writable span between "│ " and " │"
const LABEL = 21;           // the field-name column — `verificationDocuments` is the longest
const VALUE = INNER - 2 - LABEL - 1;

const EMPTY = '—';

/* Same shape as requestLogger's, and deliberately so: a data URI is
   interesting for its type and its size, never its content. */
const DATA_URI = /^data:([\w/+.-]+);base64,/i;

const humanBytes = (bytes) => {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${bytes}B`;
};

/* ── Timing ───────────────────────────────────────────────────────────────
   Exported so a controller can print a real duration rather than a guess.
   `tagFoodPartnerRequest` already hangs one on the request, so the usual
   caller never has to start its own:

     const timer = req.foodPartnerTimer || startTimer();
     …
     logApplicationSaved({ restaurantId, productCount, timer });

   hrtime rather than Date.now(): a monotonic clock cannot be dragged
   backwards by NTP mid-request and report a negative save. */
const startTimer = () => {
  const startedAt = process.hrtime.bigint();
  return {
    ms: () => Number(process.hrtime.bigint() - startedAt) / 1e6,
    text: () => `${(Number(process.hrtime.bigint() - startedAt) / 1e6).toFixed(0)}ms`,
  };
};

/** A duration from whichever of the two shapes a caller passed, or ''. */
const durationText = (info = {}) => {
  if (info.timer && typeof info.timer.ms === 'function') return `${info.timer.ms().toFixed(0)}ms`;
  if (Number.isFinite(Number(info.ms))) return `${Number(info.ms).toFixed(0)}ms`;
  return '';
};

/* ── Text that is safe to put in a fixed-width column ─────────────────────
   Control characters and newlines would break the box outright; an emoji in
   a restaurant name breaks it subtly, which is worse, because the rows below
   it are then off by one column with nothing on screen to say why. */
const sanitise = (text) => String(text)
  .replace(/[\u0000-\u001f\u007f]+/g, ' ')
  .replace(/[\ufe0e\ufe0f\u200d]/g, '')
  .replace(/[\u{10000}-\u{10ffff}]/gu, '·');

/* A VALUE is trimmed as well. The indentation of an ASSEMBLED box line is
   not — trimming it would collapse the field column that the whole box is
   built out of — which is why `boxLine` reaches for `sanitise` and every
   other caller reaches for `flatten`. */
const flatten = (text) => sanitise(text).trim();

const pad = (text, width) => (text.length >= width ? text.slice(0, width) : text + ' '.repeat(width - text.length));
const clip = (text, width) => (text.length <= width ? text : `${text.slice(0, Math.max(1, width - 1))}…`);

/* ── Redaction ────────────────────────────────────────────────────────────
   Used on the free-form objects a caller may hand to logMenuChange or
   logDiscovery. The named fields of an application are redacted at the point
   they are read instead, which is stricter: a password is not "a key that
   matched a pattern" there, it is a field this file knows about and refuses
   to print. */
/* Kept in step with `shared/middleware/requestLogger.js` — the two run over
   the same application payload and a field redacted by one and printed by
   the other is not redacted at all. */
const SECRET_KEY = /pass(word)?|secret|token|otp|hash|salt|authorization|apikey|api_key|account(number)?|bankaccount|cvv|ifsc|upi|aadhaar|pannumber|\bpan\b|gstin|signature/i;

const redactValue = (value, depth = 0) => {
  if (typeof value === 'string') {
    const match = value.match(DATA_URI);
    if (match) return `<${match[1]}, ${humanBytes(Math.round((value.length * 3) / 4))} base64>`;
    return value.length > 120 ? `${value.slice(0, 120)}…` : value;
  }
  if (depth > 2 || value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    const head = value.slice(0, 6).map((item) => redactValue(item, depth + 1));
    return value.length > 6 ? [...head, `…+${value.length - 6} more`] : head;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, val]) => [
      key,
      SECRET_KEY.test(key) ? '***REDACTED***' : redactValue(val, depth + 1),
    ]),
  );
};

/** The last four digits and nothing else — see the file header. */
const accountEnding = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length < 4) return EMPTY;
  return `ending ${digits.slice(-4)}`;
};

/* ── Reading a payload whose exact shape is the app's business ────────────
   The onboarding body may arrive flat (`line1`), nested (`address.line1`) or
   under a wrapper (`restaurant.address.line1`), and this logger must not be
   the reason a field looks missing when it was sent. `pick` tries the
   spellings in order and takes the first that is actually present. */
const get = (source, path) => String(path).split('.').reduce(
  (node, key) => (node === null || node === undefined ? undefined : node[key]),
  source,
);

const pick = (source, ...paths) => {
  for (const path of paths) {
    const value = get(source, path);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
};

/**
 * Was this field answered?
 *
 * `false` and `0` count as answered: a partner who ticked "we do not take
 * cash" or set a ₹0 packaging charge has told us something, and showing that
 * as missing would send somebody chasing a field that is already filled in.
 */
const isFilled = (value) => {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') {
    if (typeof value.url === 'string' || typeof value.uri === 'string') {
      return Boolean(value.url || value.uri);
    }
    return Object.values(value).some(isFilled);
  }
  return true;
};

/** One value, rendered as a single line of plain text. */
const describe = (value) => {
  if (value === undefined || value === null) return EMPTY;

  if (typeof value === 'string') {
    const match = value.match(DATA_URI);
    if (match) return `<${match[1]}, ${humanBytes(Math.round((value.length * 3) / 4))} base64>`;
    const text = flatten(value);
    return text || EMPTY;
  }

  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : EMPTY;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? EMPTY : value.toISOString().slice(0, 19).replace('T', ' ');
  }

  if (Array.isArray(value)) {
    if (!value.length) return EMPTY;
    const joined = value.map(describe).join(', ');
    return `${joined}  (${value.length})`;
  }

  if (typeof value === 'object') {
    /* An uploaded asset: the URL is the useful half, the publicId is what
       Cloudinary needs and a human never types. */
    const url = value.url || value.uri || value.secure_url;
    if (url) return describe(url);
    const entries = Object.entries(value).filter(([, v]) => isFilled(v));
    if (!entries.length) return EMPTY;
    return entries.map(([key, v]) => `${key} ${describe(v)}`).join(' · ');
  }

  return String(value);
};

const rupees = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? `₹${amount}` : EMPTY;
};

const minutes = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? `${amount} min` : EMPTY;
};

/* ── Box drawing ──────────────────────────────────────────────────────────
   Three edges and a content line, all exactly BOX columns wide so the right
   border is a straight vertical rule down the block. */
const edge = (left, right, title) => {
  const head = title ? ` ${flatten(title)} ` : '';
  const fill = Math.max(0, BOX - 3 - head.length);
  return `${left}─${clip(head, Math.max(0, BOX - 3))}${'─'.repeat(fill)}${right}`;
};

const boxTop = (title) => edge('┌', '┐', title);
const boxRule = (title) => edge('├', '┤', title);
const boxBottom = (title) => edge('└', '┘', title);
const boxLine = (text) => `│ ${pad(clip(sanitise(text), INNER), INNER)} │`;

/** One row of the box: a padded label, then the value, then optional notes. */
const field = (label, raw, text, notes) => ({
  label,
  filled: isFilled(raw),
  text: text === undefined ? describe(raw) : text,
  notes: notes || [],
});

/**
 * One section of the application block.
 *
 * The tally is the reason a section is worth drawing at all: "filled 7 of 10
 * · missing: description, logoImage, gstNumber" is the difference between
 * seeing that something did not arrive and diffing the payload against the
 * schema by hand at 3am.
 */
const renderSection = (index, title, rows, options = {}) => {
  const lines = [boxRule(`${index} · ${title}`)];

  rows.forEach((row) => {
    lines.push(boxLine(`  ${pad(row.label, LABEL)} ${clip(row.text, VALUE)}`));
    row.notes.forEach((note) => lines.push(boxLine(`  ${' '.repeat(LABEL)} ${clip(note, VALUE)}`)));
  });

  const filled = rows.filter((row) => row.filled).length;
  const missing = rows.filter((row) => !row.filled).map((row) => row.label);
  const tally = options.tally
    || `${filled} of ${rows.length}${missing.length ? ` · missing: ${missing.join(', ')}` : ''}`;

  lines.push(boxLine(`  ${pad(options.tallyLabel || '· filled', LABEL)} ${clip(tally, VALUE)}`));

  return { lines, filled, total: rows.length };
};

/* ── Who called ───────────────────────────────────────────────────────────
   The same reasoning as requestLogger's `callerOf` / `clientOf`, and it
   matters more here than anywhere: the Food-Partner app is React Native, so
   it sends no Origin header and can only ever be identified by X-Client. A
   line saying "192.168.1.14" tells you nothing when the phone, the leads
   panel and an uptime probe share one address. */
const callerOf = (req) => {
  const origin = req.headers?.origin || req.headers?.referer;
  if (origin) return String(origin).replace(/\/+$/, '');
  return req.ip || req.socket?.remoteAddress || 'unknown';
};

const clientOf = (req) => {
  const name = req.headers?.['x-client'];
  if (!name) return 'no X-Client header';
  const version = req.headers?.['x-client-version'];
  return version ? `${name}/${version}` : String(name);
};

/* ── The single guard ─────────────────────────────────────────────────────
   `config.log.enabled` is checked in exactly one place, and every exported
   function goes through it. The try/catch is the other half of the same
   promise: a logger that throws inside a request handler turns an
   observability nicety into a 500 on an application somebody spent twenty
   minutes filling in. */
const safely = (fn) => (...args) => {
  if (!config.log.enabled) return undefined;
  try {
    return fn(...args);
  } catch (error) {
    try {
      console.warn(`${PREFIX} ⚠️  logger error, ignored: ${error && error.message}`);
    } catch {
      /* The console itself is gone. There is nothing further to try. */
    }
    return undefined;
  }
};

/** One prefixed line. */
const say = (...parts) => console.log(`${PREFIX} ${parts.filter(Boolean).join(' ')}`);

/** A multi-line block, printed as ONE write so nothing interleaves into it. */
const block = (lines) => console.log(lines.map((line) => `${PREFIX} ${line}`).join('\n'));

const now = () => new Date().toLocaleTimeString();

/* ══════════════════════════════════════════════════════════════════════════
   1. Arrival — mounted first on this module's router
   ══════════════════════════════════════════════════════════════════════════ */

const emitArrival = safely((req) => {
  /* The route, not just the path: `POST /applications` is what a developer is
     looking for, and the mount prefix is the same on every line. */
  const route = String(req.originalUrl || req.url || '').replace(/^\/api\/v2\/food-partners/, '') || '/';

  say(
    '📩',
    `[${now()}]`,
    `${req.method} ${route}`,
    `· app ${clientOf(req)}`,
    `· from ${callerOf(req)}`,
  );
});

/**
 * Announces every call this module receives.
 *
 * Mount it FIRST on the food-partner router, before the rate limiters and
 * the database guard, so that a call refused by one of them is still visible
 * — "the app never called" and "the app called and was turned away" look
 * identical in a log that only prints what got through.
 *
 * It also starts the timer the controllers use. That assignment is outside
 * the logging guard on purpose: a controller reaching for
 * `req.foodPartnerTimer` must find one whether or not logging is switched on.
 */
const tagFoodPartnerRequest = (req, res, next) => {
  req.foodPartnerTimer = startTimer();
  emitArrival(req);
  return next();
};

/* ══════════════════════════════════════════════════════════════════════════
   2. The application block — the headline
   ══════════════════════════════════════════════════════════════════════════ */

/** "9 slots · 6 days · Mon 09:00-15:00 +8 more" */
const describeHours = (hours) => {
  if (!Array.isArray(hours) || !hours.length) return EMPTY;
  const days = new Set(hours.map((slot) => slot && slot.day).filter(Boolean));
  const first = hours[0] || {};
  const sample = `${String(first.day || '?').slice(0, 3)} ${first.openTime || '??:??'}-${first.closeTime || '??:??'}`;
  const rest = hours.length > 1 ? ` +${hours.length - 1} more` : '';
  return `${hours.length} slot${hours.length === 1 ? '' : 's'} · ${days.size} day${days.size === 1 ? '' : 's'} · ${sample}${rest}`;
};

/** "distance_based ₹20 + ₹8/km" — the shape depends on the type. */
const describeDeliveryFee = (fee) => {
  if (!fee || typeof fee !== 'object' || !isFilled(fee)) return EMPTY;
  const type = fee.type || 'flat';
  if (type === 'free_above') return `free_above ${rupees(fee.freeAboveValue)} (else ${rupees(fee.amount)})`;
  if (type === 'distance_based') return `distance_based ${rupees(fee.amount)} + ${rupees(fee.perKm)}/km`;
  return `flat ${rupees(fee.amount)}`;
};

const describeDocuments = (docs) => {
  if (!Array.isArray(docs) || !docs.length) return EMPTY;
  const kinds = docs.map((doc) => (doc && doc.kind) || 'unknown');
  const withFile = docs.filter((doc) => doc && (doc.url || doc.publicId)).length;
  return `${docs.length} · ${kinds.join(', ')} · ${withFile} with a file`;
};

/** Accepts GeoJSON `[lng, lat]` or a plain `{ lat, lng }`, and says which. */
const readCoordinates = (location) => {
  if (!location) return null;
  if (Array.isArray(location.coordinates) && location.coordinates.length === 2) {
    const [lng, lat] = location.coordinates.map(Number);
    return { lat, lng, source: 'GeoJSON [lng, lat]' };
  }
  const lat = Number(pick(location, 'lat', 'latitude'));
  const lng = Number(pick(location, 'lng', 'lon', 'longitude'));
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng, source: '{ lat, lng }' };
  return null;
};

const menuSection = (index, products) => {
  const items = Array.isArray(products) ? products : [];

  if (!items.length) {
    return renderSection(index, 'MENU', [field('items', undefined)], {
      tallyLabel: '· menu',
      tally: 'no menu items were sent with this application',
    });
  }

  /* Insertion order, not alphabetical: it is the order the partner built the
     menu in, which is the order they will look for it in. */
  const categories = new Map();
  items.forEach((item) => {
    const name = (item && item.category) || 'Uncategorised';
    categories.set(name, (categories.get(name) || 0) + 1);
  });

  const categoryText = [...categories.entries()]
    .map(([name, count]) => `${name} (${count})`)
    .join(', ');

  const firstCategory = [...categories.keys()][0];
  const sample = items.filter((item) => ((item && item.category) || 'Uncategorised') === firstCategory).slice(0, 3);

  const rows = [
    field('categories', categoryText, `${categories.size} · ${categoryText}`),
    field('items', items.length, String(items.length)),
  ];

  sample.forEach((item, position) => {
    const price = Number.isFinite(Number(item.discountedPrice)) && Number(item.discountedPrice) > 0
      ? `${rupees(item.price)} → ${rupees(item.discountedPrice)}`
      : rupees(item.price);
    rows.push(field(
      position === 0 ? `sample (${firstCategory})` : '',
      item,
      `${describe(item.productName || item.name)} · ${item.isVeg || 'veg'} · ${price}`,
    ));
  });

  const elided = items.length - sample.length;
  if (elided > 0) {
    rows.push(field('', 'elided', `…${elided} more item${elided === 1 ? '' : 's'} not shown`));
  }

  /* An item without a name, a category or a price cannot be listed, so that
     is the completeness worth counting here rather than a field tally. */
  const complete = items.filter((item) => item
    && String(item.productName || item.name || '').trim()
    && String(item.category || '').trim()
    && Number.isFinite(Number(item.price))).length;

  return renderSection(index, 'MENU', rows, {
    tallyLabel: '· menu',
    tally: `${complete} of ${items.length} items complete (name, category, price)`,
  });
};

/**
 * The whole onboarding payload, unfolded section by section.
 *
 * Call it the moment the body has been parsed and BEFORE validation runs, so
 * that a submission refused a line later has already been shown in full —
 * "what did they actually send" is the first question asked about every
 * rejection, and a validator that returns early is the one thing guaranteed
 * not to answer it.
 *
 *   logApplicationSteps(req.body, req);
 *
 * `meta` may be the Express request or `{ client, caller }`. Passing the
 * request itself is also accepted as the first argument, because that is the
 * mistake a hurried caller makes and losing the block over it would be a
 * poor trade.
 */
const logApplicationSteps = safely((payload, meta = {}) => {
  let body = payload;
  let context = meta;

  if (body && body.headers && body.method) {
    context = body;
    body = body.body;
  }

  const root = body || {};
  const r = root.restaurant || root.restaurantDetails || root;
  const products = root.products || root.menu || root.menuItems || r.products || r.menu || [];
  const address = r.address || root.address || {};
  const payout = r.payout || root.payout || root.bank || root.bankDetails || {};
  const contract = r.contract || root.contract || {};
  const deliveryFee = r.deliveryFee || root.deliveryFee || {};
  const coordinates = readCoordinates(r.location || root.location || address.location || root.coordinates);

  const client = context && context.headers ? clientOf(context) : (context.client || 'unknown app');
  const caller = context && context.headers ? callerOf(context) : (context.caller || 'unknown');

  const restaurantName = pick(r, 'restaurantName', 'name') || 'unnamed restaurant';

  const sections = [];

  /* 1 — Basic. The password is counted as answered but never rendered: this
     is the one field on the form whose value must not exist outside bcrypt. */
  const password = pick(r, 'password', 'passwordHash', 'plainPassword');
  sections.push(renderSection(1, 'BASIC INFO', [
    field('restaurantName', pick(r, 'restaurantName', 'name')),
    field('ownerName', pick(r, 'ownerName', 'owner.name')),
    field(
      'ownerPhone',
      pick(r, 'ownerPhone', 'owner.phone', 'phone'),
      undefined,
      pick(r, 'ownerPhone', 'owner.phone', 'phone')
        ? ['· the login identity, not the customer-facing number']
        : [],
    ),
    field('ownerEmail', pick(r, 'ownerEmail', 'owner.email', 'email')),
    field('password', password, password ? '•••••••• (set — never logged)' : EMPTY),
    field('logoImage', pick(r, 'logoImage', 'logo')),
    field('coverBannerImage', pick(r, 'coverBannerImage', 'coverImage', 'banner')),
    field('description', pick(r, 'description', 'tagline')),
    field('cuisineTypes', pick(r, 'cuisineTypes', 'cuisines', 'cuisine')),
    field('partnerType', pick(r, 'partnerType', 'type')),
  ]));

  /* 2 — Location & contact. The coordinate note is here because reversing
     the pair is the classic bug in this module: a 2dsphere query with
     latitude first does not throw, it simply returns nothing, and the screen
     it breaks is "restaurants near me" showing an empty list in a city full
     of them. */
  const contactNumber = pick(r, 'contactNumber', 'publicPhone', 'restaurantPhone');
  const ownerPhone = pick(r, 'ownerPhone', 'phone');
  sections.push(renderSection(2, 'LOCATION & CONTACT', [
    field('address.line1', pick(address, 'line1', 'addressLine1', 'street')),
    field('address.line2', pick(address, 'line2', 'addressLine2')),
    field('address.city', pick(address, 'city')),
    field('address.state', pick(address, 'state')),
    field('address.pincode', pick(address, 'pincode', 'pin', 'postalCode')),
    field('address.landmark', pick(address, 'landmark')),
    field(
      'location',
      coordinates,
      coordinates ? `lat ${coordinates.lat}, lng ${coordinates.lng}` : EMPTY,
      coordinates
        ? [`· read from ${coordinates.source}; stored as [lng, lat]`]
        : ['· no pin dropped — this kitchen cannot appear in a "near me" search'],
    ),
    field(
      'contactNumber',
      contactNumber,
      undefined,
      contactNumber && ownerPhone && String(contactNumber) === String(ownerPhone)
        ? ['· same as ownerPhone']
        : [],
    ),
  ]));

  /* 3 — Operations. */
  sections.push(renderSection(3, 'OPERATIONS', [
    field('openingHours', pick(r, 'openingHours', 'hours', 'timings'), describeHours(r.openingHours || root.openingHours)),
    field('openState', pick(r, 'openState')),
    field('avgPreparationTime', pick(r, 'avgPreparationTime', 'prepTime'), minutes(pick(r, 'avgPreparationTime', 'prepTime'))),
    field('deliveryRadiusKm', pick(r, 'deliveryRadiusKm', 'radiusKm'), (() => {
      const km = Number(pick(r, 'deliveryRadiusKm', 'radiusKm'));
      return Number.isFinite(km) ? `${km} km` : EMPTY;
    })()),
    field('minOrderValue', pick(r, 'minOrderValue'), rupees(pick(r, 'minOrderValue'))),
    field('packagingCharge', pick(r, 'packagingCharge'), rupees(pick(r, 'packagingCharge'))),
    field('deliveryFee', deliveryFee, describeDeliveryFee(deliveryFee)),
    field('acceptsOnlinePayment', r.acceptsOnlinePayment ?? root.acceptsOnlinePayment),
    field('acceptsCod', r.acceptsCod ?? root.acceptsCod),
  ]));

  /* 4 — Documents & legal. */
  const documents = r.verificationDocuments || root.verificationDocuments || root.documents;
  sections.push(renderSection(4, 'DOCUMENTS & LEGAL', [
    field('fssaiLicenseNumber', pick(r, 'fssaiLicenseNumber', 'fssai')),
    field('fssaiExpiry', pick(r, 'fssaiExpiry')),
    field('gstNumber', pick(r, 'gstNumber', 'gst')),
    field('gstExempt', r.gstExempt ?? root.gstExempt),
    field('panNumber', pick(r, 'panNumber', 'pan')),
    field('verificationDocuments', documents, describeDocuments(documents)),
  ]));

  /* 5 — Payout. The account number is the reason this section is drawn with
     a redactor rather than the generic describe(). */
  sections.push(renderSection(5, 'PAYOUT', [
    field('accountHolderName', pick(payout, 'accountHolderName', 'holderName')),
    field(
      'bankAccountNumber',
      pick(payout, 'bankAccountNumber', 'accountNumber'),
      accountEnding(pick(payout, 'bankAccountNumber', 'accountNumber')),
      pick(payout, 'bankAccountNumber', 'accountNumber')
        ? ['· never printed in full — this console gets screen-shared']
        : [],
    ),
    field('ifscCode', pick(payout, 'ifscCode', 'ifsc')),
    field('accountType', pick(payout, 'accountType')),
    field('upiId', pick(payout, 'upiId', 'upi')),
  ]));

  /* 6 — Menu. */
  const menu = menuSection(6, products);
  sections.push(menu);

  /* 7 — Contract. */
  sections.push(renderSection(7, 'CONTRACT', [
    field('accepted', contract.accepted),
    field('signature', contract.signature),
    field('acceptedAt', contract.acceptedAt),
    field('commission', contract.commission, Number.isFinite(Number(contract.commission)) ? `${Number(contract.commission)}%` : EMPTY),
    field('platformFee', contract.platformFee, rupees(contract.platformFee)),
    /* Printed beside the agreement it is not part of. An application that
       reaches the queue with this false was filled in by something that is
       not the Onboard console, and the reviewer should see that. */
    field('refundPolicyAccepted', contract.refundPolicyAccepted),
  ]));

  /* The menu's tally counts items rather than fields, so it is left out of
     the grand total instead of being folded into a number that would then
     mean two different things. */
  const counted = sections.filter((section) => section !== menu);
  const filled = counted.reduce((sum, section) => sum + section.filled, 0);
  const total = counted.reduce((sum, section) => sum + section.total, 0);
  const itemCount = Array.isArray(products) ? products.length : 0;

  const lines = [
    boxTop(`FOOD-PARTNER APPLICATION · ${now()} · ${restaurantName}`),
    ...sections.flatMap((section) => section.lines),
    boxBottom(`filled ${filled} of ${total} · ${itemCount} menu item${itemCount === 1 ? '' : 's'} · ${client} @ ${caller}`),
  ];

  block(lines);
});

/* ══════════════════════════════════════════════════════════════════════════
   3. The outcome of an application
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * What was actually written, where, and how long it took.
 *
 * The collection names are printed literally rather than implied. Three apps
 * share one database and this module deliberately prefixes its collections to
 * avoid the taken `products` and `partners`; seeing `food_restaurants` and
 * `food_products` in the console is how somebody confirms the write landed
 * where the model file says it should, without opening a database client.
 */
const logApplicationSaved = safely((info = {}) => {
  const restaurantId = info.restaurantId || info.id || '(no id)';
  const name = info.restaurantName || info.name || '';
  const products = Number.isFinite(Number(info.productCount))
    ? Number(info.productCount)
    : (Array.isArray(info.products) ? info.products.length : 0);
  const took = durationText(info);

  say(
    '✅',
    'SAVED',
    restaurantId,
    name ? `"${flatten(name)}"` : '',
    '→ food_restaurants (1 doc)',
    `+ food_products (${products} doc${products === 1 ? '' : 's'})`,
    took ? `· ${took}` : '',
    info.verificationStatus ? `· status ${info.verificationStatus}` : '· status pending (nothing is listed until it is approved)',
  );
});

/**
 * A refused application, and the precise reason.
 *
 * `reason` may be a string or the error object the controller was about to
 * send; either way the code and the field that caused it are printed, because
 * "which field" is the whole of what the support conversation that follows is
 * about.
 */
const logRejected = safely((reason, details = {}) => {
  const info = (reason && typeof reason === 'object') ? { ...reason, ...details } : details;
  const message = (reason && typeof reason === 'object')
    ? (reason.message || reason.reason || 'refused')
    : String(reason || 'refused');

  say(
    '🚫',
    'REJECTED',
    info.code ? `${info.code} ·` : '·',
    flatten(message),
    info.field ? `· field ${info.field}` : '',
    info.ownerPhone ? `· phone ${info.ownerPhone}` : '',
    info.ownerEmail ? `· email ${info.ownerEmail}` : '',
    info.restaurantId ? `· ${info.restaurantId}` : '',
    Number.isFinite(Number(info.status)) ? `· HTTP ${info.status}` : '',
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   4. The session routes
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * A sign-in attempt, successful or not.
 *
 * The identifier — an email or a phone number — is printed, because a login
 * line that does not say who tried is worth nothing when somebody reports
 * that they cannot get in. The password never is, in either outcome: a failed
 * attempt is exactly where a mistyped password is most likely to be a real
 * password with one character wrong.
 */
const logLogin = safely((info = {}) => {
  const ok = info.ok !== false && !info.reason;
  const identifier = info.identifier || info.email || info.phone || 'unknown identifier';

  if (ok) {
    say(
      '🔑',
      'LOGIN ok ·',
      flatten(identifier),
      info.restaurantId ? `→ ${info.restaurantId}` : '',
      info.restaurantName ? `"${flatten(info.restaurantName)}"` : '',
      info.verificationStatus ? `· ${info.verificationStatus}` : '',
    );
    return;
  }

  say(
    '🔑',
    'LOGIN REFUSED ·',
    flatten(identifier),
    `· ${flatten(info.reason || info.message || 'no reason given')}`,
    info.code ? `· ${info.code}` : '',
  );
});

/**
 * A change to where this restaurant's money goes.
 *
 * ## Why this logger exists at all
 *
 * An owner can add a bank account and make it active from their own session
 * — see the section header in `restaurantAdmin.controller.js`. That was a
 * deliberate decision and it removed a protection: anybody holding the
 * session can repoint the settlements. This line is what stands in its
 * place. It is not a gate; it is the answer to "when did that change, and to
 * what", asked a fortnight later by somebody reconciling a bank statement.
 *
 * So it prints on EVERY add, switch and removal, including the ones that
 * look routine. A log that only recorded suspicious changes would require
 * knowing in advance which those were.
 *
 * ## Four digits, never the number
 *
 * `accountLast4` and the IFSC are enough to identify an account to somebody
 * who already holds it and useless to somebody who does not. The full number
 * is `select: false` on the model and is not passed here — see the note on
 * `payout.bankAccountNumber` in `foodRestaurant.model.js`, which records that
 * a backend console is frequently screen-shared.
 */
const logPayoutChange = safely((info = {}) => {
  const action = String(info.action || 'changed').toUpperCase();

  say(
    '🏦',
    `PAYOUT ${action}`,
    info.restaurantId ? `· ${info.restaurantId}` : '',
    info.restaurantName ? `"${flatten(info.restaurantName)}"` : '',
    info.accountLast4 ? `· ending ${info.accountLast4}` : '',
    info.ifscCode ? `· ${flatten(info.ifscCode)}` : '',
    /* Named on a switch, because "changed to X" without "from Y" is half of
       what anybody tracing a misdirected settlement needs. */
    info.previousLast4 ? `· was ending ${info.previousLast4}` : '',
    info.isActive === undefined ? '' : `· ${info.isActive ? 'ACTIVE — settlements go here' : 'saved, not active'}`,
    info.note ? `· ${flatten(info.note)}` : '',
  );
});

/**
 * A create, update or delete on a menu item.
 *
 * `changes` is run through the redactor rather than printed raw: it is a
 * free-form object built by the controller, and a logger that trusts the
 * shape of its input is one refactor away from printing something it should
 * not.
 */
const logMenuChange = safely((info = {}) => {
  const action = String(info.action || 'changed').toUpperCase();
  const price = info.price !== undefined ? rupees(info.price) : '';

  const changes = info.changes && typeof info.changes === 'object'
    ? Object.entries(redactValue(info.changes))
      .map(([key, value]) => `${key}=${describe(value)}`)
      .join(', ')
    : '';

  say(
    '🍲',
    `MENU ${action}`,
    info.restaurantId ? `· ${info.restaurantId}` : '',
    info.productId ? `· ${info.productId}` : '',
    info.productName ? `"${flatten(info.productName)}"` : '',
    info.category ? `· ${flatten(info.category)}` : '',
    price ? `· ${price}` : '',
    info.isAvailable === undefined ? '' : `· ${info.isAvailable ? 'available' : 'unavailable'}`,
    changes ? `· changed: ${clip(changes, 200)}` : '',
  );
});

/**
 * The manual open/closed override.
 *
 * Both the stored state and what it works out to right now are printed. They
 * are different things — `auto` means the opening hours decide — and a
 * partner ringing to say "the app says we are shut" is answered by seeing the
 * two side by side.
 */
const logAvailability = safely((info = {}) => {
  const to = info.to || info.openState || 'auto';
  const effective = info.effective === undefined ? null : Boolean(info.effective);

  say(
    effective === false ? '🔴' : '🟢',
    'AVAILABILITY',
    info.restaurantId ? `· ${info.restaurantId}` : '',
    info.restaurantName ? `"${flatten(info.restaurantName)}"` : '',
    info.from ? `· openState ${info.from} → ${to}` : `· openState ${to}`,
    effective === null
      ? ''
      : `· now ${effective ? 'OPEN' : 'CLOSED'} (${to === 'auto' ? 'by the schedule' : 'manual override beats the schedule'})`,
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   5. The public screens
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * A read from one of the three consumer screens.
 *
 * The filters are printed with the result count because that pair is the
 * whole diagnosis of "the listing is empty": either the query was narrower
 * than the person thought, or it was not and the data is the problem.
 */
const logDiscovery = safely((info = {}) => {
  const filters = Object.entries(info.filters || {})
    .filter(([, value]) => value !== undefined && value !== null && value !== ''
      && !(Array.isArray(value) && value.length === 0))
    .map(([key, value]) => `${key}=${describe(value)}`)
    .join(' · ');

  const count = Number.isFinite(Number(info.count)) ? Number(info.count) : null;
  const took = durationText(info);

  say(
    '🔍',
    'DISCOVERY ·',
    flatten(info.route || 'restaurants'),
    filters ? `· ${clip(filters, 160)}` : '· no filters',
    count === null ? '' : `→ ${count}${Number.isFinite(Number(info.total)) ? ` of ${info.total}` : ''}`,
    took ? `(${took})` : '',
  );
});

/**
 * Images that reached Cloudinary.
 *
 * The folder is printed in full: every food partner's assets are foldered
 * under their own id, and confirming that from the console is what stops a
 * support request about one restaurant's photographs turning into a trawl of
 * a shared bucket.
 */
const logUpload = safely((info = {}) => {
  const count = Number.isFinite(Number(info.count))
    ? Number(info.count)
    : (Array.isArray(info.uploaded) ? info.uploaded.length : 0);
  const took = durationText(info);
  const bytes = Number.isFinite(Number(info.bytes)) ? humanBytes(Number(info.bytes)) : '';

  say(
    '☁️',
    'UPLOAD ·',
    `${count} image${count === 1 ? '' : 's'}`,
    info.mode ? `· ${info.mode}` : '',
    bytes ? `· ${bytes}` : '',
    info.folder ? `→ ${info.folder}` : '',
    /* The folder is `lampose/food-partners/<id>`, so the id is usually
       already on the line. Printed separately only when it is not. */
    info.restaurantId && !String(info.folder || '').includes(info.restaurantId)
      ? `· ${info.restaurantId}`
      : '',
    took ? `(${took})` : '',
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   6. Degradation and failure

   Nothing in this process exits when a dependency is missing; the affected
   routes answer a named 503 and everything else carries on. That rule is only
   half kept if the 503 is silent — the console is where "why is the app
   getting 503 on uploads" is answered — so a refusal says which dependency,
   which code the client received, and which route it was on.
   ══════════════════════════════════════════════════════════════════════════ */

const logDependencyMissing = safely((info = {}) => {
  say(
    '⚠️',
    'DEGRADED ·',
    `${info.dependency || 'a dependency'} is not configured`,
    info.code ? `· answering 503 ${info.code}` : '· answering 503',
    info.route ? `on ${info.route}` : '',
    info.hint ? `· ${info.hint}` : '',
  );
});

const logError = safely((what, error) => {
  console.error(
    `${PREFIX} ❌ ${flatten(String(what || 'error'))}:`,
    (error && error.message) || error,
  );
});

module.exports = {
  /* The middleware, first on the router. */
  tagFoodPartnerRequest,

  /* Applications. */
  logApplicationSteps,
  logApplicationSaved,
  logRejected,

  /* Sessions and menus. */
  logLogin,
  logMenuChange,
  logAvailability,

  /* Where the money goes. Its own line because the change it records is not
     reversible by the person who notices it was wrong. */
  logPayoutChange,

  /* Public reads and assets. */
  logDiscovery,
  logUpload,

  /* Named 503s and unexpected failures. */
  logDependencyMissing,
  logError,

  /* Timing, for a real duration rather than a guess. */
  startTimer,

  /* Exported for anything else in this module that needs to print in the
     same voice — the badge is the grep string and must not be retyped. */
  BADGE,
  PREFIX,
};
