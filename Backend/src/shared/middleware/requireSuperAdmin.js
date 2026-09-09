/* ══════════════════════════════════════════════════════════════════════════
   Gate for the admin console's full-database CRUD routes (visit requests,
   leads-panel users/jobs/leads, products) — every collection that has no
   dedicated admin UI of its own yet.

   These routes reach across collections that the console was never built to
   touch (some of them belong to the *other* identity system — see
   scraper.store.js), so they are locked to the one capability only the top
   role holds. The role → capability mapping lives in `iam.roles.js`; this
   file is the name the routers already import.
   ══════════════════════════════════════════════════════════════════════════ */
const { requireAdminWith } = require('../../modules/iam/iam.middleware');

module.exports = requireAdminWith('database.manage');
