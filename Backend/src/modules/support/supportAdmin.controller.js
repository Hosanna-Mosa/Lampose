/* ══════════════════════════════════════════════════════════════════════════
   The support queue, as the console works it.

   The counterpart to `ticket.controller.js`: that file is scoped to one
   requester and can only ever see their own threads, this one sees every
   thread and is scoped to nothing. That asymmetry is the reason they are two
   files rather than one with a role flag — a single handler that decides
   between "yours" and "everyone's" from a variable is one inverted condition
   away from serving everyone's to a student.

   ## What the queue may write, and what it may not

   It may reply, set a status, write an outcome, set a priority and claim a
   ticket. It may NOT change `kind`, edit or delete a message, or alter who
   filed it. A report cannot be turned into a ticket (the model refuses), and
   an admin cannot put words in a requester's mouth: `author` is decided here,
   never accepted from the body.

   Deletion is deliberately absent. A support thread is the record of a
   complaint, and a complaint the complained-about can erase is not a record.
   `closed` is what "we are done with this" means, and it is reversible.

   ## Status transitions are named, not free

   Replying moves an `open` ticket to `awaiting_customer`, because that is what
   a reply usually means — the ball is with them. It does not move a
   `resolved` one back, and it never touches `closed`. Anything else is an
   explicit call to `updateTicket`, so a status only changes when somebody
   either meant it or did the thing it describes.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const Ticket = require('./ticket.model');
const notifier = require('./support.notifier');
const { AUDIENCES, REQUESTER_KINDS } = require('./support.audiences');

const { STATUSES, BODY_MAX_CHARS } = Ticket;

const PAGE_SIZE = 40;
const MAX_PAGE_SIZE = 100;

const dbDown = (res) => res.status(503).json({
  success: false,
  code: 'DB_DISCONNECTED',
  message: 'The server is running but not connected to the database.',
});

const badInput = (res, message) => res.status(400).json({
  success: false, code: 'BAD_INPUT', message, error: message,
});

const notFound = (res) => res.status(404).json({
  success: false, code: 'NOT_FOUND', message: 'No such ticket.', error: 'No such ticket.',
});

/** Escape a user's search string so it cannot act as a regex. */
const literal = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Turn the query string into a mongo filter.
 *
 * Every clause is optional and every one of them is validated against a known
 * list rather than passed through — a filter built from raw query parameters
 * is a filter somebody can send `{$ne: null}` to.
 */
const filterFrom = (query, admin) => {
  const filter = {};

  /* Which app it came from. */
  const audience = String(query.audience || '').trim();
  if (REQUESTER_KINDS.includes(audience)) filter['requester.kind'] = audience;

  /* Ticket or report — the two queues. */
  const kind = String(query.kind || '').trim();
  if (kind === 'ticket' || kind === 'report') filter.kind = kind;

  const status = String(query.status || '').trim();
  if (STATUSES.includes(status)) filter.status = status;
  /* The default view is work still to do, not everything ever filed. A queue
     that opens on 4,000 closed threads is a queue nobody scrolls. */
  else if (status === 'active') filter.status = { $in: ['open', 'awaiting_customer'] };

  const priority = String(query.priority || '').trim();
  if (['low', 'normal', 'high', 'urgent'].includes(priority)) filter.priority = priority;

  /* Mine, nobody's, or a named colleague's. */
  const assigned = String(query.assigned || '').trim();
  if (assigned === 'me') filter.assignedToId = String(admin._id);
  else if (assigned === 'unassigned') filter.assignedToId = null;
  else if (assigned && assigned !== 'any') filter.assignedToId = assigned;

  /*
   * Search across the four things somebody actually types into it: the
   * reference off a phone call, the subject, who filed it, and their number.
   *
   * Anchored on the reference with `^` so "TKT-K4" narrows rather than
   * scanning every subject for the substring, and the input is escaped so a
   * stray `(` is a character rather than a syntax error.
   */
  const q = String(query.q || '').trim();
  if (q) {
    const rx = new RegExp(literal(q), 'i');
    filter.$or = [
      { reference: new RegExp(`^${literal(q)}`, 'i') },
      { subject: rx },
      { 'requester.name': rx },
      { 'requester.phone': rx },
      { orderNumber: new RegExp(`^${literal(q)}`, 'i') },
    ];
  }

  return filter;
};

// @route   GET /api/v1/admin/support/tickets
// @desc    The queue
// @access  Any signed-in administrator
const listTickets = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);

    const filter = filterFrom(req.query, req.admin);

    const limit = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Number(req.query.limit) || PAGE_SIZE),
    );
    const page = Math.max(1, Number(req.query.page) || 1);

    /*
     * Oldest activity first when looking at open work, newest first otherwise.
     *
     * The queue's question is "who has been waiting longest", and a list sorted
     * newest-first answers the opposite one — it buries the person who has been
     * waiting three days under everybody who wrote in this morning. Browsing
     * closed threads is a different activity and wants the usual order.
     */
    const active = !filter.status || filter.status.$in;
    const sort = active ? { lastActivityAt: 1 } : { lastActivityAt: -1 };

    const [rows, total] = await Promise.all([
      Ticket.find(filter).sort(sort).skip((page - 1) * limit).limit(limit),
      Ticket.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      count: rows.length,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      data: rows.map((row) => row.toAdminSummary()),
    });
  } catch (error) {
    return next(error);
  }
};

// @route   GET /api/v1/admin/support/stats
// @desc    The numbers on top of the queue
// @access  Any signed-in administrator
const getStats = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);

    const active = { status: { $in: ['open', 'awaiting_customer'] } };

    const [byAudience, byStatus, reports, unassigned, mine] = await Promise.all([
      Ticket.aggregate([
        { $match: active },
        { $group: { _id: '$requester.kind', n: { $sum: 1 } } },
      ]),
      Ticket.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
      /* Open safety reports, called out separately because they are the ones
         with a clock on them that nobody else is watching. */
      Ticket.countDocuments({ ...active, kind: 'report' }),
      Ticket.countDocuments({ ...active, assignedToId: null }),
      Ticket.countDocuments({ ...active, assignedToId: String(req.admin._id) }),
    ]);

    const tally = (rows) => rows.reduce((acc, row) => {
      acc[row._id || 'unknown'] = row.n;
      return acc;
    }, {});

    /* Every audience present in the answer even at zero, so the console can
       draw a stable row of chips rather than one that changes width as
       tickets arrive. */
    const audiences = tally(byAudience);
    REQUESTER_KINDS.forEach((kind) => {
      if (typeof audiences[kind] !== 'number') audiences[kind] = 0;
    });

    return res.json({
      success: true,
      data: {
        audiences,
        statuses: tally(byStatus),
        openReports: reports,
        unassigned,
        mine,
        /* So the console can label its filters without a second source of
           truth for what a "Rider" is called. */
        audienceLabels: Object.fromEntries(
          REQUESTER_KINDS.map((kind) => [kind, AUDIENCES[kind].label]),
        ),
      },
    });
  } catch (error) {
    return next(error);
  }
};

// @route   GET /api/v1/admin/support/tickets/:reference
// @desc    One thread, in full
// @access  Any signed-in administrator
const getTicket = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);

    const ticket = await Ticket.findOne({
      reference: String(req.params.reference || '').toUpperCase(),
    });
    if (!ticket) return notFound(res);

    return res.json({ success: true, data: ticket.toAdminDetail() });
  } catch (error) {
    return next(error);
  }
};

// @route   POST /api/v1/admin/support/tickets/:reference/messages
// @desc    Answer somebody
// @access  Support roles
const replyToTicket = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);

    const text = String((req.body || {}).body || '').trim();
    if (!text) return badInput(res, 'Write something first.');
    if (text.length > BODY_MAX_CHARS) {
      return badInput(res, `Keep this under ${BODY_MAX_CHARS} characters.`);
    }

    const ticket = await Ticket.findOne({
      reference: String(req.params.reference || '').toUpperCase(),
    });
    if (!ticket) return notFound(res);

    const now = new Date();

    /*
     * A NAMED human, from the session.
     *
     * "LAMPOSE Support" answers nobody. A student chasing a deposit for three
     * weeks who gets four replies from four different people, all signed the
     * same way, cannot tell whether anyone is actually holding it — and the
     * name is taken from the admin's own account rather than the request body
     * so it cannot be typed in as somebody else.
     */
    ticket.messages.push({
      author: 'support',
      authorName: req.admin.name || 'Lampose Support',
      body: text,
      at: now,
    });
    ticket.lastActivityAt = now;
    ticket.supportReadAt = now;

    /*
     * A reply usually means the ball is with them.
     *
     * `open` → `awaiting_customer`, and nothing else moves. A `resolved`
     * thread that somebody adds a note to stays resolved; a `closed` one stays
     * closed. Overriding those from a reply would silently reopen work that
     * was finished, and the queue would grow every time somebody said thanks.
     */
    if (ticket.status === 'open' && req.body.hold !== true) {
      ticket.status = 'awaiting_customer';
    }

    /* Answering something nobody owns claims it. Two people answering the same
       rider in the same minute with different answers is worse than a slow
       reply, and this is the cheapest moment to prevent it. */
    if (!ticket.assignedToId) {
      ticket.assignedToId = String(req.admin._id);
      ticket.assignedToName = req.admin.name || '';
    }

    await ticket.save();

    notifier.messageAdded(ticket, ticket.messages[ticket.messages.length - 1]);

    return res.status(201).json({ success: true, data: ticket.toAdminDetail() });
  } catch (error) {
    return next(error);
  }
};

// @route   PATCH /api/v1/admin/support/tickets/:reference
// @desc    Status, outcome, priority — and a system line saying what changed
// @access  Support roles
const updateTicket = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);

    const ticket = await Ticket.findOne({
      reference: String(req.params.reference || '').toUpperCase(),
    });
    if (!ticket) return notFound(res);

    const { status, outcome, priority } = req.body || {};
    const changes = [];

    if (status !== undefined) {
      if (!STATUSES.includes(String(status))) {
        return badInput(res, `Status must be one of: ${STATUSES.join(', ')}.`);
      }
      if (String(status) !== ticket.status) {
        changes.push(`status ${ticket.status} → ${status}`);
        ticket.status = String(status);
      }
    }

    if (outcome !== undefined) {
      const text = String(outcome).trim().slice(0, 140);
      if (text !== ticket.outcome) {
        changes.push('outcome');
        ticket.outcome = text;
      }
    }

    if (priority !== undefined) {
      if (!['low', 'normal', 'high', 'urgent'].includes(String(priority))) {
        return badInput(res, 'Priority must be low, normal, high or urgent.');
      }
      if (String(priority) !== ticket.priority) {
        changes.push(`priority ${ticket.priority} → ${priority}`);
        ticket.priority = String(priority);
      }
    }

    if (!changes.length) {
      return res.json({ success: true, data: ticket.toAdminDetail(), changed: false });
    }

    /*
     * Resolving or closing writes a SYSTEM line into the thread.
     *
     * Not a support message — nobody said it — and the app draws the two
     * differently for a reason stated in the model: giving a process event the
     * shape of speech lets it be mistaken for a person's reassurance. But it
     * does belong in the thread, because a student who opens a two-week-old
     * dispute and finds it marked resolved with no line saying when or by whom
     * has to ask us the question they can already see the answer to.
     *
     * Only for the two endings. A priority change is our business, not theirs.
     */
    const ending = ticket.status === 'resolved' || ticket.status === 'closed';
    if (ending && changes.some((change) => change.startsWith('status'))) {
      ticket.messages.push({
        author: 'system',
        body: ticket.outcome
          ? `Marked ${ticket.status} by ${req.admin.name || 'support'} — ${ticket.outcome}`
          : `Marked ${ticket.status} by ${req.admin.name || 'support'}.`,
        at: new Date(),
      });
      ticket.lastActivityAt = new Date();
    }

    await ticket.save();

    notifier.ticketUpdated(ticket);

    return res.json({ success: true, data: ticket.toAdminDetail(), changed: true });
  } catch (error) {
    return next(error);
  }
};

// @route   POST /api/v1/admin/support/tickets/:reference/assign
// @desc    Claim it, hand it over, or drop it
// @access  Support roles
const assignTicket = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);

    const ticket = await Ticket.findOne({
      reference: String(req.params.reference || '').toUpperCase(),
    });
    if (!ticket) return notFound(res);

    /*
     * Three shapes, and the body says which:
     *
     *   {}                    claim it myself — the common case, one click
     *   { adminId: null }     put it back in the pile
     *   { adminId, name }     hand it to a named colleague
     *
     * A handover takes the name from the body because the console already has
     * the roster and this handler would otherwise need a second lookup on the
     * hot path of a drag-and-drop. It is a LABEL, not authority — `assignedToId`
     * is what any filter matches on, and nothing anywhere grants permission
     * based on either field.
     */
    const body = req.body || {};

    if (Object.prototype.hasOwnProperty.call(body, 'adminId') && body.adminId === null) {
      ticket.assignedToId = null;
      ticket.assignedToName = '';
    } else if (body.adminId) {
      ticket.assignedToId = String(body.adminId);
      ticket.assignedToName = String(body.name || '').trim().slice(0, 80);
    } else {
      ticket.assignedToId = String(req.admin._id);
      ticket.assignedToName = req.admin.name || '';
    }

    await ticket.save();

    notifier.ticketUpdated(ticket);

    return res.json({ success: true, data: ticket.toAdminSummary() });
  } catch (error) {
    return next(error);
  }
};

// @route   POST /api/v1/admin/support/tickets/:reference/read
// @desc    Move the QUEUE's read watermark
// @access  Any signed-in administrator
const markRead = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);

    /* Its own endpoint rather than a side effect of the GET, exactly as on the
       app side: a refetch or a retry that silently cleared an unread mark
       would clear it for the whole team, not just the person who refetched. */
    const ticket = await Ticket.findOneAndUpdate(
      { reference: String(req.params.reference || '').toUpperCase() },
      { $set: { supportReadAt: new Date() } },
      { new: true },
    );
    if (!ticket) return notFound(res);

    return res.json({ success: true, data: ticket.toAdminSummary() });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listTickets,
  getStats,
  getTicket,
  replyToTicket,
  updateTicket,
  assignTicket,
  markRead,
};
