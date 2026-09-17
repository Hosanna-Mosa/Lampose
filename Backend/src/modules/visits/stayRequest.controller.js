/* ══════════════════════════════════════════════════════════════════════════
   The student's side of a stay request: send, watch, withdraw.

   Thin on purpose. Every rule lives in `stayRequest.service.js` — these four
   handlers translate HTTP into a service call and a service error into a
   status code, and contain no business logic of their own. The reason is not
   tidiness: the same transitions are called by the owner's routes and by the
   expiry worker, and a rule that lived in a controller would apply to one
   caller and silently not to the others.

   ## What the session decides, and what the body may say

   The body names a LISTING and a ROOM TYPE. It does not name the student —
   `req.customer` does, and every query is scoped on `customerId` rather than
   on a phone number, because a phone number is a string anybody can send and
   these endpoints end somebody else's request.

   ## Every read settles an overdue request on the way past

   A GET that finds a pending request whose deadline has gone flips it before
   answering, so a screen never renders a wait that is already over. The
   NOTIFICATION for that expiry is the worker's job, not this one's — a read
   is not an event, and pushing from here would fire an expiry notice at the
   moment somebody happened to open the app.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const VisitRequest = require('./visitRequest.model');
const {
  StayRequestError, createStayRequest, withdraw, confirmMoveIn, settleIfExpired,
} = require('./stayRequest.service');
const {
  notifyOwnerOfNewRequest, notifyOwnerOfWithdrawal,
} = require('../notifications/stayRequest.notifier');

/*
 * Notifications are fired and NOT awaited.
 *
 * The transition has already committed and the client is waiting for its
 * answer. Awaiting a push gateway would put its latency — and its outages —
 * in front of a screen whose entire promise is that it responds in the first
 * of three minutes. The notifier swallows its own failures, so the only thing
 * that can arrive here is a programming error, which is logged.
 */
const fireAndForget = (promise) => {
  Promise.resolve(promise).catch((error) => {
    console.error('[stay-request] notification failed:', error.message);
  });
};

/**
 * A service refusal becomes a response.
 *
 * `StayRequestError` carries its own status and machine code because the app
 * branches on the code; anything else is a bug and goes to the shared error
 * handler, which does not leak database messages to a client.
 */
const fail = (res, error, next) => {
  if (error instanceof StayRequestError) {
    return res.status(error.status).json({
      success: false,
      code: error.code,
      message: error.message,
    });
  }
  return next(error);
};

/**
 * The move-in state, folded onto a confirmed request.
 *
 * The student has no bookings endpoint — the request is their only handle on
 * any of this — so this has to reach them through it. One extra read, and only
 * on a request that has a booking: a pending one has nothing to say and is the
 * one being polled every three seconds.
 *
 * ## It is one confirmation now, not two
 *
 * The owner typing the student's entry code IS the move-in — see
 * `checkInBooking`. So `complete` is read off the owner's stamp alone, and
 * `awaitingStudent` is permanently false.
 *
 * Both fields are kept rather than removed. `awaitingStudent` is read by the
 * customer app's ongoing strip and its booking screen, and an app already on
 * a phone will keep asking for it for as long as that build is installed —
 * a field that vanishes from the response turns into `undefined` on a screen
 * that expected a boolean. It reports false, which is true: there is nothing
 * the student is being waited on for.
 *
 * Reading `complete` off the owner's stamp is also what settles the bookings
 * that were mid-flight when this changed. A student whose owner had marked
 * them in, and who never tapped the button that has now gone, is moved in —
 * which is both what the record should say and what actually happened.
 */
const withMoveIn = async (request) => {
  const view = request.toPublic();
  if (!request.bookingId) return view;

  try {
    const { PartnerBooking } = require('../partners/partnerDomains.model');
    const booking = await PartnerBooking.findById(request.bookingId)
      .select('movedInByOwnerAt movedInByStudentAt status')
      .lean();
    if (!booking) return view;

    return {
      ...view,
      moveIn: {
        ownerConfirmedAt: booking.movedInByOwnerAt || null,
        studentConfirmedAt: booking.movedInByStudentAt || null,
        /* Nothing is waited on from the student any more — see above. */
        awaitingStudent: false,
        complete: Boolean(booking.movedInByOwnerAt),
      },
    };
  } catch (error) {
    /* A booking that could not be read is not a request that failed. The
       screen renders without the move-in block rather than erroring. */
    console.error('[stay-request] could not read the booking:', error.message);
    return view;
  }
};

// @route   POST /api/v2/customers/stay-requests
// @desc    Ask an owner for a bed. The owner is notified; nothing is charged.
// @access  Customer session
const createRequest = async (req, res, next) => {
  try {
    const body = req.body || {};

    const { request, couponRefusal } = await createStayRequest({
      customer: req.customer,
      listingId: body.listingId,
      sharing: body.sharing,
      intent: body.intent,
      consentedTerms: body.consentedTerms,
      /* The move-in reward they chose to spend, by id. An amount is never
         accepted from a client — the discount is applied to a total the
         server has just re-derived. See `paymentForNewRequest`. */
      couponId: body.couponId,
      /* Kept for rate limiting and abuse investigation only, and never
         projected back to any client. */
      requestIp: req.ip,
    });

    /* The owner's phone buzzes now. Three minutes is short enough that the
       difference between notifying here and notifying after the response is
       written is worth caring about. */
    fireAndForget(notifyOwnerOfNewRequest(request));

    /* 201, and the whole request rather than an id: the app draws a countdown
       the instant this returns, and a second round trip to fetch `expiresAt`
       would be a second trip during the only three minutes that matter. */
    /* `couponRefusal` rides along on the 201 rather than turning the booking
       into a 4xx. The request was created and the room is held; what failed
       is the ₹100, and the app says so on the confirmation screen instead of
       the student losing the booking over a discount. Null on the ordinary
       path — no coupon asked for, or one applied. */
    return res.status(201).json({
      success: true,
      data: request.toPublic(),
      couponRefusal: couponRefusal === 'NONE_REQUESTED' ? null : couponRefusal,
    });
  } catch (error) {
    return fail(res, error, next);
  }
};

// @route   GET /api/v2/customers/stay-requests/:id
// @desc    One request of this student's own. What the countdown screen polls.
// @access  Customer session
const getRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(404).json({
        success: false, code: 'NOT_FOUND', message: 'We could not find that request.',
      });
    }

    /* Scoped in the QUERY, not checked afterwards. A fetch by id alone is a
       route where changing one character reads another student's name, phone
       and the property they are moving into. */
    const found = await VisitRequest.findOne({ _id: id, customerId: req.customer.customerId });

    if (!found) {
      return res.status(404).json({
        success: false, code: 'NOT_FOUND', message: 'We could not find that request.',
      });
    }

    const request = await settleIfExpired(found);
    return res.json({ success: true, data: await withMoveIn(request) });
  } catch (error) {
    return fail(res, error, next);
  }
};

// @route   GET /api/v2/customers/stay-requests
// @desc    This student's requests, newest first
// @access  Customer session
const listRequests = async (req, res, next) => {
  try {
    /* Capped rather than unbounded: this list is read from the top, and a
       student with two years of requests does not need all of them at once. */
    const requests = await VisitRequest.find({ customerId: req.customer.customerId })
      .sort({ createdAt: -1 })
      .limit(50);

    /* Settled on the way past, so a list opened after the app was closed for
       an hour does not show a wait that ended fifty-nine minutes ago. */
    const settled = await Promise.all(requests.map((request) => settleIfExpired(request)));

    const data = await Promise.all(settled.map((request) => withMoveIn(request)));
    return res.json({
      success: true,
      count: data.length,
      /* The one the countdown screen cares about. There is at most one per
         listing, but a student may have several live across the catalogue. */
      active: data.filter((request) => request.status === 'pending_owner').length,
      data,
    });
  } catch (error) {
    return fail(res, error, next);
  }
};

// @route   POST /api/v2/customers/stay-requests/:id/withdraw
// @desc    Pull a pending request back. The owner is told.
// @access  Customer session
const withdrawRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(404).json({
        success: false, code: 'NOT_FOUND', message: 'We could not find that request.',
      });
    }

    const request = await withdraw(id, req.customer);

    /* The owner must stop expecting this student — and their copy of the
       request has to go non-actionable before they tap Accept on somebody who
       has already walked away. */
    fireAndForget(notifyOwnerOfWithdrawal(request));

    return res.json({ success: true, data: request.toPublic() });
  } catch (error) {
    return fail(res, error, next);
  }
};

// @route   POST /api/v2/customers/stay-requests/:id/moved-in
// @desc    The student's half of moving in. The owner confirms first.
// @access  Customer session
const confirmMovedIn = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(404).json({
        success: false, code: 'NOT_FOUND', message: 'We could not find that booking.',
      });
    }

    const { booking } = await confirmMoveIn(id, req.customer);

    return res.json({
      success: true,
      data: {
        bookingId: String(booking._id),
        status: booking.status,
        movedInByOwnerAt: booking.movedInByOwnerAt,
        movedInByStudentAt: booking.movedInByStudentAt,
        /* One flag rather than two comparisons on the screen. */
        movedIn: Boolean(booking.movedInByOwnerAt && booking.movedInByStudentAt),
      },
    });
  } catch (error) {
    return fail(res, error, next);
  }
};

module.exports = {
  createRequest, getRequest, listRequests, withdrawRequest, confirmMovedIn,
};
