/* ══════════════════════════════════════════════════════════════════════════
   The alerts screen, derived rather than stored.

   ## Why there is no `notifications` collection

   A notification is a record of something that happened. Everything that
   happens to a customer in this system already IS a record — a VisitRequest
   with a status and a decision timestamp — and writing a second row every
   time one changes buys nothing except two sources of truth that can drift.
   An owner replies AVAILABLE, the request flips to `confirmed`, and the alert
   for it is that fact read out loud. There is nothing to keep in step.

   The cost is that alerts cannot outlive what they describe and cannot be
   individually dismissed. Both are acceptable while visit requests are the
   only thing that happens to a customer. Neither is acceptable once payments
   or bookings exist, and at that point this becomes a real collection fed by
   whatever writes those.

   ## What it deliberately does not invent

   The fixtures this replaces had rent falling due, deposits refunded and
   support replies — a whole tenancy's worth of activity. None of it exists:
   there is no rent ledger, no refund, and no ticketing system. So the money
   variant of the row (`money: true`) is never produced here, because there is
   not one honest money event to put in it.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const config = require('../../config/env');
const VisitRequest = require('../visits/visitRequest.model');

const dbDown = (res) => res.status(503).json({
  success: false,
  code: 'DB_DISCONNECTED',
  message: 'The server is running but not connected to the database.',
});

/**
 * Every alert a single visit request is worth, newest last.
 *
 * A request produces up to two: one when it reached the owner, and one when
 * they answered. The `otp_pending` stage produces none — the code is in the
 * customer's hand, they are looking at the screen that asked for it, and an
 * alert about it would be the app telling somebody what they are currently
 * doing.
 */
const alertsFor = (doc) => {
  const alerts = [];
  const owner = doc.ownerName || 'The owner';
  const place = doc.propertyName || 'a property';
  const sharing = doc.sharing && doc.sharing.label ? ` (${doc.sharing.label})` : '';

  /* The two channels quote different deadlines because they HAVE different
     deadlines — a guest's owner answers on WhatsApp within a day, an app
     owner has minutes. One sentence for both would be wrong for one of
     them. */
  const isApp = doc.channel === 'app';
  const window = isApp
    ? `${config.booking.expiryMinutes} minutes`
    : '24 hours';

  if (doc.phoneVerifiedAt) {
    alerts.push({
      id: `${doc._id}:sent`,
      kind: 'visit',
      title: `Request sent to ${owner}`,
      body: `We asked about ${place}${sharing}. They have ${window} to reply.`,
      at: doc.phoneVerifiedAt,
      listingId: doc.listingId,
      requestId: String(doc._id),
    });
  }

  if (doc.status === 'confirmed' && doc.decidedAt) {
    alerts.push({
      id: `${doc._id}:confirmed`,
      /* `owner` rather than `visit`: the row's glyph set gives this one the
         person icon, which is the right shape for "somebody answered you". */
      kind: 'owner',
      title: `${owner} confirmed`,
      body: `${place}${sharing} is available. Open the request to finish it.`,
      at: doc.decidedAt,
      listingId: doc.listingId,
      requestId: String(doc._id),
    });
  }

  if (doc.status === 'declined' && doc.decidedAt) {
    /* A decline the owner made, and one the last bed forced, are different
       facts. Telling a student "the owner said no" when somebody else was
       simply faster is both untrue and the difference between "look
       elsewhere" and "try again in a minute". */
    const taken = doc.decisionReason === 'INVENTORY_TAKEN';

    alerts.push({
      id: `${doc._id}:declined`,
      kind: 'owner',
      /* Not "you were rejected". Availability is a fact about a building on a
         given day, and a student who reads a full house as a personal
         rejection is a student who stops sending requests. */
      title: taken ? `That room went at ${place}` : `Nothing free at ${place}`,
      body: taken
        ? `The last ${doc.sharing && doc.sharing.label ? doc.sharing.label.toLowerCase() : 'bed'} went while you were waiting. Nothing was charged.`
        : `${owner} says ${sharing ? `${doc.sharing.label} is` : 'it is'} not available at the moment. Nothing was charged.`,
      at: doc.decidedAt,
      listingId: doc.listingId,
      requestId: String(doc._id),
    });
  }

  /* The student walked away. Worth a row so the inbox does not simply lose a
     request they remember sending — and so "did I cancel that?" has an
     answer that is not a guess. */
  if (doc.status === 'cancelled' && doc.cancelledAt) {
    alerts.push({
      id: `${doc._id}:cancelled`,
      kind: 'visit',
      title: `You cancelled your request`,
      body: `${place}${sharing} — nothing was charged, and you can ask again.`,
      at: doc.cancelledAt,
      listingId: doc.listingId,
      requestId: String(doc._id),
    });
  }

  if (doc.status === 'expired') {
    alerts.push({
      id: `${doc._id}:expired`,
      kind: 'visit',
      title: `No answer about ${place}`,
      body: `${owner} did not reply within ${window}, so the request closed itself. Nothing was charged — you can ask again.`,
      at: doc.decidedAt || doc.expiresAt,
      listingId: doc.listingId,
      requestId: String(doc._id),
    });
  }

  return alerts.filter((alert) => alert.at);
};

// @route   GET /api/v2/customers/notifications
// @desc    This customer's alerts, newest first
// @access  Customer session
const getNotifications = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);

    const customer = req.customer;

    /* Matched on the phone, because that is what a visit request records —
       it is a public endpoint and has never had a customer id to store. It
       is also the account identifier, so the two cannot disagree.

       Capped rather than unbounded: this screen is read from the top and a
       customer with two years of requests does not need all of them in one
       response. */
    const requests = await VisitRequest.find({ 'customer.phone': customer.phone })
      .sort({ createdAt: -1 })
      .limit(100);

    const readAt = customer.notificationsReadAt ? customer.notificationsReadAt.getTime() : 0;

    const notifications = requests
      .flatMap(alertsFor)
      .sort((a, b) => new Date(b.at) - new Date(a.at))
      .map((alert) => ({
        ...alert,
        at: new Date(alert.at).toISOString(),
        /* Derived from the watermark, so it is the same answer on every
           device this account is signed in on. */
        unread: new Date(alert.at).getTime() > readAt,
      }));

    return res.json({
      success: true,
      count: notifications.length,
      unread: notifications.filter((n) => n.unread).length,
      data: notifications,
    });
  } catch (error) {
    return next(error);
  }
};

// @route   POST /api/v2/customers/notifications/read
// @desc    Mark everything up to now as read
// @access  Customer session
const markNotificationsRead = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);

    /* `now`, not the newest alert's timestamp. An owner replying while the
       request is in flight should stay unread — the customer has not seen
       that one, and marking it read because it arrived a second before the
       button was pressed is how a confirmation goes unnoticed. */
    req.customer.notificationsReadAt = new Date();
    await req.customer.save();

    return res.json({
      success: true,
      data: { notificationsReadAt: req.customer.notificationsReadAt.toISOString() },
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = { getNotifications, markNotificationsRead };
