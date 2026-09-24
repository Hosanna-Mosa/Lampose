/* ══════════════════════════════════════════════════════════════════════════
   `sales_location_pings` — one row per position fix, while a rep is on duty.

   NOT embedded on `SalesRep`. A rep who stays online for a full day sends a
   fix every several seconds; embedding that in a growing array on the
   account document would make every ordinary read of the roster — the admin
   panel's list, the rep's own `/me` — drag an ever-larger blob along with it.
   A separate collection, one document per fix, is the same choice
   `food_orders` avoids by NOT storing a delivery's whole GPS trail on the
   order itself, and the reason `driver.model.js` keeps only the CURRENT
   position on the account and nothing older.

   `salesRepId`, never the Mongo `_id` — matching the one rule every
   collection in this process follows for a foreign reference, so a join
   against the wrong id returns nothing rather than erroring.

   No `dutySessionId`. A rep's path is read by time range (today, or since
   `dutyStartedAt`) rather than by an explicit session key — one less field
   to keep in step with `onDuty` on the account document, and the account's
   own `dutyStartedAt` already answers "since when" for the CURRENT session,
   which is the only one the admin panel's map draws.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const pointSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: (pair) => Array.isArray(pair) && pair.length === 2
          && Number.isFinite(pair[0]) && Number.isFinite(pair[1])
          && Math.abs(pair[0]) <= 180 && Math.abs(pair[1]) <= 90,
        message: 'location.coordinates must be [longitude, latitude] and in range.',
      },
    },
  },
  { _id: false },
);

const salesLocationPingSchema = new mongoose.Schema(
  {
    salesRepId: { type: String, required: true, index: true },
    location: { type: pointSchema, required: true },
    /* The fix's radius in metres, as the phone reported it. Null on rows
       written before the app sent it. The admin map drops vague fixes — a
       Wi-Fi/cell position can be 500 m off, and joined into a path it draws
       streets the rep never walked. */
    accuracy: { type: Number, default: null },
    recordedAt: { type: Date, required: true, default: Date.now },
  },
  { collection: 'sales_location_pings' },
);

/* The one query this collection exists to answer: one rep's fixes, in a time
   window, oldest first — a polyline is drawn in the order it was walked. */
salesLocationPingSchema.index({ salesRepId: 1, recordedAt: 1 });

const SalesLocationPing = mongoose.models.SalesLocationPing
  || mongoose.model('SalesLocationPing', salesLocationPingSchema, 'sales_location_pings');

module.exports = SalesLocationPing;
