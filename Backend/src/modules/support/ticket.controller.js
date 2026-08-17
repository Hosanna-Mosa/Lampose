/* ══════════════════════════════════════════════════════════════════════════
   Support tickets and safety reports.

   Five handlers, all behind a customer session, all scoped to `req.customer`.
   Every lookup below filters on `customerId` as well as `reference` — never on
   the reference alone. The reference is short and readable BECAUSE it is read
   down a phone line, which is exactly what makes it a poor secret: guessing
   one must not be enough to read somebody else's deposit dispute.

   ## Creating a report is not creating a ticket

   They are separate endpoints rather than one endpoint with a `kind` in the
   body. A client that can name its own kind is a client that can put an
   allegation about a person into the support queue by sending the wrong
   string, and the whole point of the split is that the safety queue is not
   somewhere you arrive by accident.

   ## What the customer may write

   A message, and nothing else. Status, outcome, author and timestamps are all
   server-decided. The one status transition the app can cause is indirect and
   deliberate: replying to a ticket that was `awaiting_customer` moves it back
   to `open`, because the queue asked a question and it has now been answered.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const Ticket = require('./ticket.model');

const {
  TICKET_CATEGORIES,
  REPORT_REASONS,
  REPORT_MIN_CHARS,
  BODY_MAX_CHARS,
  makeReference,
} = Ticket;

const LIST_LIMIT = 50;

const dbDown = (res) => res.status(503).json({
  success: false,
  code: 'DB_DISCONNECTED',
  message: 'The server is running but not connected to the database.',
});

const badInput = (res, message) => res.status(400).json({
  success: false, code: 'BAD_INPUT', message,
});

const notFound = (res) => res.status(404).json({
  success: false,
  code: 'NOT_FOUND',
  /* Deliberately the same answer for "does not exist" and "is not yours".
     Telling the difference would turn the reference into an oracle for
     whether a given ticket exists. */
  message: 'We could not find that.',
});

/**
 * A headline from the first thing they typed.
 *
 * The list needs one line per row and the student was never asked for a
 * subject — asking would be a second field on a form somebody is filling in
 * while upset. So the first sentence becomes the title, cut at a word boundary
 * rather than mid-word, and the full text is still the first message.
 */
const subjectFrom = (body) => {
  const flat = String(body).replace(/\s+/g, ' ').trim();
  const firstSentence = flat.split(/(?<=[.!?])\s/)[0] || flat;
  if (firstSentence.length <= 90) return firstSentence;
  const cut = firstSentence.slice(0, 90);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trim()}…`;
};

/**
 * Saves a new document, retrying once on a reference collision.
 *
 * Six characters out of a 32-letter alphabet is about a billion, so a
 * collision is not something anybody will see — but `reference` is a unique
 * index and an unhandled 11000 would surface to a student as "we could not
 * send that" for a complaint they have just spent five minutes typing.
 */
const saveWithReference = async (doc, kind) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    doc.reference = makeReference(kind);
    try {
      return await doc.save();
    } catch (error) {
      const isDuplicate = error && error.code === 11000;
      if (!isDuplicate || attempt === 2) throw error;
    }
  }
  return null;
};

// @route   GET /api/v2/support/tickets
// @desc    This customer's tickets and reports, newest activity first
// @access  Customer session
const listTickets = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);

    /* Both kinds in one list. A student who filed a report is owed sight of
       it — "you will hear from us either way" is printed on the screen that
       sent it — and hiding it here would make the app look like it had been
       thrown away. What the two kinds do NOT share is the queue that reads
       them, and that is enforced on the staff side, not by omission here. */
    const tickets = await Ticket.find({ customerId: req.customer.customerId })
      .sort({ lastActivityAt: -1 })
      .limit(LIST_LIMIT);

    const data = tickets.map((ticket) => ticket.toPublicSummary());

    return res.json({
      success: true,
      count: data.length,
      unread: data.filter((entry) => entry.unread).length,
      data,
    });
  } catch (error) {
    return next(error);
  }
};

// @route   GET /api/v2/support/tickets/:reference
// @desc    One thread
// @access  Customer session (owner of the ticket only)
const getTicket = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);

    const ticket = await Ticket.findOne({
      reference: String(req.params.reference || '').toUpperCase(),
      customerId: req.customer.customerId,
    });
    if (!ticket) return notFound(res);

    return res.json({ success: true, data: ticket.toPublicDetail() });
  } catch (error) {
    return next(error);
  }
};

// @route   POST /api/v2/support/tickets
// @desc    Open a support ticket
// @access  Customer session
const createTicket = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);

    const { category, body, listingId, placeLabel } = req.body || {};

    if (!TICKET_CATEGORIES.includes(String(category || ''))) {
      return badInput(res, 'Please choose what this is about.');
    }

    const text = String(body || '').trim();
    if (!text) return badInput(res, 'Please tell us what happened.');
    if (text.length > BODY_MAX_CHARS) {
      return badInput(res, `Please keep this under ${BODY_MAX_CHARS} characters.`);
    }

    const customer = req.customer;
    const ticket = new Ticket({
      kind: 'ticket',
      customerId: customer.customerId,
      customerPhone: customer.phone,
      customerName: customer.name || '',
      category: String(category),
      listingId: listingId ? String(listingId) : null,
      placeLabel: placeLabel ? String(placeLabel).slice(0, 120) : '',
      subject: subjectFrom(text),
      status: 'open',
      messages: [{ author: 'customer', body: text, at: new Date() }],
      lastActivityAt: new Date(),
      /* Somebody has by definition read a thread they just wrote. Leaving the
         watermark null would be harmless here — the only message is their
         own, and `unread` ignores those — but it is set for the same reason
         it is set on a report below, where it is not harmless. */
      customerReadAt: new Date(),
    });

    await saveWithReference(ticket, 'ticket');

    return res.status(201).json({ success: true, data: ticket.toPublicDetail() });
  } catch (error) {
    return next(error);
  }
};

// @route   POST /api/v2/support/reports
// @desc    File a safety report — a different queue, and a different bar
// @access  Customer session
const createReport = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);

    const { reason, body, listingId, placeLabel } = req.body || {};

    if (!REPORT_REASONS.includes(String(reason || ''))) {
      return badInput(res, 'Please choose what is happening.');
    }

    const text = String(body || '').trim();

    /*
     * The 50-character floor is enforced here as well as on the form.
     *
     * Not because the app cannot be trusted to disable its own button, but
     * because this is the one record in the system that may end up in front of
     * somebody arbitrating a deposit. "Owner is bad" is not investigable, and
     * a report that cannot be investigated is worse than none — it consumes
     * the safety queue's time and tells the student they were heard.
     */
    if (text.length < REPORT_MIN_CHARS) {
      return badInput(
        res,
        `Please give us a little more — at least ${REPORT_MIN_CHARS} characters. Dates, amounts and exact words are what make a report investigable.`,
      );
    }
    if (text.length > BODY_MAX_CHARS) {
      return badInput(res, `Please keep this under ${BODY_MAX_CHARS} characters.`);
    }

    const customer = req.customer;
    const report = new Ticket({
      kind: 'report',
      customerId: customer.customerId,
      customerPhone: customer.phone,
      customerName: customer.name || '',
      reason: String(reason),
      listingId: listingId ? String(listingId) : null,
      placeLabel: placeLabel ? String(placeLabel).slice(0, 120) : '',
      subject: subjectFrom(text),
      status: 'open',
      messages: [
        { author: 'customer', body: text, at: new Date() },
        /*
         * The promise the screen made, written into the record at the moment
         * it was made.
         *
         * The report screen tells somebody the owner is not informed until we
         * have looked. That is the sentence they weighed retaliation against
         * before pressing the button, and it belongs in the thread they can
         * reopen at 2am rather than only on the form they have now left.
         */
        {
          author: 'system',
          body: 'This has gone to our safety team, not to the owner. She is not told you filed it until we have looked into it. Someone reads every report, and you will hear from us either way.',
          at: new Date(),
        },
      ],
      lastActivityAt: new Date(),
      /*
       * Load bearing on a report, unlike on a ticket.
       *
       * `unread` is "something written by somebody other than the customer,
       * since they last looked", and the system line above is written by
       * somebody other than the customer. Without a watermark here, a report
       * would come back unread to the person who filed it three seconds ago —
       * a badge on the support tab, a bold row, and an alert about a message
       * they are being shown on the very next screen.
       */
      customerReadAt: new Date(),
    });

    await saveWithReference(report, 'report');

    return res.status(201).json({ success: true, data: report.toPublicDetail() });
  } catch (error) {
    return next(error);
  }
};

// @route   POST /api/v2/support/tickets/:reference/messages
// @desc    Add a reply to a thread
// @access  Customer session (owner of the ticket only)
const replyToTicket = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);

    const text = String((req.body || {}).body || '').trim();
    if (!text) return badInput(res, 'Please write something first.');
    if (text.length > BODY_MAX_CHARS) {
      return badInput(res, `Please keep this under ${BODY_MAX_CHARS} characters.`);
    }

    const ticket = await Ticket.findOne({
      reference: String(req.params.reference || '').toUpperCase(),
      customerId: req.customer.customerId,
    });
    if (!ticket) return notFound(res);

    /*
     * A closed thread does not silently swallow a reply.
     *
     * Appending to it would put a message somewhere nobody is looking and show
     * the student a sent bubble for it. Refusing says so, and the app offers a
     * new ticket instead.
     */
    if (ticket.status === 'closed') {
      return res.status(409).json({
        success: false,
        code: 'TICKET_CLOSED',
        message: 'This one is closed. Please open a new request and we will pick it up there.',
      });
    }

    const now = new Date();
    ticket.messages.push({ author: 'customer', body: text, at: now });
    ticket.lastActivityAt = now;

    /* The queue asked something and it has now been answered, so it goes back
       into the pile. A resolved ticket that the student replies to is reopened
       for the same reason — they are telling us it was not resolved. */
    if (ticket.status === 'awaiting_customer' || ticket.status === 'resolved') {
      ticket.status = 'open';
    }

    /* They have just written in it, so by definition they have read it. */
    ticket.customerReadAt = now;

    await ticket.save();

    return res.status(201).json({ success: true, data: ticket.toPublicDetail() });
  } catch (error) {
    return next(error);
  }
};

// @route   POST /api/v2/support/tickets/:reference/read
// @desc    Move this customer's read watermark on one thread
// @access  Customer session (owner of the ticket only)
const markTicketRead = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);

    /*
     * Its own endpoint rather than a side effect of the GET.
     *
     * A read request that quietly mutates the account is the thing
     * `saved.controller.js` refuses to do, and for the same reason: a prefetch,
     * a retry or a React Query refetch would then clear an unread mark nobody
     * ever looked at.
     */
    const ticket = await Ticket.findOne({
      reference: String(req.params.reference || '').toUpperCase(),
      customerId: req.customer.customerId,
    });
    if (!ticket) return notFound(res);

    ticket.customerReadAt = new Date();
    await ticket.save();

    return res.json({ success: true, data: ticket.toPublicSummary() });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listTickets,
  getTicket,
  createTicket,
  createReport,
  replyToTicket,
  markTicketRead,
};
