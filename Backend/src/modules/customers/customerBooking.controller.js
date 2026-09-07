/* ══════════════════════════════════════════════════════════════════════════
   The student's own bookings.

   The gap this closes: `PartnerBooking` was owner-scoped only, so everything
   an owner does AFTER confirming a request — assigning a room, checking the
   student in, checking them out, cancelling — was written to a row the student
   had no way to read. Their app could show them the stay REQUEST, which stops
   changing the moment it reaches `confirmed`, and nothing after it. A student
   whose owner cancelled a confirmed booking would have been looking at a
   screen that still said "Confirmed".

   Scoped on `customerId`, matching every other customer-side query, with a
   fallback to the verified phone so that a booking an owner keyed in by hand —
   a walk-in, someone who arrived without using the app — still reaches the
   person it is about. That fallback is a match on `verifiedPhone`, which the
   owner's guest-OTP step actually proved, and never on `guestPhone`, which is
   whatever they typed.
   ══════════════════════════════════════════════════════════════════════════ */
const { PartnerBooking, PartnerReview } = require('../partners/partnerDomains.model');
const { releaseBed, shareTypeIdForBooking } = require('../inventory/inventory.service');
const { notifyOwnerOfBookingCancelledByStudent } = require('../notifications/stayRequest.notifier');

/** Digits only, last ten — the same shape `phoneKey` produces elsewhere. */
const phoneDigits = (value) => String(value || '').replace(/\D/g, '').slice(-10);

/**
 * What the customer app is allowed to see.
 *
 * A deliberate subset. The owner's row carries their own operational notes,
 * the guest's KYC documents and what has been collected against the stay;
 * none of that is the student's to read back, and `documents`/`kyc` in
 * particular are identity scans.
 */
const toCustomerBooking = (booking, reviewed = false) => ({
  id: String(booking._id),
  requestId: booking.requestId || null,
  propertyId: booking.propertyId,
  propertyName: booking.propertyName,
  roomNumber: booking.roomNumber === 'Unassigned' ? null : booking.roomNumber,
  shareType: booking.shareType || null,
  checkInDate: booking.checkInDate || null,
  checkOutDate: booking.checkOutDate || null,
  status: booking.status,
  totalAmount: booking.totalAmount ?? 0,
  paidAmount: booking.paidAmount ?? 0,
  /* The gate code. Already shown on the confirmation screen from the request;
     repeated here so it survives the request being cleaned up, which is the
     whole reason a student can reopen a booking on move-in day. */
  entryPin: booking.entryPin || null,
  /* Both halves of moving in, so the app can say which one is outstanding
     rather than just "not yet". */
  movedInByOwnerAt: booking.movedInByOwnerAt || null,
  movedInByStudentAt: booking.movedInByStudentAt || null,
  address: (booking.address && String(booking.address)) || null,
  /* Whether this booking already has a review — the app draws "Rate your
     stay" only on a `completed` booking with this false, and drops the CTA
     the moment it is true rather than trusting its own memory of having
     already shown it once. Always false on anything not yet `completed`. */
  reviewed: booking.status === 'completed' ? Boolean(reviewed) : false,
  /* Who ended it — only meaningful once `status` is `cancelled`. Lets the
     app say "you cancelled this" rather than "the owner cancelled this"
     when the tap was the student's own. */
  cancelledBy: booking.status === 'cancelled' ? (booking.cancelledBy || null) : null,
  createdAt: booking.createdAt,
});

const scopeFor = (customer) => {
  const or = [];
  if (customer.customerId) or.push({ customerId: customer.customerId });
  const digits = phoneDigits(customer.phone);
  if (digits) or.push({ verifiedPhone: new RegExp(`${digits}$`) });
  /* No identity to match on at all should return nothing, not everything. */
  return or.length ? { $or: or } : { _id: null };
};

/**
 * Which of these completed bookings already have a review.
 *
 * One query for the whole page rather than one per booking — `listBookings`
 * caps at 50 rows and most of them are not `completed` at all, but the ones
 * that are must not turn into 50 round trips to answer one boolean each.
 */
const reviewedBookingIds = async (bookings) => {
  const ids = bookings.filter((b) => b.status === 'completed').map((b) => String(b._id));
  if (!ids.length) return new Set();
  const rows = await PartnerReview.find({ bookingId: { $in: ids } }).select('bookingId').lean();
  return new Set(rows.map((r) => r.bookingId));
};

// @route   GET /api/v2/customers/bookings
const listBookings = async (req, res, next) => {
  try {
    const bookings = await PartnerBooking.find(scopeFor(req.customer))
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const reviewed = await reviewedBookingIds(bookings);

    return res.json({
      success: true,
      count: bookings.length,
      data: bookings.map((b) => toCustomerBooking(b, reviewed.has(String(b._id)))),
    });
  } catch (error) {
    return next(error);
  }
};

// @route   GET /api/v2/customers/bookings/:id
const getBooking = async (req, res, next) => {
  try {
    const { id } = req.params;
    /* The scope is part of the FILTER, not a check after the read: a booking
       belonging to somebody else must be indistinguishable from one that does
       not exist, or the 404/403 split confirms it is real. */
    const booking = await PartnerBooking.findOne({
      _id: id,
      ...scopeFor(req.customer),
    }).lean();

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found.',
        error: 'Booking not found.',
      });
    }

    const reviewed = booking.status === 'completed'
      ? Boolean(await PartnerReview.exists({ bookingId: String(booking._id) }))
      : false;

    return res.json({ success: true, data: toCustomerBooking(booking, reviewed) });
  } catch (error) {
    /* A malformed id is a 404 rather than a 500 — it is a bad address, not a
       broken server. */
    if (error.name === 'CastError') {
      return res.status(404).json({
        success: false,
        message: 'Booking not found.',
        error: 'Booking not found.',
      });
    }
    return next(error);
  }
};

/*
 * The student's own Cancel button.
 *
 * Every owner action after acceptance had a way to reach the student
 * (`toCustomerBooking` above) and none of it ran the other way: once
 * confirmed, a booking was read-only from this side, so a student who
 * changed their mind had no lever but Support. This is that lever.
 *
 * ## Why only `upcoming`
 *
 * The moment the owner marks somebody in (`movedInByOwnerAt`), a door has
 * been opened for them — "cancelling" a stay somebody has already started is
 * a different, harder conversation (a refund, a partial night) than pulling
 * out before it began, and this button is not that conversation. `upcoming`
 * is the one status a booking holds before check-in starts moving it through
 * `arriving` → `in_house`, so the filter below is also what stops a student
 * cancelling a stay they are, in fact, already living in.
 *
 * ## The bed comes back exactly once
 *
 * Same guarded-update shape `freeBookingBed` uses on the owner's side
 * (`partnerDomains.controller.js`): the status filter is what makes a second
 * tap match nothing rather than release a bed twice.
 */
// @route   POST /api/v2/customers/bookings/:id/cancel
const cancelBooking = async (req, res, next) => {
  try {
    const { id } = req.params;

    const reason = String((req.body || {}).reason || '').trim().slice(0, 120) || null;
    const note = String((req.body || {}).note || '').trim().slice(0, 500) || null;

    const booking = await PartnerBooking.findOneAndUpdate(
      { _id: id, ...scopeFor(req.customer), status: 'upcoming' },
      {
        $set: {
          status: 'cancelled',
          cancelReason: reason,
          cancelNote: note,
          cancelledAt: new Date(),
          cancelledBy: 'student',
        },
      },
      { new: true },
    ).lean();

    if (!booking) {
      /* Same 404 for "not theirs" and "does not exist" as `getBooking` — and
         for a booking that IS theirs but is no longer `upcoming`, a clearer
         refusal than a blanket 404: they tapped Cancel on a stay that has
         already started or already ended. */
      const existing = await PartnerBooking.findOne({ _id: id, ...scopeFor(req.customer) }).lean();
      if (!existing) {
        return res.status(404).json({ success: false, message: 'Booking not found.' });
      }
      if (existing.status === 'cancelled') {
        return res.json({ success: true, data: toCustomerBooking(existing) });
      }
      return res.status(409).json({
        success: false,
        code: 'NOT_CANCELLABLE',
        message: 'This booking can no longer be cancelled from the app. Please contact support.',
      });
    }

    /* The bed comes back, same as any other way a booking leaves occupancy. */
    const shareTypeId = shareTypeIdForBooking(booking);
    if (shareTypeId) await releaseBed(shareTypeId).catch(() => {});

    /* Fire-and-forget, same contract as every notifier here: the student's
       tap must not wait on a push to the owner, and a push that fails must
       not fail the cancellation. */
    notifyOwnerOfBookingCancelledByStudent(booking).catch((error) => {
      console.error('[booking] cancelled but the owner was not notified:', error.message);
    });

    return res.json({ success: true, data: toCustomerBooking(booking) });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(404).json({ success: false, message: 'Booking not found.' });
    }
    return next(error);
  }
};

/**
 * "Rate your stay" — the write side of `partner_reviews`.
 *
 * The Stay Partner app has had a Reviews tab reading this collection since it
 * was built, and nothing anywhere ever wrote to it: `getReviews` in
 * `partnerDomains.controller.js` was a permanently empty screen wearing a
 * 4.8-star fallback. This is the missing half.
 *
 * ## Why a booking, not a property, is what gets reviewed
 *
 * Reviewing a listing directly would let anybody who can see a property page
 * rate it, which is exactly the problem the "verified stay" badge on every
 * review platform exists to solve. Requiring a `completed` booking that
 * belongs to this student is the same guarantee for free: nobody can review a
 * property they were never actually placed in.
 *
 * ## One review per stay, enforced by the database
 *
 * `bookingId` carries a unique index (see `partnerDomains.model.js`), so a
 * double tap or a retried request cannot create two rows — the second write
 * fails with a duplicate-key error, which is translated below into "you have
 * already reviewed this stay" rather than a 500.
 */
// @route   POST /api/v2/customers/bookings/:id/review
const createReview = async (req, res, next) => {
  try {
    const { id } = req.params;

    const rating = Number((req.body || {}).rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false, code: 'BAD_INPUT', message: 'Please choose a rating from 1 to 5.',
      });
    }

    const comment = String((req.body || {}).comment || '').trim().slice(0, 1000);
    if (!comment) {
      return res.status(400).json({
        success: false, code: 'BAD_INPUT', message: 'Please write a few words about your stay.',
      });
    }

    /* Theirs, and finished — the same "does not exist to you" 404 as every
       other read here for a booking that is not theirs, and a distinct
       refusal for one that has not been checked out of yet. */
    const booking = await PartnerBooking.findOne({ _id: id, ...scopeFor(req.customer) }).lean();
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found.' });
    }
    if (booking.status !== 'completed') {
      return res.status(409).json({
        success: false,
        code: 'NOT_COMPLETED',
        message: 'You can review a stay once it is complete.',
      });
    }

    let review;
    try {
      review = await PartnerReview.create({
        partnerPhoneDigits: booking.partnerPhoneDigits,
        propertyId: booking.propertyId,
        propertyName: booking.propertyName,
        rating,
        /* The name on the account, not a free-text field — a review the
           subject of it can quietly rewrite as somebody else's name is a
           review nobody can trust. Falls back to the guest name the booking
           itself carries, for the same reason `guestName` exists on it. */
        author: (req.customer && req.customer.name) || booking.guestName || 'A student',
        comment,
        date: new Date().toISOString().slice(0, 10),
        bookingId: String(booking._id),
        customerId: req.customer.customerId || null,
      });
    } catch (error) {
      if (error && error.code === 11000) {
        return res.status(409).json({
          success: false,
          code: 'ALREADY_REVIEWED',
          message: 'You have already reviewed this stay.',
        });
      }
      throw error;
    }

    return res.status(201).json({ success: true, data: { ...review.toObject(), id: String(review._id) } });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(404).json({ success: false, message: 'Booking not found.' });
    }
    return next(error);
  }
};

module.exports = {
  listBookings, getBooking, cancelBooking, createReview,
};
