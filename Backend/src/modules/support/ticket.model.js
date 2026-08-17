/* ══════════════════════════════════════════════════════════════════════════
   Support tickets and safety reports — the `app_support_tickets` collection.

   One collection, two kinds, and the difference between them is the reason
   this file exists rather than a `messages` array bolted onto a customer.

     ticket   a question about a thing. Goes to the support queue, the owner
              may be looped in, and it is measured in reply times.

     report   an allegation about a person. Goes to the safety queue, the
              owner is NOT told it exists until somebody has looked, and the
              listing may be suspended while they do.

   ## Why one collection and not two

   They share a shape exactly — a customer, a subject, a thread of messages, a
   status — and they differ in who reads them and what may be said to the
   owner. That is routing and policy, not structure. Two collections would
   duplicate the message subdocument, the read watermark and every query, and
   the first time somebody added a field to one and not the other the two
   screens showing them would quietly diverge.

   What must never happen is a report being handled AS a ticket, and `kind` is
   what prevents it: it is required, it is immutable after creation (see the
   pre-save hook), and every read path that could reach a queue filters on it.
   A flag can be ignored; an immutable required discriminator with an index on
   it is what the queue is actually built from.

   ## The customer never sets the status

   `status` and `outcome` are written by whoever works the queue, never by the
   app. The one thing a customer can do is add a message, and that moves a
   ticket from `awaiting_customer` back to `open` — see `ticket.controller.js`.
   Letting a client set its own status would let anybody mark their own deposit
   dispute resolved.

   ## What is deliberately absent

   Attachments. The report screen offers "Add photos or screenshots" and that
   button has never had a handler; wiring storage, virus scanning and signed
   URLs is its own piece of work and half of it — an `attachments` array that
   nothing can write to — would be worse than none. `hasEvidence` records that
   a reason REQUIRED evidence, so the queue can see which reports arrived
   without any and chase for it.
   ══════════════════════════════════════════════════════════════════════════ */
const crypto = require('crypto');

const mongoose = require('mongoose');

/** The six the app offers. Kept in step with `types/support.ts`. */
const TICKET_CATEGORIES = ['property', 'deposit', 'payment', 'owner', 'booking', 'other'];

/** The six the report screen offers, by the ids `data/support.ts` uses. */
const REPORT_REASONS = [
  'deposit-threat',
  'not-as-listed',
  'safety',
  'harassment',
  'extra-money',
  'discrimination',
];

/**
 * Reasons that cannot be investigated without something to look at.
 *
 * Mirrors `evidenceRequired` on the app's `reportReasons`. It is repeated here
 * rather than trusted from the request body for the ordinary reason: a client
 * that decides its own validation rules is a client that can turn them off.
 */
const EVIDENCE_REQUIRED_REASONS = ['deposit-threat', 'not-as-listed', 'extra-money'];

const STATUSES = ['open', 'awaiting_customer', 'resolved', 'closed'];

/** Long enough to be investigable, short enough not to be a wall. */
const REPORT_MIN_CHARS = 50;
const TICKET_MIN_CHARS = 1;
const BODY_MAX_CHARS = 4000;

const messageSchema = new mongoose.Schema(
  {
    /*
     * `system` is a first-class author, not a support message with a flag.
     *
     * A system line records what HAPPENED — "we asked Padma on 10 August, she
     * has 3 working days" — rather than what anyone said. The app draws it as
     * a rule rather than a bubble, because giving a process guarantee the
     * shape of speech lets it be mistaken for a person's reassurance, and
     * those are worth very different amounts on the 21st when the pump is
     * still not fitted.
     */
    author: { type: String, enum: ['customer', 'support', 'system'], required: true },

    /* A named human on the support side. "LAMPOSE Support" answers nobody, so
       the queue is expected to fill this in. Empty for customer and system. */
    authorName: { type: String, default: '', trim: true },

    body: { type: String, required: true, trim: true, maxlength: BODY_MAX_CHARS },
    at: { type: Date, default: Date.now },
  },
  { _id: true },
);

const ticketSchema = new mongoose.Schema(
  {
    /*
     * The public id — TKT-… or RPT-…, and the only id the app ever sees.
     *
     * Not the Mongo `_id`, for the reason `customerId` is not: this string is
     * read aloud to support over the phone, pasted into an email and printed
     * on a screen. A 24-character hex ObjectId is none of those things, and
     * the prefix means anybody looking at one knows immediately which queue it
     * belongs to without opening it.
     */
    reference: { type: String, required: true, unique: true, index: true },

    /*
     * Immutable after creation — see the pre-save hook. A report that could be
     * downgraded to a ticket by a later write is a report that leaves the
     * safety queue silently, which is the exact failure this field exists to
     * prevent.
     */
    kind: { type: String, enum: ['ticket', 'report'], required: true, index: true },

    /* `app_customers.customerId`, not the Mongo `_id`, matching what every
       other customer-owned record in this process stores. */
    customerId: { type: String, required: true, index: true },

    /* Denormalised so the queue can call somebody back without a second
       lookup, and so the record still reads correctly if the account is later
       renamed. Neither is used for auth — `customerId` is. */
    customerPhone: { type: String, default: '', trim: true },
    customerName: { type: String, default: '', trim: true },

    /* Tickets carry a category; reports carry a reason. Exactly one is set,
       enforced in the pre-validate hook below. */
    category: { type: String, enum: [...TICKET_CATEGORIES, null], default: null },
    reason: { type: String, enum: [...REPORT_REASONS, null], default: null },

    /* True when the reason chosen requires evidence. The attachment itself is
       not built yet; this is what lets the queue see, at a glance, which
       reports need chasing for a screenshot. */
    evidenceRequired: { type: Boolean, default: false },

    /* What it is about, where the student said. Both optional: "a payment" and
       "the app keeps signing me out" are about nothing in the catalogue.
       `listingId` is a string and never a populated ref — a property can be
       edited or removed and the complaint still has to say what was asked. */
    listingId: { type: String, default: null, index: true },
    placeLabel: { type: String, default: '', trim: true },

    /* The first line of the first message, trimmed to a headline. Stored
       rather than derived on read so the list query can project it without
       pulling every thread's full body across the wire. */
    subject: { type: String, required: true, trim: true, maxlength: 140 },

    status: { type: String, enum: STATUSES, default: 'open', index: true },

    /*
     * The OUTCOME, in the queue's own words — "Refunded ₹1,000", "Resolved ·
     * refund arrived 19 Mar".
     *
     * Separate from `status` because the status is for us and this is for the
     * student. A list of rows all reading "Resolved" is a list somebody has to
     * open one by one to learn anything from, and they will not — they will
     * open a second ticket about the same thing instead.
     *
     * Empty until somebody writes one; the app falls back to a plain word.
     */
    outcome: { type: String, default: '', trim: true, maxlength: 140 },

    messages: { type: [messageSchema], default: [] },

    /*
     * When the customer last opened this thread.
     *
     * A watermark rather than a per-message flag, matching how the alerts
     * screen already works: the question a list row asks is "is there anything
     * here I have not seen", and one timestamp answers it. Null means never
     * opened, which is why a brand-new ticket does not show as unread to the
     * person who just wrote it — see `toPublicSummary`, where unread requires
     * a non-customer message after the watermark.
     */
    customerReadAt: { type: Date, default: null },

    /* Sort key for the list. Denormalised off `messages` because sorting on
       the last element of a subdocument array is not something Mongo will use
       an index for. */
    lastActivityAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true, collection: 'app_support_tickets', strict: true },
);

/* The list query: this customer's items, newest activity first. */
ticketSchema.index({ customerId: 1, lastActivityAt: -1 });

/* The queue's query: everything open in one kind, oldest first — whoever is
   working the safety queue wants the report that has been waiting longest. */
ticketSchema.index({ kind: 1, status: 1, lastActivityAt: 1 });

/**
 * Exactly one of `category` / `reason`, matching `kind`.
 *
 * A ticket with a reason or a report with a category is a record that would
 * render wrong on the list and route wrong in the queue, and it is cheaper to
 * refuse it here than to find it later.
 */
ticketSchema.pre('validate', function enforceKindShape(next) {
  if (this.kind === 'ticket') {
    if (!this.category) return next(new Error('A ticket needs a category.'));
    this.reason = null;
    this.evidenceRequired = false;
  } else if (this.kind === 'report') {
    if (!this.reason) return next(new Error('A report needs a reason.'));
    this.category = null;
    this.evidenceRequired = EVIDENCE_REQUIRED_REASONS.includes(this.reason);
  }
  return next();
});

/** `kind` is set once, at creation, and never again. */
ticketSchema.pre('save', function freezeKind(next) {
  if (!this.isNew && this.isModified('kind')) {
    return next(new Error('A ticket cannot change kind after it is created.'));
  }
  return next();
});

/**
 * A short, unambiguous, human-readable reference.
 *
 * Base32-ish over a crypto random source rather than a counter: a counter
 * needs a second collection or a findAndModify on every create, and it leaks
 * how many complaints Lampose has received to anyone who files two.
 *
 * `I`, `O`, `0` and `1` are left out — this string gets read down a phone line
 * to somebody who then types it back.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const makeReference = (kind) => {
  const prefix = kind === 'report' ? 'RPT' : 'TKT';
  const bytes = crypto.randomBytes(6);
  let body = '';
  for (let i = 0; i < 6; i += 1) body += ALPHABET[bytes[i] % ALPHABET.length];
  return `${prefix}-${body}`;
};

/**
 * The row on the list screen.
 *
 * `unread` is computed rather than stored, and the condition is narrow on
 * purpose: something written by somebody OTHER than the customer, after the
 * last time they opened it. Without the author test, filing a ticket would
 * immediately mark it unread to the person who had just typed it.
 */
ticketSchema.methods.toPublicSummary = function toPublicSummary() {
  const last = this.messages.length ? this.messages[this.messages.length - 1] : null;
  const watermark = this.customerReadAt ? this.customerReadAt.getTime() : 0;

  const unread = this.messages.some(
    (message) => message.author !== 'customer' && new Date(message.at).getTime() > watermark,
  );

  return {
    reference: this.reference,
    kind: this.kind,
    category: this.category,
    reason: this.reason,
    subject: this.subject,
    placeLabel: this.placeLabel || '',
    listingId: this.listingId,
    status: this.status,
    outcome: this.outcome || '',
    unread,
    messageCount: this.messages.length,
    lastActivityAt: this.lastActivityAt,
    createdAt: this.createdAt,
    /* The last thing said, for the row's preview line. Trimmed here rather
       than in the app so the wire carries a preview, not a 4000-character
       body the list will never show. */
    lastMessagePreview: last ? String(last.body).slice(0, 160) : '',
  };
};

/** The thread. Everything the summary has, plus the messages themselves. */
ticketSchema.methods.toPublicDetail = function toPublicDetail() {
  return {
    ...this.toPublicSummary(),
    evidenceRequired: this.evidenceRequired,
    messages: this.messages.map((message) => ({
      id: String(message._id),
      author: message.author,
      authorName: message.authorName || '',
      body: message.body,
      at: message.at,
    })),
  };
};

module.exports = mongoose.models.SupportTicket
  || mongoose.model('SupportTicket', ticketSchema);

module.exports.TICKET_CATEGORIES = TICKET_CATEGORIES;
module.exports.REPORT_REASONS = REPORT_REASONS;
module.exports.EVIDENCE_REQUIRED_REASONS = EVIDENCE_REQUIRED_REASONS;
module.exports.STATUSES = STATUSES;
module.exports.REPORT_MIN_CHARS = REPORT_MIN_CHARS;
module.exports.TICKET_MIN_CHARS = TICKET_MIN_CHARS;
module.exports.BODY_MAX_CHARS = BODY_MAX_CHARS;
module.exports.makeReference = makeReference;
