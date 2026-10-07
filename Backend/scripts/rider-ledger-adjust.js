/* ══════════════════════════════════════════════════════════════════════════
   Put a test balance on one rider's ledger — for trying the wallet screens.

     node scripts/rider-ledger-adjust.js --phone 8639139906 --outstanding 1700
     node scripts/rider-ledger-adjust.js --phone 8639139906 --outstanding 1700 --run
     node scripts/rider-ledger-adjust.js --phone 8639139906 --wallet 250 --run

   Amounts are signed rupees (+ adds, − takes away). Writes ONE `correction`
   row, with a reason saying it was a test, through the same `post` every other
   movement uses — so it shows in the rider's history and can be undone with
   the opposite correction. A wallet credit clears outstanding first, as
   always.

   Report only by default. The write goes through the database guard like
   every writing script: it refuses a protected database (production) unless
   LAMPOSE_ALLOW_WRITES_TO names it. The ledger must already be open — run
   `npm run rider-ledger:open -- --run` on the same database first.
   ══════════════════════════════════════════════════════════════════════════ */
require('../src/config/env');
const { connectDB, closeConnections, isLamposeUp } = require('../src/infrastructure/database/db');

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const run = args.includes('--run');

if (run) require('../src/infrastructure/database/guard').assertDevTargetOrExit();

const Driver = require('../src/modules/drivers/driver.model');
const riderLedger = require('../src/modules/drivers/riderLedger.service');

const toPaise = (value) => (value == null ? 0 : Math.round(Number(value) * 100));
const rupees = (paise) => `₹${(paise / 100).toFixed(2)}`;

(async () => {
  const phone = String(flag('phone') || '').replace(/\D/g, '').slice(-10);
  const walletPaise = toPaise(flag('wallet'));
  const outstandingPaise = toPaise(flag('outstanding'));
  const reason = flag('reason') || 'Test balance for trying the wallet screens';

  if (phone.length !== 10 || (!walletPaise && !outstandingPaise)
    || !Number.isFinite(walletPaise) || !Number.isFinite(outstandingPaise)) {
    console.log('\nUsage: node scripts/rider-ledger-adjust.js --phone <10 digits> [--outstanding <₹>] [--wallet <₹>] [--reason "..."] [--run]\n');
    process.exit(2);
  }

  await connectDB().catch(() => {});
  await new Promise((r) => setTimeout(r, 1500));
  if (!isLamposeUp()) {
    console.log('\nMongoDB is not reachable.\n');
    process.exit(2);
  }

  const driver = await Driver.findOne({ phone: { $in: [`+91${phone}`, phone, `91${phone}`] } })
    .select('driverId name phone status').lean();
  if (!driver) {
    console.log(`\nNo rider with phone ${phone} on this database.\n`);
    await closeConnections();
    process.exit(1);
  }

  const settings = await riderLedger.getSettings();
  const now = await riderLedger.balanceFor(driver.driverId);
  console.log(`\n  ${driver.name || '(no name)'} · ${driver.driverId} · ${driver.phone} · ${driver.status}`);
  console.log(`  ledger ${settings.startedAt ? `open since ${settings.startedAt.toISOString()}` : 'NOT OPEN'}`);
  console.log(`  now      wallet ${rupees(now.walletPaise)} · outstanding ${rupees(now.outstandingPaise)}`);
  console.log(`  change   wallet ${rupees(walletPaise)} · outstanding ${rupees(outstandingPaise)} · "${reason}"`);

  if (!settings.startedAt) {
    console.log('\n  Open the ledger on this database first: npm run rider-ledger:open -- --run\n');
    await closeConnections();
    process.exit(1);
  }
  if (!run) {
    console.log('\n  Report only — add --run to write it.\n');
    await closeConnections();
    process.exit(0);
  }

  try {
    await riderLedger.post(driver.driverId, () => ({
      kind: 'correction', walletPaise, outstandingPaise, note: reason, by: 'rider-ledger-adjust script',
    }));
    await riderLedger.autoAdjust(driver.driverId);
  } catch (error) {
    console.log(`\n  Refused: ${error.message}\n`);
    await closeConnections();
    process.exit(1);
  }
  const after = await riderLedger.balanceFor(driver.driverId);
  console.log(`  after    wallet ${rupees(after.walletPaise)} · outstanding ${rupees(after.outstandingPaise)}`
    + `${after.outstandingPaise >= settings.codLimitPaise ? ' · CASH ORDERS PAUSED' : ''}\n`);

  await closeConnections();
  process.exit(0);
})();
