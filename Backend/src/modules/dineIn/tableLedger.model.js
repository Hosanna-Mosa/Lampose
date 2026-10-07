/* ══════════════════════════════════════════════════════════════════════════
   `food_table_ledgers` — which tables are held, per restaurant per day.

   ## Why a ledger, and not a count over the bookings

   Two diners tapping the last free table at the same moment must not both get
   it, and this deployment has no transactions (no replica set — the test
   database matches it on purpose). "Count the bookings, then insert one" lets
   both counts see a free table.

   So every hold for one restaurant on one date lives in ONE document, and a
   new hold is written with a compare-and-set on its `version`: read the
   ledger, decide against the holds in it, then `$push` only if `version` has
   not moved. Of two racing writers exactly one update matches; the other
   re-reads and decides again against the table the first one just took.

   A hold carries `expiresAt` while its booking waits for the restaurant's
   answer, so an unanswered request stops holding a table the moment its
   window closes — whether or not the sweep has got round to it yet.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const holdSchema = new mongoose.Schema(
  {
    reference: { type: String, required: true },
    /* The table's number ("A3"). Null on a hold made before tables had
       numbers — `resolveHolds` gives those the first free table of `seats`. */
    table: { type: String, default: null },
    seats: { type: Number, required: true },
    /* Minutes since midnight on the ledger's date; `endMin` may pass 1440 for
       a late sitting. */
    startMin: { type: Number, required: true },
    endMin: { type: Number, required: true },
    expiresAt: { type: Date, default: null },
  },
  { _id: false },
);

const tableLedgerSchema = new mongoose.Schema(
  {
    restaurantId: { type: String, required: true },
    date: { type: String, required: true },
    version: { type: Number, default: 0 },
    holds: { type: [holdSchema], default: [] },
  },
  { timestamps: true, collection: 'food_table_ledgers' },
);

tableLedgerSchema.index({ restaurantId: 1, date: 1 }, { unique: true });

module.exports = mongoose.models.TableLedger
  || mongoose.model('TableLedger', tableLedgerSchema);
