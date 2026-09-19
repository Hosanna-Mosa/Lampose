/* ══════════════════════════════════════════════════════════════════════════
   The Express application.

   Split out of server.js so the scripts under scripts/ can boot the real app
   on an ephemeral port and exercise it, rather than testing a second
   almost-identical stack.

   This is a FACTORY, not a ready-made app. It is called once by server.js,
   which hands in the CORS middleware it built from its own allowlist.

   Why CORS is injected rather than configured here: the allowlist is the one
   piece of this stack that gets edited under pressure, in production, by
   whoever is on call — so it lives at the top of server.js where it can be
   found without reading the codebase. Middleware order is what forces the
   injection: CORS has to be installed BEFORE the routes are registered, and
   the routes are registered in this file, so the middleware has to arrive as
   an argument. There is no `app.use(cors)` you can add in server.js after
   `require('./app')` that would run early enough.

   Middleware order here is deliberate, top to bottom:

     1. requestLogger   first, so nothing is invisible — a preflight, a
                        blocked origin and a 404 are all logged. The arrival
                        line prints immediately; the departure line prints on
                        `finish`, by which time the body parsers have run, so
                        it still shows the payload.
     2. cors            before any handler, so a rejected origin never reaches
                        one and preflights are answered here.
     3. body parsers    25mb, because the onboarding app posts base64 images.
     4. routes          v1, v2, then the unversioned aliases.
     5. notFound/error  last, so every failure is JSON rather than Express's
                        HTML error page.
   ══════════════════════════════════════════════════════════════════════════ */
const express = require('express');

const config = require('./src/config/env');
const helmet = require('helmet');
const requestLogger = require('./src/shared/middleware/requestLogger');
const { registerRoutes, routeMap } = require('./routes');
const { notFoundHandler, errorHandler } = require('./src/shared/middleware/errorHandler');

/**
 * Build the Express application.
 *
 * @param {object}   options
 * @param {Function} options.corsMiddleware The `cors(...)` middleware, built
 *   by server.js from the allowlist at the top of that file. Omitting it
 *   builds an app with NO CORS headers at all — correct for a script driving
 *   the app over an in-process socket, wrong for anything a browser calls.
 */
const createApp = ({ corsMiddleware } = {}) => {
  const app = express();

  /* Behind Nginx/Render/Railway the socket address is the proxy's. Without
     this, req.ip is useless in logs and req.protocol is always http. */
  if (config.trustProxy) app.set('trust proxy', 1);

  // Express advertises itself in a header by default; nothing needs to know.
  app.disable('x-powered-by');

  app.use(requestLogger);

  /*
   * ══════════════════════════════════════════════════════════════════════
   * Response headers, chosen ONE AT A TIME rather than taken as a default.
   * ══════════════════════════════════════════════════════════════════════
   *
   * After the logger and before CORS: these are plain response headers and do
   * not touch the preflight, but a request that is about to be refused should
   * still be logged first — the same reason `requestLogger` leads.
   *
   * Three of helmet's defaults are OFF, and each would break something real:
   *
   *   contentSecurityPolicy   defaults to `default-src 'self'`, and this API
   *                           serves the two Razorpay checkout pages
   *                           (`renderCheckout` in foodPayment and
   *                           visitPayment). They load checkout.razorpay.com
   *                           and run inline script. A default CSP blocks both
   *                           and every online payment stops — silently, in a
   *                           WebView with no console anybody is watching.
   *
   *   crossOriginEmbedderPolicy  requires every third-party resource to opt in
   *                           with CORP headers. Razorpay's do not. Same
   *                           outcome as above.
   *
   *   crossOriginResourcePolicy  defaults to `same-origin`. CORS governs the
   *                           fetches the four web consoles make, but this
   *                           header has its own say over cross-origin loads
   *                           and there is nothing to gain here by guessing
   *                           which wins — CORS is already the control, and it
   *                           is an allowlist.
   *
   * What stays on is the part that costs nothing: `X-Content-Type-Options:
   * nosniff`, `X-Frame-Options: SAMEORIGIN` (helmet's default, and the right
   * one here — DENY would forbid the checkout page framing anything of ours),
   * `Referrer-Policy: no-referrer`, and no `X-Powered-By`.
   */
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false,

    /*
     * HSTS, in production only.
     *
     * The header tells a browser never to speak plain HTTP to this host again,
     * which is exactly right for api.lampose.com and exactly wrong for a
     * laptop: a developer who once loaded http://localhost:5001 would have
     * that pinned for the max-age, and every http:// project on localhost
     * afterwards would be force-upgraded to a port serving no TLS. `preload`
     * is deliberately not set — that is a submission to a browser-vendor list
     * and is close to irreversible.
     */
    hsts: config.isProduction
      ? { maxAge: 15552000, includeSubDomains: true, preload: false }
      : false,
  }));

  if (corsMiddleware) {
    app.use(corsMiddleware);

    /* Terminate a REFUSED preflight.

       The cors package only ends an OPTIONS request when the origin was
       allowed: look at its middleware wrapper, and a refused origin takes the
       `if (err2 || !origin) next(err2)` branch, which skips the header/end
       logic entirely and passes the request on. So without this, a blocked
       preflight travels into the router and gets answered by whatever route
       or 404 handler it lands on — the browser still blocks it (no
       Access-Control-Allow-Origin was set), but the server log shows a
       cheerful 🟢 200 for a request that was actually rejected, and a second
       cors middleware here would re-run the origin check and print the
       "blocked" warning twice.

       An allowed preflight has already been ended above, and a request with
       no Origin header counts as allowed. So any OPTIONS still travelling at
       this point is one CORS declined, and 403 is the honest answer. */
    app.use((req, res, next) => {
      if (req.method === 'OPTIONS') return res.status(403).end();
      return next();
    });
  }

  /*
   * The raw body is kept for the routes that verify a signature over it.
   *
   * Razorpay's webhook HMAC covers the bytes exactly as they arrived, so
   * re-serialising the parsed object reorders keys, changes the bytes and the
   * signature never matches. `verify` runs before parsing and is the only
   * place those bytes still exist.
   *
   * Stored on the request rather than globally — nothing else needs it, and a
   * buffer per request is worth paying only where it is checked.
   */
  app.use(express.json({
    limit: config.bodyLimit,
    verify: (req, _res, buf) => {
      if (req.originalUrl && req.originalUrl.includes('/payments/razorpay/webhook')) {
        req.rawBody = Buffer.from(buf);
      }
    },
  }));
  app.use(express.urlencoded({ extended: true, limit: config.bodyLimit }));

  app.get(['/', '/api'], (req, res) => {
    res.json({
      message: 'Lampose Main Backend API',
      status: 'running',
      environment: config.nodeEnv,
      versions: ['v1', 'v2'],
      routes: routeMap(),
    });
  });

  registerRoutes(app);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

module.exports = createApp;
module.exports.createApp = createApp;
