/* ══════════════════════════════════════════════════════════════════════════
   `payment_events` — every Razorpay webhook we have already acted on.

   ## The gap this closes

   `razorpayWebhook.controller.js` verifies the HMAC over the raw body, so a
   forged event cannot get in. What it has not had is protection against a
   GENUINE event arriving twice — and Razorpay redelivers by design, for hours,
   whenever it does not get a 2xx quickly enough.

   Until now the only guard was the effect being idempotent by luck: the
   handler checks `if (payment.status === 'paid') return`. That happens to hold
   for a payment, because settling one twice is a no-op. It does NOT hold once
   a webhook can move money OUT — a redelivered `transfer.processed` that ran
   twice would be two releases of one owner's share, and the second one would
   be real money.

   So the event id itself becomes the key. First writer wins; every redelivery
   after it is acknowledged and dropped before the handler runs.

   ## Why a collection and not an in-memory set

   The dispatch cascade's timers are in memory, per process, and
   `Backend/README.md` is explicit that this is survivable only because
   correctness does not depend on them. Correctness DOES depend on this one: a
   restart between two deliveries of the same event, or a second instance
   behind a load balancer, would let the duplicate through. It is a unique
   index in the database precisely so that neither can.

   ## Why it stores the outcome

   `status` is not needed to dedupe — the unique index does that alone. It is
   here because the question asked six weeks later is never "did we see this
   event", it is "why did nothing happen when this customer paid". An event
   recorded as `ignored` with a reason answers that; a bare id does not.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const paymentEventSchema = new mongoose.Schema(
  {
    /*
     * Razorpay's own event id (`evt_...`), taken from the `x-razorpay-event-id`
     * header rather than the body.
     *
     * The header is the delivery's identity and is stable across redeliveries
     * of the same event, which is exactly the property a dedupe key needs. A
     * payment id would not do: one payment legitimately produces several
     * events (`authorized`, `captured`), and keying on it would drop the
     * second real event as a duplicate of the first.
     */
    eventId: { type: String, required: true, unique: true, index: true },

    /** `payment.captured`, `payout.processed`, `payout.reversed`, … */
    event: { type: String, required: true, index: true },

    /**
     * Which product the event came from.
     *
     * Payment-gateway and RazorpayX events arrive at the same endpoint and are
     * signed with different secrets. Recorded so a question about payouts does
     * not have to be answered by pattern-matching event names.
     */
    source: { type: String, enum: ['payment', 'payout'], default: 'payment', index: true },

    /*
     * What we did about it.
     *
     *   processed   the handler ran and changed something
     *   ignored     genuine, verified, and not ours to act on — an event type
     *               this server does not handle, or one for a record that no
     *               longer exists
     *   failed      the handler threw. Kept so a human can find it; Razorpay
     *               will have been asked to retry, and the retry writes its
     *               own row only if this one was never committed.
     */
    status: {
      type: String,
      enum: ['processed', 'ignored', 'failed'],
      default: 'processed',
    },

    /** One line saying why, for the `ignored` and `failed` cases. */
    note: { type: String, default: '' },

    /* What it was about, when we could tell. Not a foreign key — an event may
       reference a record that has since been removed, and the row is still
       worth keeping. */
    visitRequestId: { type: String, default: null, index: true },
    paymentId: { type: String, default: null },
    /* Payout events. `settlementId` is what a person actually searches by when
       asking why a hotel was or was not paid. */
    payoutId: { type: String, default: null, index: true },
    settlementId: { type: String, default: null, index: true },

    processedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: 'payment_events' },
);

/*
 * Ninety days, then gone.
 *
 * A dedupe key only has to outlive the window in which a gateway will retry —
 * Razorpay's is hours, not months — and this collection would otherwise grow
 * without bound for the life of the platform. Ninety days is far past any
 * redelivery and still long enough to answer a question about last quarter.
 *
 * The financial record is `hotel_settlements` and the Razorpay dashboard;
 * neither is affected by this expiring.
 */
paymentEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

const PaymentEvent = mongoose.models.PaymentEvent
  || mongoose.model('PaymentEvent', paymentEventSchema);

/**
 * Claim an event id, or report that somebody already has it.
 *
 * Returns `true` when this caller is the first — and therefore the one that
 * should act — and `false` when the row already existed, which means a
 * redelivery. The claim is the INSERT itself rather than a read followed by a
 * write: two deliveries racing would both pass a `findOne` check, and only one
 * can win a unique index.
 *
 * A duplicate-key error is the expected outcome, not an exception to log.
 * Anything else is rethrown, because a database that cannot record the claim
 * must not be treated as permission to proceed.
 */
const claimEvent = async ({
  eventId, event, source = 'payment', visitRequestId = null, paymentId = null,
  payoutId = null, settlementId = null,
}) => {
  if (!eventId) {
    /* No id means no dedupe is possible. Letting it through is the right
       failure: the handlers' own guards still apply, and refusing a genuine,
       signature-verified event because a header was missing would lose a
       payment. Said out loud so it is visible if it ever becomes common. */
    console.warn(`[payment-events] "${event}" arrived with no event id — cannot dedupe it.`);
    return true;
  }

  try {
    await PaymentEvent.create({
      eventId, event, source, visitRequestId, paymentId, payoutId, settlementId,
    });
    return true;
  } catch (error) {
    if (error && error.code === 11000) return false;
    throw error;
  }
};

/** Record what became of an event we claimed. Never throws — it is a note. */
const noteEvent = async (eventId, status, note = '') => {
  if (!eventId) return;
  try {
    await PaymentEvent.updateOne({ eventId }, { $set: { status, note: String(note).slice(0, 400) } });
  } catch (error) {
    console.error('[payment-events] could not annotate', eventId, error.message);
  }
};

module.exports = { PaymentEvent, claimEvent, noteEvent };
