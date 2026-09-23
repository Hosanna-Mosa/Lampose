/* ══════════════════════════════════════════════════════════════════════════
   `deletion` — the one shape of "this person asked us to delete their account".

   Embedded in all four self-serve identities: `app_customers`, `app_partners`,
   `food_restaurants` and `app_drivers`. One definition so the admin console,
   the website and four apps read one set of words.

   A REQUEST, not the deletion. Google Play and the App Store both require a
   way to ask for this — from inside the app, and (Play) from the open web
   without signing in. What either route writes is a dated request; the row
   itself stays until the grace period has passed and whatever is owed has
   been settled:

     · A rider mid-delivery has somebody's dinner on their bike, and a kitchen
       mid-service has a queue of paid orders.
     · Payouts and refunds owed have to be paid, and the records proving they
       were are books of account the law requires us to keep.
     · A tap made in anger at 11pm is one people ask us to undo the next
       morning, and `scheduledFor` is the window in which we still can.

   `status` here is the REQUEST's, never the account's — the account's own
   `status` stays whatever an administrator set it to. "Suspended" and "asked
   to leave" are different questions and must not become one word.
   ══════════════════════════════════════════════════════════════════════════ */

const DELETION_STATUSES = ['none', 'requested', 'cancelled', 'completed'];
const DELETION_SOURCES = ['', 'web', 'app', 'support'];

/** A plain definition (not a sub-Schema) so each model embeds it verbatim. */
const deletionField = () => ({
  status: {
    type: String,
    enum: DELETION_STATUSES,
    default: 'none',
    index: true,
  },
  requestedAt: { type: Date, default: null },
  /* When the request becomes eligible to be carried out. */
  scheduledFor: { type: Date, default: null },
  cancelledAt: { type: Date, default: null },
  processedAt: { type: Date, default: null },
  /* Optional free text. Trimmed and capped because it is printed in a console. */
  reason: { type: String, default: '', trim: true, maxlength: 500 },
  /* Where to write back about the request, when they gave one. Kept apart from
     the account's own email: somebody may ask from an address they never
     registered, and overwriting the registered one would be an unverified
     change to the account they are leaving. */
  contactEmail: { type: String, default: '', lowercase: true, trim: true },
  /* `web` (the public page), `app` (signed in), `support` (by hand). */
  source: { type: String, enum: DELETION_SOURCES, default: '' },
});

module.exports = { deletionField, DELETION_STATUSES, DELETION_SOURCES };
