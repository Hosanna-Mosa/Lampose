/* ══════════════════════════════════════════════════════════════════════════
   Two lines in the console for every API call this backend receives: one
   when the request arrives, one when the response leaves.

   It used to print a single line on `finish`. That is enough to audit a call
   that completed and useless for the case you actually reach for a log —
   a request that hangs, crashes the process, or never reaches a handler at
   all prints nothing, so the console looks identical to "the client never
   called us". The arrival line is what tells those two apart.

   The pair is joined by a short id, shown as `#a1b2`. Concurrent calls
   interleave — a mobile app opening the feed fires the listings query and a
   health check within the same millisecond — and without the id the two
   halves of each pair cannot be matched by eye. The id is taken from the
   caller's X-Request-Id when it sends one, so the same id can be grepped in
   the app's own console and in this one.

   Mounted as the very first middleware — before CORS — so nothing is
   invisible: a blocked origin, a preflight the browser sends on its own, and
   a 404 for a path that matches no route all get logged like anything else.
   The arrival line is printed from the middleware body, which runs BEFORE the
   body parsers, so the request payload is shown on the departure line where
   it has actually been parsed.

   Secrets are redacted rather than trimmed to a whitelist: a body field named
   password, token or secret is replaced and everything else is shown, which
   is what makes the log useful when a payload is the thing that is wrong.
   The same redaction runs over the response, because a login reply carries a
   token and this console is frequently screen-shared.
   ══════════════════════════════════════════════════════════════════════════ */
const config = require('../../config/env');

const SECRET_KEY = /pass(word)?|token|secret|authorization|admincode|adminsecretkey|apikey|api_key|otp|hash|salt/i;

/* A base64 data URI for a 15MB photo would otherwise fill the terminal with
   one request. Only its size is interesting. */
const DATA_URI = /^data:([\w/+.-]+);base64,/i;

const humanBytes = (bytes) => {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${bytes}B`;
};

const redact = (value, depth = 0) => {
  if (typeof value === 'string') {
    const match = value.match(DATA_URI);
    if (match) return `<${match[1]}, ${humanBytes(Math.round((value.length * 3) / 4))} base64>`;
    return value.length > 300 ? `${value.slice(0, 300)}…(${value.length} chars)` : value;
  }
  if (depth > 2 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    const head = value.slice(0, 10).map((v) => redact(v, depth + 1));
    return value.length > 10 ? [...head, `…+${value.length - 10} more`] : head;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, val]) => [
      key,
      SECRET_KEY.test(key) ? '***REDACTED***' : redact(val, depth + 1),
    ]),
  );
};

const summarise = (value, max = config.log.maxBodyChars) => {
  if (!value || typeof value !== 'object' || Object.keys(value).length === 0) return '';
  let json;
  try {
    json = JSON.stringify(redact(value));
  } catch {
    return '<unserialisable>';
  }
  return json.length > max ? `${json.slice(0, max)}…` : json;
};

/* Which half of the API answered, so a wrong-version call is obvious in the
   log rather than something you work out from the payload. */
const apiVersionOf = (url) => {
  const path = String(url || '').split('?')[0];
  if (/^\/api\/v1(\/|$)/.test(path)) return 'v1';
  if (/^\/api\/v2(\/|$)/.test(path)) return 'v2';
  if (/^\/(api\/)?(properties|admin|verifications|whatsapp|permissions)(\/|$)/.test(path)) return 'v1*';
  if (/^\/(api\/)?(listings|auth|users|scraper|visit-requests)(\/|$)/.test(path)) return 'v2*';
  return '—';
};

const badgeFor = (statusCode) => {
  if (statusCode >= 500) return '🔴';
  if (statusCode >= 400) return '🟡';
  if (statusCode >= 300) return '🔵';
  return '🟢';
};

/** Who called, in the form that is actually useful: the browser origin if
 *  there is one, the client IP otherwise. */
const callerOf = (req) => {
  const origin = req.headers.origin || req.headers.referer;
  if (origin) return String(origin).replace(/\/+$/, '');
  return req.ip || req.socket?.remoteAddress || 'unknown';
};

/**
 * Which application called.
 *
 * A React Native app sends no Origin header — there is no browser and no
 * document, so `callerOf` can only ever report an IP for it. Every Lampose
 * client therefore identifies itself in X-Client, and that is what makes a
 * line readable when the phone, the leads panel and a health probe are all
 * on the same LAN behind one address.
 */
const clientOf = (req) => {
  const name = req.headers['x-client'];
  if (!name) return null;
  const version = req.headers['x-client-version'];
  return version ? `${name}/${version}` : String(name);
};

/* Short, stable within a request, and long enough that two calls in the same
   second do not collide. Not a UUID: this is read by a human matching two
   adjacent console lines, not stored. */
const shortId = () => Math.random().toString(16).slice(2, 6);

const idOf = (req) => {
  const given = req.headers['x-request-id'];
  if (!given) return shortId();
  // Someone else's id is trusted only as far as being printed — the tail is
  // what stays legible in a fixed-width column.
  return String(given).replace(/[^\w-]/g, '').slice(-8) || shortId();
};

const requestLogger = (req, res, next) => {
  if (!config.log.enabled) return next();

  const startedAt = process.hrtime.bigint();
  const id = idOf(req);
  const version = apiVersionOf(req.originalUrl);
  const label = `[${version}] #${id}`;

  /* ── The request, as it arrives ─────────────────────────────────────────
     Printed synchronously rather than on `finish`, so a handler that hangs
     or throws out of process still leaves evidence that the call was made.
     `req.body` is deliberately absent here: the body parsers run after this
     middleware, so it would print `{}` for every POST. It is on the
     response line instead, where it has been parsed. */
  const arrivalParts = [
    `🌐 → [${new Date().toLocaleTimeString()}] ${label}`,
    `${req.method} ${req.originalUrl}`,
    `| from ${callerOf(req)}`,
  ];

  const client = clientOf(req);
  if (client) arrivalParts.push(`| client ${client}`);

  console.log(arrivalParts.join(' '));

  /* ── The response ───────────────────────────────────────────────────────
     Captured by wrapping res.json, which is what every handler and both
     error middlewares in this codebase use. A handler that reached for
     res.send or streamed a file logs its status and duration with no body,
     which is the honest outcome rather than a fabricated one. */
  let payload;
  if (config.log.responses) {
    const json = res.json.bind(res);
    res.json = (body) => {
      payload = body;
      return json(body);
    };
  }

  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const { statusCode } = res;

    const parts = [
      `🌐 ← [${new Date().toLocaleTimeString()}] ${label} ${badgeFor(statusCode)}`,
      `${req.method} ${req.originalUrl}`,
      `→ ${statusCode}`,
      `(${ms.toFixed(0)}ms)`,
    ];

    const query = summarise(req.query);
    if (query) parts.push(`| query: ${query}`);

    if (config.log.bodies) {
      const body = summarise(req.body);
      if (body) parts.push(`| req: ${body}`);
    }

    /* An employee-identified write is gated by an administrator's approval,
       so who sent it belongs on the same line as the verdict. */
    const employee = req.headers['x-employee-email'] || req.headers['x-user-email'];
    if (employee) parts.push(`| employee: ${employee}`);

    if (config.log.responses) {
      /* A listings response is an array of whole documents and would bury
         every other line on the screen. The count is the fact worth having
         at a glance — "the app asked and got 6 back" — and the payload is
         then trimmed to the same ceiling as a request body. */
      if (payload && typeof payload === 'object') {
        const rows = Array.isArray(payload) ? payload
          : Array.isArray(payload.data) ? payload.data
            : null;
        if (rows) parts.push(`| ${rows.length} item${rows.length === 1 ? '' : 's'}`);
      }

      const out = summarise(payload, config.log.maxResponseChars);
      if (out) parts.push(`| res: ${out}`);
    }

    console.log(parts.join(' '));
  });

  return next();
};

module.exports = requestLogger;
module.exports.requestLogger = requestLogger;
module.exports.redact = redact;
