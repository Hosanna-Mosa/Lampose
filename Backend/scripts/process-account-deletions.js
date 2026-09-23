/* ══════════════════════════════════════════════════════════════════════════
   Carry out account-deletion requests whose grace period has passed — by hand.

     node scripts/process-account-deletions.js         report only
     node scripts/process-account-deletions.js --run   actually erase

   The same sweep the hourly worker runs (accountDeletion.worker.js), for when
   the worker is off — outside production it is off by default — or when
   somebody wants to see what the next sweep will do before it does it.

   Erases, never removes: see accountDeletion.eraser.js. An account with an
   order or a stay still in progress is reported as postponed and left alone.

   Reporting is the default, and the write goes through the database guard
   like every writing script: against a protected database it refuses unless
   LAMPOSE_ALLOW_WRITES_TO names that database.
   ══════════════════════════════════════════════════════════════════════════ */
require('../src/config/env');
const { connectDB, closeConnections, isLamposeUp } = require('../src/infrastructure/database/db');

const run = process.argv.includes('--run');

/* A report is harmless anywhere; the write is not. */
if (run) require('../src/infrastructure/database/guard').assertDevTargetOrExit();

const { processDueDeletions } = require('../src/modules/accountDeletion/accountDeletion.eraser');

(async () => {
  await connectDB().catch(() => {});
  await new Promise((r) => setTimeout(r, 1500));
  if (!isLamposeUp()) {
    console.log('\nMongoDB is not reachable.\n');
    process.exit(2);
  }

  console.log(run ? '\nCarrying out due deletion requests…\n' : '\nReport only — pass --run to erase.\n');
  const summary = await processDueDeletions({ dryRun: !run, log: (line) => console.log(`  ${line}`) });

  if (!summary.items.length) console.log('  Nothing is due.');
  if (run) {
    console.log(`\n  ${summary.erased} erased, ${summary.postponed} postponed, ${summary.failed} failed\n`);
  } else {
    console.log('');
  }

  await closeConnections();
  process.exit(summary.failed ? 1 : 0);
})();
