/* ══════════════════════════════════════════════════════════════════════════
   Support, as each of the three apps reaches it.

   One controller, three routers, three guards — and that shape is the whole
   point of this file.

     /api/v2/support                 requireCustomer           the diner
     /api/v2/drivers/support         requireDriverForSupport   the rider
     /api/v2/food-partners/support   requireFoodPartner        the kitchen

   The rider's is the one that is not the module's ordinary guard, and the
   note on it below says why: `requireDriver` refuses a suspended rider with a
   message telling them to contact support, and support is this.

   ## Why three routers and not one with a clever guard

   The obvious alternative is a single `/api/v2/support` behind a middleware
   that reads the token's `typ` and loads whichever of three collections it
   names. It is fewer lines and it is the wrong thing: this codebase's standing
   rule is that no guard is ever widened to understand another audience, each
   asserts its own claim, and a poly-guard is that widening by definition. The
   failure it prevents is specific — one bug in the branch that picks a
   collection, and a driver token reads a student's deposit dispute.

   So each router gets the guard that already exists for its audience, written
   by the people who own that identity, and none of them learns a second one.
   What is shared is the part with no authority in it: the handlers.

   ## `attachRequester` is the seam

   Each guard leaves its own record on the request under its own name —
   `req.customer`, `req.driver`, `req.foodPartner`. The controller cannot know
   which, so one tiny middleware per router copies the three fields it needs
   into `req.support`. It reads no token and makes no decision; by the time it
   runs, the guard above it has already refused everybody it was going to
   refuse.

   ## The limits are per account, and generous

   Counted per requester rather than per IP: a hostel behind one wifi router
   shares an address, and one student complaining must not use up everybody
   else's allowance. The ceilings are deliberately high — somebody whose payout
   has not arrived may well file three things in ten minutes, and rate-limiting
   a person in that position out of the queue is a worse outcome than the spam
   the ceiling exists to stop.
   ══════════════════════════════════════════════════════════════════════════ */
const express = require('express');

const {
  listTickets,
  getTicket,
  createTicket,
  createReport,
  replyToTicket,
  markTicketRead,
  getCategories,
} = require('./ticket.controller');
const { requireLamposeDb } = require('../../shared/middleware/requireDb');
const { rateLimit } = require('../../shared/middleware/rateLimit');
const { audienceOf } = require('./support.audiences');

/**
 * Copy whichever identity the guard produced into one agreed place.
 *
 * `pick` is given per audience rather than inferred, because the three records
 * do not agree on field names — a diner has `customerId`/`name`, a rider has
 * `driverId`/`name`, a restaurant has `restaurantId`/`ownerName`/`ownerPhone`.
 * Guessing across them with `||` chains is how a restaurant's ticket ends up
 * filed under an empty id.
 */
const attachRequester = (kind, pick) => (req, res, next) => {
  const who = pick(req);

  /* Belt and braces: the guard above cannot have let an unidentified request
     through, and if it somehow did, a ticket with no owner is worse than a
     500 — it is a thread nobody can ever read back. */
  if (!who || !who.id) {
    return res.status(401).json({
      success: false,
      code: 'UNAUTHORIZED',
      message: 'Please sign in again.',
    });
  }

  req.support = { kind, id: String(who.id), name: who.name || '', phone: who.phone || '' };
  return next();
};

/**
 * Build one audience's support router.
 *
 * `guard` is that audience's OWN middleware, passed in by the caller so this
 * file never requires three auth modules and never has to choose between them.
 */
const makeSupportRouter = ({ kind, guard, pick }) => {
  const audience = audienceOf(kind);
  if (!audience) throw new Error(`No support audience called "${kind}".`);

  const router = express.Router();

  const keyOf = (req) => (req.support ? `${kind}:${req.support.id}` : req.ip);

  const createLimit = rateLimit({
    name: `support-create-${kind}`, windowMs: 60 * 60 * 1000, max: 10, keyOf,
  });
  const replyLimit = rateLimit({
    name: `support-reply-${kind}`, windowMs: 15 * 60 * 1000, max: 30, keyOf,
  });

  /* Order matters and is the same on every route: the database has to be
     there, the audience's own guard has to pass, and only then is there a
     requester to count a rate limit against. An anonymous flood is refused by
     the 401 before it reaches a counter, which is the cheaper refusal. */
  router.use(requireLamposeDb, guard, attachRequester(kind, pick));

  /*
   * What this audience may file about.
   *
   * Served rather than hardcoded in each app so the three category lists have
   * ONE definition. An app shipping a category the server rejects shows
   * somebody "please choose what this is about" for a choice they just made,
   * and that drift is invisible until a real person hits it.
   */
  router.get('/categories', getCategories);

  router.get('/tickets', listTickets);
  router.get('/tickets/:reference', getTicket);

  router.post('/tickets', createLimit, createTicket);
  router.post('/tickets/:reference/messages', replyLimit, replyToTicket);
  router.post('/tickets/:reference/read', markTicketRead);

  /*
   * Safety reports — the diner's alone.
   *
   * Mounted for every audience even so, because the handler's refusal is a
   * clear 403 with a sentence, and a 404 from an unmounted route is a rider
   * app that looks broken rather than one that has been told this is not its
   * process. See `support.audiences.js` for why the rider and the kitchen do
   * not get this form.
   */
  router.post('/reports', createLimit, createReport);

  return router;
};

/* ------------------------------------------------------------------ *
 * The three, built.
 * ------------------------------------------------------------------ */

const { requireCustomer } = require('../customers/customerAuth.middleware');
const { requireDriverForSupport } = require('../drivers/driverAuth.middleware');
const { requireFoodPartner } = require('../foodpartners/foodPartnerAuth.middleware');

const customerSupportRouter = makeSupportRouter({
  kind: 'customer',
  guard: requireCustomer,
  pick: (req) => (req.customer ? {
    id: req.customer.customerId,
    name: req.customer.name,
    phone: req.customer.phone,
  } : null),
});

const driverSupportRouter = makeSupportRouter({
  kind: 'driver',
  /*
   * `requireDriverForSupport` — the rider guard that stops one status short of
   * the others.
   *
   * The reasoning that put `requireDriver` here rather than
   * `requireApprovedDriver` was right and did not go far enough: a rider whose
   * documents were just rejected is the rider most likely to need support, and
   * so is a rider who has been SUSPENDED — more so, because the refusal they
   * are shown at every other route is the sentence "please contact Lampose
   * support", and this was the route it meant. `requireDriver` answers them
   * 403 before `req.driver` is even set, so the only door the message names
   * was the one it closed.
   *
   * The guard is a separate export rather than a widened `requireDriver`: this
   * file's own rule is that no guard learns a second case, and it holds for a
   * status as much as for an audience. See `driverAuth.middleware.js`. A
   * suspended rider is still refused at duty, at the offer and at every live
   * order — the widening is this router, and only this router.
   */
  guard: requireDriverForSupport,
  pick: (req) => (req.driver ? {
    id: req.driver.driverId,
    name: req.driver.name,
    phone: req.driver.phone,
  } : null),
});

const restaurantSupportRouter = makeSupportRouter({
  kind: 'restaurant',
  guard: requireFoodPartner,
  pick: (req) => (req.foodPartner ? {
    id: req.foodPartner.restaurantId,
    /* The restaurant's trading name is what support should see on the row —
       "Anand Bhavan" locates a conversation, "R. Krishnan" does not. The
       owner's name is on the account and one lookup away when it is needed. */
    name: req.foodPartner.restaurantName || req.foodPartner.ownerName,
    phone: req.foodPartner.ownerPhone,
  } : null),
});

/* The diner's router is the default export, because `/api/v2/support` is the
   mount that existed first and `routes/index.js` already requires this file by
   name for it. The other two are named. */
module.exports = customerSupportRouter;
module.exports.customerSupportRouter = customerSupportRouter;
module.exports.driverSupportRouter = driverSupportRouter;
module.exports.restaurantSupportRouter = restaurantSupportRouter;
module.exports.makeSupportRouter = makeSupportRouter;
