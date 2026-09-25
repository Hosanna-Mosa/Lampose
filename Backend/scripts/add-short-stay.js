/* ══════════════════════════════════════════════════════════════════════════
   Add a short stay to a property that today only offers a long one.

     node scripts/add-short-stay.js                 report only (dry run)
     node scripts/add-short-stay.js --run           write it

   Optional: --id=<propertyId>  --price=<per night>  (defaults below)

   What "short stay" means to the rest of the backend (stayIntent.util.js
   `stayRatesFor`): `stayType` must mention short/both AND `dailyPrice` must
   be non-zero — availability follows the money. So both are set.

   `monthlyPrice` is backfilled from `rent` when it is empty, because
   listing.formatter.js `isDaily()` treats "dailyPrice > 0 and no
   monthlyPrice" as a nightly-only listing — without it, adding a night rate
   would quietly turn this PG's monthly card into a per-night one.

   Refuses protected databases like every writing script; to write to one,
   name it: LAMPOSE_ALLOW_WRITES_TO=<db> node scripts/add-short-stay.js --run
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');
const { guardedConnect } = require('../src/infrastructure/database/guard');

const arg = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};

const PROPERTY_ID = arg('id') || '6a9fea8f05a887802481db02';
const PER_NIGHT = Number(arg('price') || 300);
const RUN = process.argv.includes('--run');

async function main() {
  if (!mongoose.isValidObjectId(PROPERTY_ID)) throw new Error(`Not an ObjectId: ${PROPERTY_ID}`);
  if (!Number.isFinite(PER_NIGHT) || PER_NIGHT <= 0) throw new Error(`Bad per-night price: ${PER_NIGHT}`);

  await guardedConnect({ verb: RUN ? 'writing to' : 'reading (dry run)' });
  const col = mongoose.connection.db.collection('properties');
  const _id = new mongoose.Types.ObjectId(PROPERTY_ID);

  const doc = await col.findOne({ _id });
  if (!doc) throw new Error(`No property ${PROPERTY_ID} in this database`);

  const pick = (d) => ({
    stayType: d.stayType, shortStayDuration: d.shortStayDuration, dailyPrice: d.dailyPrice,
    longStayDuration: d.longStayDuration, monthlyPrice: d.monthlyPrice, rent: d.rent,
  });

  const set = {
    stayType: 'Both Short & Long Stay',
    dailyPrice: PER_NIGHT,
    shortStayDuration: '1-7 Days',
    updatedAt: new Date(),
  };
  if (!(Number(doc.monthlyPrice) > 0) && Number(doc.rent) > 0) set.monthlyPrice = Number(doc.rent);
  if (!doc.longStayDuration) set.longStayDuration = '1 Month+';

  console.log(`  ${doc.name} — ${doc.place}  (${PROPERTY_ID})`);
  console.log('  before:', pick(doc));
  console.log('  after :', pick({ ...doc, ...set }));

  if (!RUN) {
    console.log('\n  Dry run — nothing written. Re-run with --run to apply.');
    return;
  }
  const res = await col.updateOne({ _id }, { $set: set });
  console.log(`\n  Updated: matched ${res.matchedCount}, modified ${res.modifiedCount}`);
}

main()
  .catch((err) => { console.error(err.message || err); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
