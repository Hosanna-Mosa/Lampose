/* ══════════════════════════════════════════════════════════════════════════
   food_staff_access_logs — every time Lampose staff used the shared staff
   password to get into a restaurant, and everything that session changed.

   One row per event, three kinds:

     login     the staff password opened a restaurant (app or web console)
     change    a write made with that session — method, path, what was sent,
               and whether it worked
     blocked   a write a staff session may not make (bank details, the
               owner's password, deleting the account), refused

   `sessionId` ties a login to the changes after it, so the console can show
   "signed in at 10:02 from this IP, then changed these five things".

   Written by `staffAccess.js` and read by the staff console at
   /api/v1/admin/food-staff-access. Nothing customer- or restaurant-facing
   reads it. Bodies are redacted on the way in (passwords, bank numbers,
   tokens, base64 images), so this collection never holds a credential.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const foodStaffAccessSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, index: true },
    kind: { type: String, enum: ['login', 'change', 'blocked'], required: true },
    restaurantId: { type: String, required: true, index: true },
    restaurantName: { type: String, default: '' },
    /* Which door: the Food-Partner mobile app or the web restaurant console. */
    surface: { type: String, enum: ['app', 'console'], required: true },
    /* What the staff member typed to find the restaurant (phone or email). */
    identifier: { type: String, default: '' },

    method: { type: String, default: '' },
    path: { type: String, default: '' },
    /* A sentence for the console: "Updated dish FPI-…", "Order 123 → accepted". */
    action: { type: String, default: '' },
    /* The request body, redacted. This is "what changed". */
    changes: { type: mongoose.Schema.Types.Mixed, default: null },
    statusCode: { type: Number, default: null },
    ok: { type: Boolean, default: true },

    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'food_staff_access_logs' },
);

foodStaffAccessSchema.index({ createdAt: -1 });

module.exports = mongoose.models.FoodStaffAccess
  || mongoose.model('FoodStaffAccess', foodStaffAccessSchema);
