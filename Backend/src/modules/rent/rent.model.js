/* ══════════════════════════════════════════════════════════════════════════
   Rent a PG owner collects from their residents, recorded by the owner.

   ## Lampose never holds this money

   The owner takes rent in cash, UPI or a bank transfer, outside the app, and
   records it here. So nothing in this module touches `PartnerBooking.paidAmount`
   — that field is what `payout.service.js` counts as money Lampose owes the
   owner, and a ₹6,000 cash rent written into it would become a ₹6,000 payout
   request nobody funded.

   ## What is stored and what is derived

   Stored: the owner's terms (on the booking, `rent`), each payment they
   record, and each reminder they send. Derived on every read, by
   `rent.ledger.js`: which months are due, overdue, partial or paid. A stored
   "overdue" flag would need a job to set it at midnight and would be wrong
   every hour that job did not run — the dates already say it.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const PAYMENT_MODES = ['cash', 'upi', 'bank', 'other'];
const REMINDER_CHANNELS = ['whatsapp', 'sms', 'call'];

const rentPaymentSchema = new mongoose.Schema(
  {
    partnerPhoneDigits: { type: String, required: true, index: true },
    bookingId: { type: String, required: true, index: true },
    propertyId: { type: String, default: '' },
    /* Mirrored at the time of payment, like `propertyName` on a booking: a
       receipt must still say who paid after the booking is edited or deleted. */
    propertyName: { type: String, default: '' },
    guestName: { type: String, required: true },
    guestPhone: { type: String, default: '' },
    roomNumber: { type: String, default: '' },
    /* The rent month this money is for, `YYYY-MM`. Several payments may share
       one — that is what a partial payment is. */
    period: { type: String, required: true, match: /^\d{4}-\d{2}$/ },
    /* Rupees, whole — the same unit as `PartnerBooking.totalAmount`. */
    amount: { type: Number, required: true, min: 1 },
    paidOn: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    mode: { type: String, enum: PAYMENT_MODES, default: 'cash' },
    note: { type: String, default: '', maxlength: 300 },
    receiptNo: { type: String, required: true, unique: true },
    /* A mistake is voided, never deleted, so a receipt already shared with a
       resident can still be explained. */
    voidedAt: { type: Date, default: null },
    voidReason: { type: String, default: '' },
  },
  { timestamps: true },
);
rentPaymentSchema.index({ partnerPhoneDigits: 1, paidOn: -1 });

const rentReminderSchema = new mongoose.Schema(
  {
    partnerPhoneDigits: { type: String, required: true, index: true },
    bookingId: { type: String, required: true, index: true },
    period: { type: String, default: '' },
    channel: { type: String, enum: REMINDER_CHANNELS, required: true },
  },
  { timestamps: true },
);

/* One row per owner. */
const rentSettingsSchema = new mongoose.Schema(
  {
    partnerPhoneDigits: { type: String, required: true, unique: true },
    /* The morning push to the OWNER about who owes rent. Residents are only
       ever reminded by the owner's own tap. */
    ownerAlerts: { type: Boolean, default: true },
    /* How many days ahead "upcoming" rent is worth an alert. */
    daysBefore: { type: Number, default: 3, min: 0, max: 10 },
    /* `YYYY-MM-DD` of the last morning alert — the dedupe for the worker. */
    lastDigestOn: { type: String, default: '' },
  },
  { timestamps: true },
);

module.exports = {
  PAYMENT_MODES,
  REMINDER_CHANNELS,
  RentPayment: mongoose.models.RentPayment
    || mongoose.model('RentPayment', rentPaymentSchema, 'partner_rent_payments'),
  RentReminder: mongoose.models.RentReminder
    || mongoose.model('RentReminder', rentReminderSchema, 'partner_rent_reminders'),
  RentSettings: mongoose.models.RentSettings
    || mongoose.model('RentSettings', rentSettingsSchema, 'partner_rent_settings'),
};
