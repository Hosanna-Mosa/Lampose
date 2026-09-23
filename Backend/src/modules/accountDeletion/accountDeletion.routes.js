/* ══════════════════════════════════════════════════════════════════════════
   Account deletion — the routes. See `accountDeletion.controller.js`.

   PUBLIC  /api/v2/account-deletion
             GET  /policy                  every app, for the page's picker
             GET  /:app/policy             one app's numbers
             POST /:app/start              a number in, a code out by SMS
             POST /:app/confirm            the code back, the account marked
           `:app` is customer | partner | restaurant | driver.

   IN APP  makeInAppDeletionRouter(), mounted by each app's own router at
           `/me/account-deletion` behind that app's own guard.

   ## Every public route costs money

   `start` sends an SMS we pay for and rings a real handset, so it carries the
   same two ceilings the sign-in routes do: by IP (one script working through
   a list) and by phone (many addresses hammering ONE number — SMS bombing,
   whose victim is the person whose phone rings). They are tighter than
   sign-in's: somebody signs in most days, and nobody deletes their account
   twice a week. `confirm` is the guessing surface; the per-code attempt
   counter in the controller is what stops a brute force, and this ceiling
   catches somebody cycling fresh codes to reset it.

   Limiters are built PER APP, so a person deleting their diner account and
   their rider account on the same number is not throttled by the first.
   ══════════════════════════════════════════════════════════════════════════ */
const express = require('express');

const { rateLimit } = require('../../shared/middleware/rateLimit');
const { requireLamposeDb } = require('../../shared/middleware/requireDb');
const { AUDIENCES, ALIASES } = require('./accountDeletion.audiences');
const { allPolicies, makePublicHandlers, makeInAppHandlers } = require('./accountDeletion.controller');

const HOUR = 60 * 60 * 1000;
const QUARTER = 15 * 60 * 1000;

const phoneOf = (req) => String((req.body && req.body.phone) || '').replace(/\D/g, '').slice(-10);
const byIp = (name, windowMs, max) => rateLimit({ name, windowMs, max });
const byPhone = (name, windowMs, max) => rateLimit({ name, windowMs, max, keyOf: phoneOf });

/**
 * The three public routes for one app, on `router` at `prefix`.
 *
 * Exported so `/api/v2/drivers/account/deletion/*` — the rider page's
 * original address — keeps answering with the same handlers rather than a
 * second implementation.
 */
const mountPublicDeletion = (router, audience, prefix = '') => {
  const { policy, start, confirm } = makePublicHandlers(audience);
  const tag = `acct-del-${audience.key}`;

  router.get(`${prefix}/policy`, byIp(`${tag}-policy-ip`, HOUR, 120), policy);
  router.post(
    `${prefix}/start`,
    byIp(`${tag}-start-ip`, HOUR, 10),
    byPhone(`${tag}-start-phone`, HOUR, 3),
    requireLamposeDb,
    start,
  );
  router.post(
    `${prefix}/confirm`,
    byIp(`${tag}-confirm-ip`, QUARTER, 30),
    byPhone(`${tag}-confirm-phone`, QUARTER, 10),
    requireLamposeDb,
    confirm,
  );
};

const router = express.Router();

router.get('/policy', byIp('acct-del-policies-ip', HOUR, 120), allPolicies);

for (const audience of Object.values(AUDIENCES)) {
  mountPublicDeletion(router, audience, `/${audience.key}`);
}
/* The friendlier spellings (`rider`, `food-partner`, …) the page accepts in
   its query string, so a hand-written link still lands on the right app. */
for (const [alias, key] of Object.entries(ALIASES)) {
  mountPublicDeletion(router, AUDIENCES[key], `/${alias}`);
}

/* An app nobody registered is a 404 with a sentence, not Express's HTML. */
router.use('/:app', (req, res) => res.status(404).json({
  success: false,
  code: 'UNKNOWN_APP',
  message: `There is no Lampose app called "${req.params.app}". Use one of: ${Object.keys(AUDIENCES).join(', ')}.`,
}));

/**
 * The signed-in routes for one app: GET status · POST request · DELETE cancel.
 *
 * `guards` is that app's own session chain and `reqKey` is where it leaves the
 * account. Nothing here authenticates on its own — mounted without a guard it
 * would read `undefined` and fail, which is the direction to fail in.
 */
const makeInAppDeletionRouter = (audienceKey, reqKey, guards) => {
  const audience = AUDIENCES[audienceKey];
  if (!audience) throw new Error(`accountDeletion: unknown audience "${audienceKey}"`);
  const { status, request, cancel } = makeInAppHandlers(audience, reqKey);

  const inApp = express.Router();
  inApp.use(guards);
  inApp.get('/', status);
  inApp.post('/', byIp(`acct-del-${audienceKey}-app-ip`, HOUR, 20), request);
  inApp.delete('/', cancel);
  return inApp;
};

module.exports = router;
module.exports.mountPublicDeletion = mountPublicDeletion;
module.exports.makeInAppDeletionRouter = makeInAppDeletionRouter;
