/* ══════════════════════════════════════════════════════════════════════════
   /api/v1/admin/support — the console's support queue.

   v1 rather than v2 because the reader is an administrator in the `admins`
   collection, which is the v1 identity system. `verifyAdminToken` is the same
   middleware the rider queue and the restaurant queue use;
   nothing here accepts a customer, driver or restaurant token, and nothing on
   the three app-facing support routers can reach these handlers.

   ## Reading is wide, writing is a role

   Anybody signed into the console may READ the queue. That is deliberate and
   it is the same rule the rider and restaurant queues follow: a Viewer exists
   to see what is going on, and a support thread is often the fastest
   explanation of why a rider is angry or an order went wrong.

   Writing — replying, resolving, assigning — is 'Super Admin', 'Admin' or
   'Support'. A reply goes to a real person under a real name and cannot be
   edited or deleted afterwards, which makes it the most consequential thing in
   this module and the one thing a read-only account must not be able to do.

   ## Why 'Support' is a new role and 'Food Admin' is not reused

   The rider queue reasons that 'Food Admin' already means "works the food side
   of the business", so approving riders needs no seventh role. Support does not
   fit that argument: it spans all three apps and the stay side as well, and the
   person answering a deposit dispute at 9am is not the person approving
   restaurants. Reusing an existing role here would either give restaurant
   approvers the safety queue or give support staff the power to put riders on
   the road — both are wrong, and in opposite directions.

   The role is additive: an account whose role is not in the set can still read
   everything, so nothing that works today stops working.
   ══════════════════════════════════════════════════════════════════════════ */
const express = require('express');

const verifyAdminToken = require('../analytics/verifyAdminToken.middleware');
const { requireLamposeDb } = require('../../shared/middleware/requireDb');
const {
  listTickets, getStats, getTicket, replyToTicket, updateTicket, assignTicket, markRead,
} = require('./supportAdmin.controller');

const router = express.Router();

/* Writing into somebody's thread is `support.answer` — Super Admin, Admin,
   Support — from the one permission table in iam/iam.roles.js. Reading is
   wider: any signed-in administrator. */
const { can } = require('../iam/iam.middleware');
const { rolesWith } = require('../iam/iam.roles');

const ANSWERING_ROLES = new Set(rolesWith('support.answer'));
const requireSupportAgent = can('support.answer');

router.use(verifyAdminToken);
router.use(requireLamposeDb);

/* Any signed-in administrator may look. */
router.get('/stats', getStats);
router.get('/tickets', listTickets);
router.get('/tickets/:reference', getTicket);

/* Marking the QUEUE's watermark is a read-adjacent act — it says "somebody
   looked", which is true of a Viewer looking. It is not behind the role gate
   for the same reason opening a ticket is not. */
router.post('/tickets/:reference/read', markRead);

/* Everything that changes what the requester sees. */
router.post('/tickets/:reference/messages', requireSupportAgent, replyToTicket);
router.patch('/tickets/:reference', requireSupportAgent, updateTicket);
router.post('/tickets/:reference/assign', requireSupportAgent, assignTicket);

module.exports = router;
module.exports.ANSWERING_ROLES = ANSWERING_ROLES;
