/* ══════════════════════════════════════════════════════════════════════════
   `food_table_bookings` — a table booked at a restaurant.

   ## The status track

     requested ──accept──▶ confirmed ──▶ arrived
         │                     │   └──▶ no_show
         ├──decline──▶ declined │
         ├──(15 min)─▶ expired  └──cancel──▶ cancelled
         └──cancel──▶ cancelled

   `cancelledBy` says whose cancellation it was — the diner, the restaurant,
   or the system (a day the restaurant closed, hours that moved).

   ## What a booking holds

   A numbered TABLE (`tableNumber`, "A3", with its `tableSeats`): the one the
   diner picked (`tableChosen`), or the smallest free one that seats the
   party. The hold itself is in `food_table_ledgers`, which is what makes two
   diners unable to take the same table — this document is the record of
   who, when and why. A booking made before tables had numbers has no
   `tableNumber`; it is shown by its size alone.

   The restaurant's name, phone and address are copied in at booking, so a
   booking reads correctly after the restaurant edits its profile.
   ══════════════════════════════════════════════════════════════════════════ */
const crypto = require('crypto');
const mongoose = require('mongoose');

const STATUSES = ['requested', 'confirmed', 'declined', 'expired', 'cancelled', 'arrived', 'no_show'];

/** Statuses that still hold a table. */
const ACTIVE_STATUSES = ['requested', 'confirmed'];

const tableBookingSchema = new mongoose.Schema(
  {
    reference: { type: String, required: true, unique: true, index: true },

    restaurantId: { type: String, required: true, index: true },
    restaurantName: { type: String, default: '' },
    restaurantPhone: { type: String, default: '' },
    restaurantAddress: { type: String, default: '' },

    customerId: { type: String, required: true, index: true },
    /* The account's own name and number… */
    customerName: { type: String, default: '' },
    customerPhone: { type: String, default: '' },
    /* …and who is actually coming, which is the account holder unless they
       booked for somebody else. The restaurant is shown THESE. */
    guestName: { type: String, default: '' },
    guestPhone: { type: String, default: '' },
    forSomeoneElse: { type: Boolean, default: false },

    partySize: { type: Number, required: true, min: 1 },
    tableSeats: { type: Number, required: true, min: 1 },
    tableNumber: { type: String, default: '' },
    /* The diner asked for this table, rather than taking any free one. */
    tableChosen: { type: Boolean, default: false },

    /* India's calendar date and wall-clock time, plus the instants they
       denote — the strings for display and the ledger, the dates for sorting
       and the sweeps. */
    date: { type: String, required: true },
    time: { type: String, required: true },
    startsAt: { type: Date, required: true, index: true },
    endsAt: { type: Date, required: true },

    /* A wish, never a promise: shown to the restaurant as "on request". */
    preference: {
      seating: { type: String, enum: ['ac', 'non_ac', null], default: null },
      area: { type: String, enum: ['indoor', 'outdoor', null], default: null },
    },
    note: { type: String, default: '', maxlength: 300 },

    status: { type: String, enum: STATUSES, default: 'requested', index: true },
    /* The restaurant's answer is due by this; after it the request expires. */
    respondBy: { type: Date, required: true },
    decidedAt: { type: Date, default: null },
    cancelledBy: { type: String, enum: ['customer', 'restaurant', 'system', null], default: null },
    reason: { type: String, default: '', maxlength: 300 },
    arrivedAt: { type: Date, default: null },
    noShowAt: { type: Date, default: null },
    reminderSentAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'food_table_bookings' },
);

tableBookingSchema.index({ restaurantId: 1, status: 1, startsAt: 1 });
tableBookingSchema.index({ customerId: 1, createdAt: -1 });
tableBookingSchema.index({ status: 1, respondBy: 1 });

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** `TB-` and six characters — read down a phone line at the door. */
const makeReference = () => {
  const bytes = crypto.randomBytes(6);
  let body = '';
  for (let i = 0; i < 6; i += 1) body += ALPHABET[bytes[i] % ALPHABET.length];
  return `TB-${body}`;
};

const TableBooking = mongoose.models.TableBooking
  || mongoose.model('TableBooking', tableBookingSchema);

module.exports = TableBooking;
module.exports.STATUSES = STATUSES;
module.exports.ACTIVE_STATUSES = ACTIVE_STATUSES;
module.exports.makeReference = makeReference;
