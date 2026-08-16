/* ══════════════════════════════════════════════════════════════════════════
   Gate for the admin console's full-database CRUD routes (visit requests,
   leads-panel users/jobs/leads, products) — every collection that has no
   dedicated admin UI of its own yet.

   These routes reach across collections that the console was never built to
   touch (some of them belong to the *other* identity system — see
   scraper.store.js), so unlike the rest of the v1 admin surface they are
   deliberately locked to the top role rather than left open. `verifyAdminToken`
   already does the real work: verifying the same JWT `/api/admin/login`
   issues against the `admins` collection and attaching `req.admin`. This just
   adds the role check on top of it.
   ══════════════════════════════════════════════════════════════════════════ */
const verifyAdminToken = require('../../modules/analytics/verifyAdminToken.middleware');

const requireSuperAdminRole = (req, res, next) => {
  if (req.admin.role !== 'Super Admin') {
    const message = 'This action requires the Super Admin role.';
    return res.status(403).json({ success: false, code: 'FORBIDDEN', message, error: message });
  }
  return next();
};

module.exports = [verifyAdminToken, requireSuperAdminRole];
