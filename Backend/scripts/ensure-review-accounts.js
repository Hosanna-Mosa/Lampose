/* ══════════════════════════════════════════════════════════════════════════
   Create or repair the Google Play review accounts, now.

     node scripts/ensure-review-accounts.js

   The server already does this at every database connect and hourly
   (reviewAccounts.service.js); this is for when you want it done — and to
   see the result — without restarting anything. Reads the same REVIEW_*
   settings, so an account whose settings are missing is reported as `off`.

   It writes, so it goes through the database guard like every writing script:
   against a protected database it refuses unless LAMPOSE_ALLOW_WRITES_TO
   names that database.
   ══════════════════════════════════════════════════════════════════════════ */
require('../src/config/env');
const { connectDB, closeConnections, isLamposeUp } = require('../src/infrastructure/database/db');

require('../src/infrastructure/database/guard').assertDevTargetOrExit();

const { ensureReviewAccounts } = require('../src/modules/reviewAccounts/reviewAccounts.service');

(async () => {
  await connectDB().catch(() => {});
  await new Promise((r) => setTimeout(r, 1500));
  if (!isLamposeUp()) {
    console.log('\nMongoDB is not reachable.\n');
    process.exit(2);
  }

  const result = await ensureReviewAccounts();
  console.log('\nReview accounts:');
  for (const [app, outcome] of Object.entries(result || {})) console.log(`  ${app.padEnd(12)} ${outcome}`);
  console.log('');

  await closeConnections();
  const failed = Object.values(result || {}).some((v) => String(v).startsWith('failed') || v === 'conflict');
  process.exit(failed ? 1 : 0);
})();
