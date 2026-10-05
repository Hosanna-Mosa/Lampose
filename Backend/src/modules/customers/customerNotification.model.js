/* ══════════════════════════════════════════════════════════════════════════
   customer_notifications — the student's inbox rows that are NOT derived
   from a request.

   The alerts inbox (`notification.controller.js`) is built from
   `visitrequests`, which covers "sent", "accepted", "declined" and "expired"
   well. Everything that happens later — the owner cancelling a booking, a
   check-in or check-out, a refund paid, a coupon earned, a visit paid for or
   scheduled — reached the student ONLY as a push or a socket event. On a
   phone with notifications refused, a simulator, or simply after the banner
   was swiped away, that news was gone.

   The stay notifier writes one row here whenever it pushes one of those, and
   writes it before looking for a device, so a student with no registered
   handset still finds it in the inbox. Read state is the customer's existing
   `notificationsReadAt` watermark, the same as every other alert.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const customerNotificationSchema = new mongoose.Schema(
  {
    customerId: { type: String, required: true, index: true },
    kind: { type: String, required: true },
    title: { type: String, required: true, trim: true },
    body: { type: String, default: '', trim: true },
    requestId: { type: String, default: null },
    bookingId: { type: String, default: null },
    listingId: { type: String, default: null },
    at: { type: Date, default: Date.now },
  },
  { collection: 'customer_notifications', timestamps: false },
);

customerNotificationSchema.index({ customerId: 1, at: -1 });

module.exports = mongoose.models.CustomerNotification
  || mongoose.model('CustomerNotification', customerNotificationSchema);
