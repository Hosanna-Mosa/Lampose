const express = require('express');
const {
  getProperties,
  getPropertyById,
  createProperty,
  deleteProperty,
} = require('./property.controller');
const { requireLamposeDb } = require('../../shared/middleware/requireDb');
const { protect, protectRole } = require('../../shared/middleware/authMiddleware');

const router = express.Router();

/* Reads are public — the same rows are already public through
   /api/v2/listings. Writes are not: without a guard, anyone who found this
   host could delete every property in the collection. The leads panel runs
   entirely behind its own login and its axios client attaches the token to
   every request, so this costs it nothing. Set REQUIRE_AUTH=false to lift it.

   requireLamposeDb runs before protect on the write routes on purpose: the
   token check reads the user collection, and with the database down that
   query would buffer for ten seconds before failing with something that names
   nothing. Checking the connection first turns it into an immediate 503. */
router.get('/', requireLamposeDb, getProperties);
router.get('/:id', requireLamposeDb, getPropertyById);
/* ADMIN only. `protect` alone let any `scriper_users` token write here —
   including an onboarding agent's, which `/api/v2/auth/onboarding-login`
   issues from the same collection — so a field agent could publish or delete
   a live listing with no verification chain and no v1 permission grant. The
   leads panel shows the Properties tab to ADMINs only (Sidebar.tsx); this is
   that rule, enforced where it counts. */
router.post('/', requireLamposeDb, protect, protectRole('ADMIN'), createProperty);
router.delete('/:id', requireLamposeDb, protect, protectRole('ADMIN'), deleteProperty);

module.exports = router;
