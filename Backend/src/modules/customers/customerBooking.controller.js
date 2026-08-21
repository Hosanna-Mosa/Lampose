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
const { PartnerBooking } = require('../partners/partnerDomains.model');

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
const toCustomerBooking = (booking) => ({
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

// @route   GET /api/v2/customers/bookings
const listBookings = async (req, res, next) => {
  try {
    const bookings = await PartnerBooking.find(scopeFor(req.customer))
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    return res.json({
      success: true,
      count: bookings.length,
      data: bookings.map(toCustomerBooking),
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

    return res.json({ success: true, data: toCustomerBooking(booking) });
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

module.exports = { listBookings, getBooking };
