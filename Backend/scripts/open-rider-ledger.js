/* ══════════════════════════════════════════════════════════════════════════
   Open the rider ledger — once.

     node scripts/open-rider-ledger.js                     report only
     node scripts/open-rider-ledger.js --run               open it
     node scripts/open-rider-ledger.js --with-earnings     also credit past earnings

   Until this runs, no delivery is posted to any rider's wallet or
   outstanding. Running it stamps `rider_ledger_settings.startedAt` and writes
   one `opening` row per rider carrying in what they hold today: cash collected
   at doors, less cash handed over — the same figure the console's "cash in
   hand" shows, so nobody's number jumps.

   `--with-earnings` additionally credits every past delivery's earning to the
   rider's wallet (and clears outstanding with it). Leave it off if riders
   were already paid for those trips some other way — the report shows both
   figures so somebody can decide.

   See `riderLedger.service.js#openLedger`. Reporting is the default; the
   write goes through the database guard like every writing script.
   ══════════════════════════════════════════════════════════════════════════ */
require('../src/config/env');
const { connectDB, closeConnections, isLamposeUp } = require('../src/infrastructure/database/db');

const run = process.argv.includes('--run');
const withEarnings = process.argv.includes('--with-earnings');

if (run) require('../src/infrastructure/database/guard').assertDevTargetOrExit();

const { openLedger } = require('../src/modules/drivers/riderLedger.service');

const rupees = (paise) => `₹${(paise / 100).toFixed(2)}`;

(async () => {
  await connectDB().catch(() => {});
  await new Promise((r) => setTimeout(r, 1500));
  if (!isLamposeUp()) {
    console.log('\nMongoDB is not reachable.\n');
    process.exit(2);
  }

  const result = await openLedger({ run, withEarnings, by: 'open-rider-ledger script' });

  if (result.alreadyOpenedAt) {
    console.log(`\nThe rider ledger was already opened at ${new Date(result.alreadyOpenedAt).toISOString()}. Nothing to do.\n`);
  } else {
    console.log(run
      ? `\nOpened the rider ledger at ${result.startedAt.toISOString()}.\n`
      : `\nReport only — pass --run to open the ledger${withEarnings ? '' : ' (add --with-earnings to also credit past earnings)'}.\n`);
    if (!result.riders.length) console.log('  No rider carries anything in.');
    for (const r of result.riders) {
      console.log(
        `  ${r.driverId.padEnd(16)} outstanding ${rupees(r.outstandingPaise).padStart(12)}`
        + `  (${r.cashOrders} cash orders ${rupees(r.collectedPaise)} − handed over ${rupees(r.depositedPaise)})`
        + (withEarnings ? `   wallet ${rupees(r.walletPaise)} from ${r.trips} trips` : ''),
      );
    }
    console.log('');
  }

  await closeConnections();
  process.exit(0);
})();
