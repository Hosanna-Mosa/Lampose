/* ══════════════════════════════════════════════════════════════════════════
   /api/v1/admin/food-restaurants — the console's approval queue.

   v1 rather than v2 because the reader is an administrator in the `admins`
   collection, which is the v1 identity system. `verifyAdminToken` is the same
   middleware every other admin surface uses; nothing here accepts a
   food-partner token, and nothing on the partner router can reach these
   handlers.

   ## Why this is NOT behind requireSuperAdmin

   The console has a "Database" group locked to Super Admin, and this is not
   part of it. That group exists for collections with no dedicated UI, reached
   across identity boundaries — a blunt gate standing in for a considered one.
   Approving restaurants is ordinary operational work with a purpose-built
   screen, and locking it to the top role would mean the one person who can do
   it is the person least likely to be doing it daily.

   So the gate is a ROLE gate rather than a Super-Admin gate: 'Super Admin',
   'Admin' and the new 'Food Admin' may work this queue. A Viewer may read it
   and may not decide anything, which is what the role means everywhere else in
   the console.
   ══════════════════════════════════════════════════════════════════════════ */
const express = require('express');

const verifyAdminToken = require('../analytics/verifyAdminToken.middleware');
const { requireLamposeDb } = require('../../shared/middleware/requireDb');
const {
  listRestaurants, getRestaurant, decideRestaurant, setActive, resendCredentials,
} = require('./foodAdmin.controller');
const { tagFoodPartnerRequest } = require('./foodPartner.log');

const router = express.Router();

/* Deciding an application's fate is `food.decide` — Super Admin, Admin, Food
   Admin — from the one permission table in iam/iam.roles.js. Reading is wider. */
const { can } = require('../iam/iam.middleware');

const requireFoodApprover = can('food.decide');

router.use(tagFoodPartnerRequest);
router.use(verifyAdminToken);
router.use(requireLamposeDb);

/* Any signed-in administrator may look at the queue. */
router.get('/', listRestaurants);
router.get('/:restaurantId', getRestaurant);

/* Only an approver may move one. */
router.patch('/:restaurantId/decision', requireFoodApprover, decideRestaurant);
router.patch('/:restaurantId/active', requireFoodApprover, setActive);

/* Re-issuing an owner's password is the same decision as approving them — it
   hands somebody the keys to a restaurant's orders and menu — so it sits
   behind the same capability rather than a wider one. */
router.post('/:restaurantId/credentials', requireFoodApprover, resendCredentials);

module.exports = router;
