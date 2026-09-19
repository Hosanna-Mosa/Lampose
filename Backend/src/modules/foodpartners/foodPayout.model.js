/* ══════════════════════════════════════════════════════════════════════════
   `food_payouts` — a restaurant's request to be paid, and what happened to it.

   Until this existed there was no food settlement ledger at all. A kitchen's
   earnings could be counted (`partnerPayout` on each order) and nothing
   anywhere recorded that the money had been sent, which is why the Earnings
   screen had to carry a line saying so. This is that ledger.

   ## Three states, and no more than three

   pending → paid, or pending → rejected. That is the whole life of a row.

   The Stay side's `partner_payouts` carries `processing` and `failed` as
   well, because RazorpayX dispatches its payouts and those are ITS states.
   Nothing dispatches these: a member of Lampose staff makes the transfer
   themselves and records it. Inventing the other two here would be modelling
   a machine that is not attached — and the first person to read the enum
   would reasonably assume something automatic was going to move.

   When automatic dispatch is added, `processing` and `failed` join the enum
   and nothing else about this file has to change.

   ## The claim is on the ORDER, not counted here

   `orderNumbers` records which orders a request covers, for display and for
   returning them if it is refused. It is NOT what stops an order being paid
   twice — `foodOrder.payoutId` is, stamped inside an update scoped on
   `payoutId: null` so two concurrent requests cannot both claim one order.
   The same design `payout.service.js` uses for bookings, and for the same
   reason: a total computed from a prior read is a total that can be wrong by
   the time it is written.

   ## The account is a SNAPSHOT

   `account` copies the last four digits, the IFSC and the holder's name as
   they were when the request was made. It is not a reference to the saved
   account, because an owner may switch or delete that account afterwards and
   the record of where money was sent must not change under it. The full
   account number is not here for the same reason it is not anywhere else —
   see `foodRestaurant.model.js`.
   ══════════════════════════════════════════════════════════════════════════ */
const crypto = require('crypto');
const mongoose = require('mongoose');

const PAYOUT_STATUSES = ['pending', 'paid', 'rejected'];

/* The same alphabet the rest of this module's public ids use — no I, O, 0 or
   1, because these are read down a phone line to support. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const makeFoodPayoutId = () => {
  const bytes = crypto.randomBytes(8);
  let body = '';
  for (let i = 0; i < 8; i += 1) body += ALPHABET[bytes[i] % ALPHABET.length];
  return `FPO-${body}`;
};

const foodPayoutSchema = new mongoose.Schema(
  {
    payoutId: { type: String, required: true, unique: true, index: true },

    /* `food_restaurants.restaurantId` — the `FP-` string, never the ObjectId.
       See the note in `foodProduct.model.js` on why mixing the two returns
       nothing rather than throwing. */
    restaurantId: { type: String, required: true, index: true },
    /* Snapshotted so the staff queue can be read without a join, and so a
       renamed restaurant does not rewrite the history of what was paid. */
    restaurantName: { type: String, default: '', trim: true },

    /** Rupees, matching `foodOrder.partnerPayout`. Not paise — the food side
     *  has counted in rupees since the first order and one boundary where the
     *  unit changes is one place to get it wrong. */
    amount: { type: Number, required: true, min: 0 },

    status: { type: String, enum: PAYOUT_STATUSES, default: 'pending', index: true },

    /* What this request covers. Display and reversal; the claim itself lives
       on the orders — see the header. */
    orderNumbers: { type: [String], default: [] },
    orderCount: { type: Number, default: 0 },

    /* Where the owner asked for it, as it read at the moment they asked. */
    account: {
      accountId: { type: String, default: '' },
      label: { type: String, default: '', trim: true },
      accountHolderName: { type: String, default: '', trim: true },
      accountLast4: { type: String, default: '', trim: true },
      ifscCode: { type: String, default: '', trim: true },
      accountType: { type: String, default: '' },
      upiId: { type: String, default: '', trim: true },
    },

    requestedAt: { type: Date, default: Date.now },

    /* ── Filled when a person settles it ──────────────────────────────── */
    paidAt: { type: Date, default: null },
    /* The bank's own transfer reference, typed by whoever made it. This is
       the only thread between this row and the money actually leaving, so it
       is required by the route that sets `paid` rather than optional here —
       a row marked paid with no reference is a claim nobody can check. */
    reference: { type: String, default: '', trim: true },
    paidByAdminName: { type: String, default: '', trim: true },
    paidByAdminId: { type: String, default: '', trim: true },

    /* Why a request was refused, in words the owner is shown. */
    rejectionReason: { type: String, default: '', trim: true },
    rejectedAt: { type: Date, default: null },

    /* Free text from staff — a note about a partial transfer, a date the
       bank held it. Never shown to the owner. */
    internalNote: { type: String, default: '', trim: true },
  },
  { timestamps: true },
);

/* The staff queue reads by status, newest first. */
foodPayoutSchema.index({ status: 1, requestedAt: -1 });
/* An owner's own history, and the "do you already have one open" check. */
foodPayoutSchema.index({ restaurantId: 1, requestedAt: -1 });
foodPayoutSchema.index({ restaurantId: 1, status: 1 });

const FoodPayout = mongoose.models.FoodPayout
  || mongoose.model('FoodPayout', foodPayoutSchema, 'food_payouts');

module.exports = FoodPayout;
module.exports.PAYOUT_STATUSES = PAYOUT_STATUSES;
module.exports.makeFoodPayoutId = makeFoodPayoutId;
