/* ══════════════════════════════════════════════════════════════════════════
   /api/v1/admin/food-orders — the console's food-order desk.

   The SECOND admin router in this module. `foodAdmin.routes.js` is the
   restaurant approval queue; this is the orders behind those restaurants, and
   the refund button that closes the loop `markForRefund` opens. Same identity,
   same middleware, same order of operations: the module's own log tag, then
   `verifyAdminToken`, then `requireLamposeDb`.

   v1 rather than v2 because the reader is an administrator in the `admins`
   collection, which is the v1 identity system, and the v1 admin token carries
   no `typ` claim at all. Nothing here accepts a diner, rider or restaurant
   token, and nothing on the three app-facing routers can reach these handlers.
   A router of its own rather than three routes added to `foodAdmin.routes.js`,
   because the two answer different questions and — the part that matters — the
   role gates are not the same.

   ## Reading is wide. Moving money is not.

   Any signed-in administrator may read the queue, exactly as they may read the
   restaurant queue, the rider queue and the support queue. A Viewer exists to
   see what is going on, and "where is this student's order" is an everyday
   question that should never need a permission.

   Refunding is 'Super Admin' and 'Admin', and DELIBERATELY not the set beside
   it. The restaurant and rider queues let 'Food Admin' decide, on the sound
   argument that approving kitchens and approving riders are the same job at
   the same desk. Sending money out of the company's account is not that job.
   'Food Admin' means "works the food side of the business" and 'Support' means
   "answers people"; neither of them means "signs for a payment", and a role
   granted so somebody could approve a biryani shop should not, a month later,
   also empty a bank account one click at a time.

   Refunding is not the same authority as reading, and it is not the same
   authority as approving either. So it gets its own set, and the set is the
   narrow one — the same pair `zoneAdmin.routes.js` reserves for drawing the
   trading area, and for the same reason: a decision with money on the other
   side of it.

   Recording a refund that happened OUTSIDE the app sits behind the same gate.
   It moves no money, but it is a claim that money moved — it takes an order
   out of the queue and tells everybody after that the debt is settled — and a
   false one is worse than a slow refund, because nobody ever looks again.
   ══════════════════════════════════════════════════════════════════════════ */
const express = require('express');

const verifyAdminToken = require('../analytics/verifyAdminToken.middleware');
const { requireLamposeDb } = require('../../shared/middleware/requireDb');
const {
  listOrders, getCounts, getOrder, issueRefund, recordSettledRefund,
} = require('./foodOrderAdmin.controller');
const { tagFoodPartnerRequest } = require('./foodPartner.log');

const router = express.Router();

/** Roles allowed to move a diner's money. Reading is wider. See the header. */
const REFUNDING_ROLES = new Set(['Super Admin', 'Admin']);

const requireRefunder = (req, res, next) => {
  if (REFUNDING_ROLES.has(req.admin?.role)) return next();
  const message = 'Refunding an order requires the Admin or Super Admin role.';
  return res.status(403).json({ success: false, code: 'FORBIDDEN', message, error: message });
};

router.use(tagFoodPartnerRequest);
router.use(verifyAdminToken);
router.use(requireLamposeDb);

/* Any signed-in administrator may look.

   `/counts` is registered BEFORE `/:orderNumber` and that ordering is load
   bearing: Express matches in order, and a parameterised route declared first
   would swallow the badge as a lookup for an order numbered "counts". */
router.get('/counts', getCounts);
router.get('/', listOrders);
router.get('/:orderNumber', getOrder);

/* Only a refunder may send it, or declare it sent. */
router.post('/:orderNumber/refund', requireRefunder, issueRefund);
router.post('/:orderNumber/refund/settled', requireRefunder, recordSettledRefund);

module.exports = router;
module.exports.REFUNDING_ROLES = REFUNDING_ROLES;
