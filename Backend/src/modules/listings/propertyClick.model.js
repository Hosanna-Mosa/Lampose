const mongoose = require('mongoose');

/* ══════════════════════════════════════════════════════════════════════════
   How many times a property's card has been tapped open.

   One row per property, one number: every tap from the User App and from
   lampose.com adds one — repeat taps and guests included, by product decision
   ("every tap", total only). Owners see it in Stay Partner, admins in the
   console.

   ## Why its own collection and not a field on `properties`

   A tap would otherwise rewrite the property document: its `updatedAt` would
   move on every card someone opened (the console shows that as "Updated"),
   and a counter living on a document that is also saved whole — the v1 PUT
   is a `findByIdAndUpdate(req.body)` — is one careless save away from being
   reset. Here the only writer is one `$inc`, which Mongo applies atomically,
   so two taps in the same millisecond both count.

   Keyed by the property id as a string, the same way `partner_share_types`
   and `partner_bookings` refer to a property.
   ══════════════════════════════════════════════════════════════════════════ */
const propertyClickSchema = new mongoose.Schema(
  {
    propertyId: { type: String, required: true, unique: true, index: true },
    count: { type: Number, default: 0, min: 0 },
    lastClickAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const PropertyClick = mongoose.models.PropertyClick
  || mongoose.model('PropertyClick', propertyClickSchema, 'property_clicks');

/** Add one tap. Upserts, so a property's first tap creates its row. */
const recordClick = (propertyId) => PropertyClick.updateOne(
  { propertyId: String(propertyId) },
  { $inc: { count: 1 }, $set: { lastClickAt: new Date() } },
  { upsert: true },
);

/**
 * Click totals for many properties at once, as a Map of id → count. A
 * property nobody has tapped is simply absent; callers read it as 0.
 */
const clickCountsFor = async (propertyIds) => {
  const ids = [...new Set((propertyIds || []).map(String).filter(Boolean))];
  if (!ids.length || mongoose.connection.readyState !== 1) return new Map();
  const rows = await PropertyClick.find({ propertyId: { $in: ids } }).select('propertyId count').lean();
  return new Map(rows.map((row) => [row.propertyId, row.count || 0]));
};

module.exports = { PropertyClick, recordClick, clickCountsFor };
