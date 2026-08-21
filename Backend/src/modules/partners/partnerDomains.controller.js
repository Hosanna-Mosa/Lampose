const mongoose = require('mongoose');
const Partner = require('./partner.model');
const {
  PartnerBooking,
  PartnerPayout,
  PartnerPaymentMethod,
  PartnerComplaint,
  PartnerNotification,
  PartnerStaff,
  PartnerReview,
  PartnerReferral,
  PartnerShareType,
} = require('./partnerDomains.model');

const { phoneKey } = Partner;

const {
  releaseBed, shareTypeIdForBooking, OCCUPYING,
} = require('../inventory/inventory.service');
const { notifyStudentBookingCancelled } = require('../notifications/stayRequest.notifier');

/* ══════════════════════════════════════════════════════════════════════════
   Freeing a bed.

   Two of the three ways `availableBeds` goes back up live here — a booking
   cancelled and a tenant checked out. (The third is the accept handler giving
   back a bed it took for a request it then lost.) Without these the counter
   only ever falls, and every property drifts to zero and stops being
   requestable.

   ## Both had to become guarded updates first

   They were `findOneAndUpdate({ _id, partner }, { status })` with no status
   filter, which was harmless while nothing depended on the transition. It is
   not harmless now: a cancel tapped twice would match twice and hand back two
   beds for one departure, inventing a bed the building does not have. The
   filter on `status: { $in: OCCUPYING }` is what makes the release happen
   exactly once — the second tap matches nothing.

   `releaseBed` is capped at `totalBeds` as a second line of defence, so even
   a bug here cannot push a counter above capacity.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Move a booking out of occupancy and give its bed back.
 *
 * Returns the booking when this call was the one that moved it, and `null`
 * when somebody else already had. A null means DO NOT release — that is the
 * whole idempotency guarantee.
 */
const freeBookingBed = async (bookingId, partnerKeyDigits, nextStatus) => {
  const booking = await PartnerBooking.findOneAndUpdate(
    { _id: bookingId, partnerPhoneDigits: partnerKeyDigits, status: { $in: OCCUPYING } },
    { status: nextStatus },
    { new: true },
  ).lean();

  if (!booking) return null;

  /* Best effort, and deliberately after the status write. A booking that was
     cancelled but whose counter did not move is a drift `npm run
     reconcile:inventory` reports; a counter moved for a cancellation that did
     not commit is a bed sold twice. */
  const shareTypeId = shareTypeIdForBooking(booking);
  if (shareTypeId) await releaseBed(shareTypeId);

  return booking;
};

const dbDown = (res) => res.status(503).json({
  success: false,
  code: 'DB_DISCONNECTED',
  message: 'The server is running but not connected to the database.',
});

const getDigits = (partner) => partner.phoneDigits || phoneKey(partner.phone);

// ── Bookings ────────────────────────────────────────────────────────────────

const getBookings = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    const key = getDigits(req.partner);
    const filter = { partnerPhoneDigits: key };
    if (req.query.propertyId) filter.propertyId = req.query.propertyId;
    if (req.query.status) filter.status = req.query.status;

    /*
     * `?source=manual` — walk-ins the owner logged by hand on the Add Customer
     * form, as opposed to `request`, which came from a customer's own visit
     * request through the User App.
     *
     * Whitelisted rather than passed through: an unchecked query value reaching
     * a Mongo filter is how `?source[$ne]=x` becomes a way to read rows the
     * caller was never meant to see. The partner scope above would still hold,
     * but the habit is the dangerous part.
     */
    if (req.query.source === 'manual' || req.query.source === 'request') {
      filter.source = req.query.source;
    }

    const bookings = await PartnerBooking.find(filter).sort({ createdAt: -1 }).lean();
    const data = bookings.map((b) => ({ ...b, id: String(b._id) }));
    return res.json({ success: true, count: data.length, data });
  } catch (error) {
    return next(error);
  }
};

const getBookingById = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    const key = getDigits(req.partner);
    const booking = await PartnerBooking.findOne({ _id: req.params.id, partnerPhoneDigits: key }).lean();
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }
    return res.json({ success: true, data: { ...booking, id: String(booking._id) } });
  } catch (error) {
    return next(error);
  }
};

/**
 * The owner's half of moving in.
 *
 * They have checked the PIN and let somebody through a door, so this is the
 * first of the two confirmations. It does NOT put the booking in house on its
 * own — the student confirms from their side, and only then is somebody
 * actually moved in. See the note on the fields.
 *
 * Guarded and idempotent: stamping twice keeps the first time. The moment an
 * owner says somebody arrived is a fact, and a second tap is not a second
 * arrival.
 */
const checkInBooking = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    const key = getDigits(req.partner);
    const { id } = req.params;

    const booking = await PartnerBooking.findOneAndUpdate(
      { _id: id, partnerPhoneDigits: key, movedInByOwnerAt: null },
      { $set: { movedInByOwnerAt: new Date() } },
      { new: true },
    ).lean();

    if (!booking) {
      /* Already stamped, or not theirs. The first is not an error — an owner
         tapping again should see the same answer, not a failure. */
      const existing = await PartnerBooking.findOne({ _id: id, partnerPhoneDigits: key }).lean();
      if (existing) return res.json({ success: true, data: { ...existing, id: String(existing._id) } });
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    /* Only both sides together put somebody in house. The student has almost
       certainly not confirmed yet — they are standing there — but the check
       belongs here rather than being assumed. */
    if (booking.movedInByStudentAt) {
      await PartnerBooking.updateOne({ _id: booking._id }, { $set: { status: 'in_house' } });
      booking.status = 'in_house';
    }

    return res.json({ success: true, data: { ...booking, id: String(booking._id) } });
  } catch (error) {
    return next(error);
  }
};

const checkOutBooking = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    const key = getDigits(req.partner);
    const { id } = req.params;
    /* The bed comes back here. Guarded, so checking out twice frees one bed. */
    const booking = await freeBookingBed(id, key, 'completed');
    if (!booking) {
      /* Either it is not theirs, or it has already left occupancy. The second
         is not an error worth alarming an owner about — they tapped twice. */
      const existing = await PartnerBooking.findOne({ _id: id, partnerPhoneDigits: key }).lean();
      if (existing) return res.json({ success: true, data: { ...existing, id: String(existing._id) } });
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }
    return res.json({ success: true, data: { ...booking, id: String(booking._id) } });
  } catch (error) {
    return next(error);
  }
};

const cancelBooking = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    const key = getDigits(req.partner);
    const { id } = req.params;
    const booking = await freeBookingBed(id, key, 'cancelled');
    if (!booking) {
      const existing = await PartnerBooking.findOne({ _id: id, partnerPhoneDigits: key }).lean();
      /* Already cancelled. Idempotent for the owner, and deliberately silent —
         re-notifying on a repeat tap would tell the student twice. */
      if (existing) return res.json({ success: true, data: { ...existing, id: String(existing._id) } });
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    /*
     * Tell the student.
     *
     * This was the one owner action after confirmation that reached nobody. A
     * cancellation is not something to discover on next open: they have a
     * move-in date and possibly a train booked against it. Fire-and-forget for
     * the same reason the accept path is — the owner's response must not wait
     * on a push, and a push that fails must not fail the cancellation.
     */
    notifyStudentBookingCancelled(booking).catch((error) => {
      console.error('[booking] cancelled but the student was not notified:', error.message);
    });

    return res.json({ success: true, data: { ...booking, id: String(booking._id) } });
  } catch (error) {
    return next(error);
  }
};

// ── Earnings & Payouts ──────────────────────────────────────────────────────

const getEarningsSummary = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    const key = getDigits(req.partner);

    const payouts = await PartnerPayout.find({ partnerPhoneDigits: key }).lean();
    const paymentMethods = await PartnerPaymentMethod.find({ partnerPhoneDigits: key }).lean();

    /*
     * Zero is an answer. `|| 9600` is not.
     *
     * These read `.reduce(…) || 9600` and `|| 58400`, and since `0 || 9600` is
     * `9600` in JavaScript, an owner who had been paid nothing was told they
     * had earned ₹9,600 today and ₹58,400 this week. That is the screen
     * somebody checks before deciding whether to chase a payout.
     *
     * The week filter was also wrong independently of the fallback: it summed
     * every completed payout ever recorded while being labelled "this week".
     * It is now a real seven-day window.
     */
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - 6);

    const completed = payouts.filter((p) => p.status === 'completed' && p.payoutDate);

    const todayAmount = completed
      .filter((p) => new Date(p.payoutDate) >= startOfToday)
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    const weekAmount = completed
      .filter((p) => new Date(p.payoutDate) >= startOfWeek)
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    const pendingPayout = payouts.find((p) => p.status === 'pending' || p.status === 'processing') || null;

    return res.json({
      success: true,
      data: {
        todayEarnings: `₹${todayAmount.toLocaleString('en-IN')}`,
        weekEarnings: `₹${weekAmount.toLocaleString('en-IN')}`,
        todayAmount,
        weekAmount,
        pendingPayout: pendingPayout ? { ...pendingPayout, id: String(pendingPayout._id) } : null,
        payoutsCount: payouts.length,
        paymentMethodsCount: paymentMethods.length,
      },
    });
  } catch (error) {
    return next(error);
  }
};

const getPayouts = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    const key = getDigits(req.partner);
    const payouts = await PartnerPayout.find({ partnerPhoneDigits: key }).sort({ createdAt: -1 }).lean();
    const data = payouts.map((p) => ({ ...p, id: String(p._id) }));
    return res.json({ success: true, count: data.length, data });
  } catch (error) {
    return next(error);
  }
};

const getPayoutById = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    const key = getDigits(req.partner);
    const payout = await PartnerPayout.findOne({ _id: req.params.id, partnerPhoneDigits: key }).lean();
    if (!payout) return res.status(404).json({ success: false, message: 'Payout not found' });
    return res.json({ success: true, data: { ...payout, id: String(payout._id) } });
  } catch (error) {
    return next(error);
  }
};

const getPaymentMethods = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    const key = getDigits(req.partner);
    const methods = await PartnerPaymentMethod.find({ partnerPhoneDigits: key }).lean();
    const data = methods.map((m) => ({ ...m, id: String(m._id) }));
    return res.json({ success: true, count: data.length, data });
  } catch (error) {
    return next(error);
  }
};

const addPaymentMethod = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    const key = getDigits(req.partner);
    const { type, accountName, accountNumber, ifsc, upiId, isPrimary } = req.body;

    if (isPrimary) {
      await PartnerPaymentMethod.updateMany({ partnerPhoneDigits: key }, { isPrimary: false });
    }

    const created = await PartnerPaymentMethod.create({
      partnerPhoneDigits: key,
      type,
      accountName,
      accountNumber,
      ifsc,
      upiId,
      isPrimary: Boolean(isPrimary),
    });

    return res.status(201).json({ success: true, data: { ...created.toObject(), id: String(created._id) } });
  } catch (error) {
    return next(error);
  }
};

const deletePaymentMethod = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    const key = getDigits(req.partner);
    await PartnerPaymentMethod.deleteOne({ _id: req.params.id, partnerPhoneDigits: key });
    return res.json({ success: true, message: 'Payment method removed' });
  } catch (error) {
    return next(error);
  }
};

// ── Complaints & Support ────────────────────────────────────────────────────

const getComplaints = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    const key = getDigits(req.partner);
    const complaints = await PartnerComplaint.find({ partnerPhoneDigits: key }).sort({ createdAt: -1 }).lean();
    const data = complaints.map((c) => ({ ...c, id: String(c._id) }));
    return res.json({ success: true, count: data.length, data });
  } catch (error) {
    return next(error);
  }
};

const getComplaintById = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    const key = getDigits(req.partner);
    const complaint = await PartnerComplaint.findOne({ _id: req.params.id, partnerPhoneDigits: key }).lean();
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found' });
    return res.json({ success: true, data: { ...complaint, id: String(complaint._id) } });
  } catch (error) {
    return next(error);
  }
};

const createComplaint = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    const key = getDigits(req.partner);
    const { propertyId, propertyName, title, category, priority, description } = req.body;

    const created = await PartnerComplaint.create({
      partnerPhoneDigits: key,
      propertyId: propertyId || 'prop_1',
      propertyName: propertyName || 'Sea View Villa',
      title,
      category: category || 'Maintenance',
      priority: priority || 'medium',
      description,
      status: 'open',
    });

    return res.status(201).json({ success: true, data: { ...created.toObject(), id: String(created._id) } });
  } catch (error) {
    return next(error);
  }
};

/**
 * Close a complaint, or reopen one.
 *
 * The app's "Mark resolved" button had nothing to call — it was reaching for a
 * `resolveComplaint` helper that mutates a fixture array in `lib/complaints.ts`,
 * so the row changed on screen and reverted on the next load. This is what it
 * calls now.
 *
 * Scoped on `partnerPhoneDigits` as well as `_id`, like every other read here:
 * a route that updates by id alone lets one owner close another owner's
 * complaint by changing a character in a URL.
 */
const updateComplaintStatus = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    const key = getDigits(req.partner);

    const { status } = req.body || {};
    if (!['open', 'in_progress', 'resolved'].includes(String(status))) {
      return res.status(400).json({
        success: false, code: 'BAD_INPUT', message: 'Unknown complaint status.',
      });
    }

    const complaint = await PartnerComplaint.findOneAndUpdate(
      { _id: req.params.id, partnerPhoneDigits: key },
      { $set: { status, ...(status === 'resolved' ? { resolvedAt: new Date() } : {}) } },
      { new: true },
    ).lean();

    /* Same 404 for "does not exist" and "is not yours", so the id cannot be
       used to discover whether another owner's complaint exists. */
    if (!complaint) {
      return res.status(404).json({
        success: false, code: 'NOT_FOUND', message: 'Complaint not found',
      });
    }

    return res.json({ success: true, data: { ...complaint, id: String(complaint._id) } });
  } catch (error) {
    return next(error);
  }
};

// ── Notifications ───────────────────────────────────────────────────────────

const getNotifications = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    const key = getDigits(req.partner);
    const items = await PartnerNotification.find({ partnerPhoneDigits: key }).sort({ createdAt: -1 }).lean();
    const data = items.map((n) => ({ ...n, id: String(n._id) }));
    const unreadCount = items.filter((n) => !n.read).length;
    return res.json({ success: true, unreadCount, count: data.length, data });
  } catch (error) {
    return next(error);
  }
};

const markNotificationRead = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    const key = getDigits(req.partner);
    const { id } = req.params;
    if (id === 'all') {
      await PartnerNotification.updateMany({ partnerPhoneDigits: key }, { read: true });
    } else {
      await PartnerNotification.updateOne({ _id: id, partnerPhoneDigits: key }, { read: true });
    }
    return res.json({ success: true, message: 'Notification(s) marked read' });
  } catch (error) {
    return next(error);
  }
};

// ── Staff ───────────────────────────────────────────────────────────────────

const getStaff = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    const key = getDigits(req.partner);
    const staff = await PartnerStaff.find({ partnerPhoneDigits: key }).sort({ createdAt: -1 }).lean();
    const data = staff.map((s) => ({ ...s, id: String(s._id) }));
    return res.json({ success: true, count: data.length, data });
  } catch (error) {
    return next(error);
  }
};

const inviteStaff = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    const key = getDigits(req.partner);
    const { name, phone, email, role, permissions } = req.body;
    const created = await PartnerStaff.create({
      partnerPhoneDigits: key,
      name,
      phone,
      email: email || '',
      role: role || 'Manager',
      permissions: permissions || ['requests', 'bookings'],
      status: 'invited',
    });
    return res.status(201).json({ success: true, data: { ...created.toObject(), id: String(created._id) } });
  } catch (error) {
    return next(error);
  }
};

const removeStaff = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    const key = getDigits(req.partner);
    await PartnerStaff.deleteOne({ _id: req.params.id, partnerPhoneDigits: key });
    return res.json({ success: true, message: 'Staff member removed' });
  } catch (error) {
    return next(error);
  }
};

// ── Reviews ─────────────────────────────────────────────────────────────────

const getReviews = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    const key = getDigits(req.partner);
    const reviews = await PartnerReview.find({ partnerPhoneDigits: key }).sort({ createdAt: -1 }).lean();
    const data = reviews.map((r) => ({ ...r, id: String(r._id) }));

    const avgRating = data.length
      ? (data.reduce((sum, r) => sum + r.rating, 0) / data.length).toFixed(1)
      : '4.8';

    return res.json({
      success: true,
      averageRating: parseFloat(avgRating),
      count: data.length,
      data,
    });
  } catch (error) {
    return next(error);
  }
};

// ── Referrals ───────────────────────────────────────────────────────────────

const getReferralInfo = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    const key = getDigits(req.partner);
    let ref = await PartnerReferral.findOne({ partnerPhoneDigits: key }).lean();
    if (!ref) {
      /* Zero, not a stand-in — same rule `getEarningsSummary` follows above.
         This used to seed 500 points, ₹500 and 5 invites on a partner's very
         first visit to this screen, which is fabricated history for an owner
         who has referred nobody. A partner who has actually earned points
         gets here through the `findOne` above and never touches this branch. */
      ref = await PartnerReferral.create({
        partnerPhoneDigits: key,
        code: `PAR-${key.slice(-4)}`,
        points: 0,
        earningsRupees: 0,
        invitedCount: 0,
        history: [],
      });
      ref = ref.toObject();
    }
    return res.json({ success: true, data: { ...ref, id: String(ref._id) } });
  } catch (error) {
    return next(error);
  }
};

const withdrawReferral = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    const key = getDigits(req.partner);
    const ref = await PartnerReferral.findOneAndUpdate(
      { partnerPhoneDigits: key },
      { points: 0, earningsRupees: 0 },
      { new: true }
    ).lean();
    return res.json({ success: true, data: { ...ref, id: String(ref._id) } });
  } catch (error) {
    return next(error);
  }
};

// ── Share Types & Availability ──────────────────────────────────────────────

const getShareTypes = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    const key = getDigits(req.partner);
    const items = await PartnerShareType.find({ partnerPhoneDigits: key }).lean();
    const data = items.map((st) => ({ ...st, id: String(st._id) }));
    return res.json({ success: true, count: data.length, data });
  } catch (error) {
    return next(error);
  }
};

const updateShareTypeAvailability = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    const key = getDigits(req.partner);
    const { isAvailable } = req.body;

    /* The Dashboard's actual "accepting bookings" answer — see the note on
       `acceptingBookings` in partner.model.js for why this is a flag on the
       partner record rather than derived from PartnerShareType. */
    req.partner.acceptingBookings = Boolean(isAvailable);
    await req.partner.save();

    /* Best-effort sync of whatever real share-type documents this partner
       already has, if any. Harmless no-op today (nothing in this codebase
       creates one), and picks up real data the moment something does. */
    await PartnerShareType.updateMany({ partnerPhoneDigits: key }, { isAvailable: Boolean(isAvailable) });

    return res.json({ success: true, isAvailable: Boolean(isAvailable) });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getBookings,
  getBookingById,
  checkInBooking,
  checkOutBooking,
  cancelBooking,
  getEarningsSummary,
  getPayouts,
  getPayoutById,
  getPaymentMethods,
  addPaymentMethod,
  deletePaymentMethod,
  getComplaints,
  getComplaintById,
  createComplaint,
  updateComplaintStatus,
  getNotifications,
  markNotificationRead,
  getStaff,
  inviteStaff,
  removeStaff,
  getReviews,
  getReferralInfo,
  withdrawReferral,
  getShareTypes,
  updateShareTypeAvailability,
};
