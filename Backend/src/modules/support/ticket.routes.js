/* ══════════════════════════════════════════════════════════════════════════
   /api/v2/support — the mobile app's tickets and safety reports.

   Its own group rather than a branch of /customers, for the same reason
   /visit-requests is: this is a record with its own collection, its own
   lifecycle and its own readers. `/customers/saved` and
   `/customers/notifications` are properties OF an account — they have no
   meaning apart from it and no state machine. A ticket outlives the screen
   that made it and is worked on by somebody who is not the customer.

   Every route is behind `requireCustomer`. There is no public read: a support
   thread contains a phone number, a property, an allegation and sometimes an
   amount of money.

   ## Why the limiters sit after the session check

   They count per customer, so they need `req.customer` to exist. That ordering
   also means an anonymous flood is rejected by the 401 before it ever reaches
   a counter, which is the cheaper refusal anyway.

   The write limits are deliberately generous. Somebody whose deposit is being
   withheld may well file three things in ten minutes, and rate-limiting a
   person in that position out of the safety queue would be a worse outcome
   than the spam these ceilings exist to stop.
   ══════════════════════════════════════════════════════════════════════════ */
const express = require('express');

const {
  listTickets,
  getTicket,
  createTicket,
  createReport,
  replyToTicket,
  markTicketRead,
} = require('./ticket.controller');
const { requireCustomer } = require('../customers/customerAuth.middleware');
const { requireLamposeDb } = require('../../shared/middleware/requireDb');
const { rateLimit } = require('../../shared/middleware/rateLimit');

const router = express.Router();

/* Counted per account, not per IP: a hostel's worth of students behind one
   wifi router share an address, and one of them complaining must not use up
   everybody else's allowance. */
const customerKey = (req) => (req.customer ? req.customer.customerId : req.ip);

const createLimit = rateLimit({
  name: 'support-create', windowMs: 60 * 60 * 1000, max: 10, keyOf: customerKey,
});

const replyLimit = rateLimit({
  name: 'support-reply', windowMs: 15 * 60 * 1000, max: 30, keyOf: customerKey,
});

router.get('/tickets', requireLamposeDb, requireCustomer, listTickets);
router.get('/tickets/:reference', requireLamposeDb, requireCustomer, getTicket);

router.post('/tickets', requireLamposeDb, requireCustomer, createLimit, createTicket);
router.post(
  '/tickets/:reference/messages',
  requireLamposeDb, requireCustomer, replyLimit, replyToTicket,
);
router.post('/tickets/:reference/read', requireLamposeDb, requireCustomer, markTicketRead);

/* The heavier path, and a separate endpoint on purpose — see the note at the
   top of ticket.controller.js. It shares the create ceiling with tickets so
   the two cannot be used to double an allowance. */
router.post('/reports', requireLamposeDb, requireCustomer, createLimit, createReport);

module.exports = router;
