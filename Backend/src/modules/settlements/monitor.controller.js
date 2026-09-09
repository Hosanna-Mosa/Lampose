/* ══════════════════════════════════════════════════════════════════════════
   The admin console's Monitor — one screen, four categories, two money models.

   ## What each tab is actually for

     PG_HOSTEL   No money passes through Lampose. The question the tab answers
     COLIVE      is "have the user and the owner agreed", so an administrator
                 knows when to ring the owner and collect the commission —
                 and whether they already have.

     BACHELOR    A ₹199 assisted-visit fee that is entirely OURS. There is no
                 owner share, so there is no split, no percentage and no
                 Withdraw. The tab shows whether the fee was paid.

     HOTEL       The full stay, split with the hotel. Total, percentage, our
                 share, owner share, payment state and payout state.

   Four tabs rather than one list with a filter, because the three shapes are
   genuinely different and a single table would be two thirds empty columns
   whichever row you were looking at.

   ## Category is resolved through `categoryQuery`, never compared directly

   `properties.category` was never migrated: PG, Hostel and PG_HOSTEL are all
   live spellings of one category. Comparing the stored string would put the
   same kind of property in three different tabs — which is exactly the bug
   the dashboard's "Property mix" has, reporting eight categories where there
   are four. Every query here goes through `categoryQuery`.

   ## Reading is wide, writing is narrow

   Any signed-in administrator may READ this screen: it is the operational
   picture of the business and hiding it helps nobody. Changing a commission
   needs Admin, and releasing money needs Super Admin. The gates are on the
   routes; nothing here decides them.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const Property = require('../properties/property.model');
const VisitRequest = require('../visits/visitRequest.model');
const { PartnerBooking } = require('../partners/partnerDomains.model');
const { HotelSettlement } = require('./hotelSettlement.model');
const settlements = require('./settlement.service');
const audit = require('../admins/adminAuditLog.model');
const {
  CATEGORIES, CATEGORY_LABEL, categoryQuery, paymentPurposeFor,
} = require('../../shared/constants/categories');

const fail = (res, status, code, message) =>
  res.status(status).json({ success: false, code, message, error: message });

const dbDown = (res) => fail(res, 503, 'DB_DISCONNECTED',
  'The server is running but not connected to the database.');

/** URL segment → stored code. `pg-hostel` reads better than `PG_HOSTEL`. */
const CODE_BY_SLUG = {
  'pg-hostel': 'PG_HOSTEL',
  bachelor: 'BACHELOR',
  colive: 'COLIVE',
  hotel: 'HOTEL',
};

/** Rupees, from paise. Display only — every decision is made on the integer. */
const rupees = (paise) => Math.round(Number(paise) || 0) / 100;

/**
 * The properties in one category, as an id set the other collections can be
 * queried by.
 *
 * `VisitRequest` and `PartnerBooking` do not store a category — they store a
 * `listingId` — so this is the join. At the scale this collection runs at
 * (tens of properties) it is one indexed read; if it ever is not, the answer
 * is a denormalised `category` on the request, not a lookup table here.
 */
const propertyIdsFor = async (code) => {
  const rows = await Property.find({ category: categoryQuery(code) })
    .select('_id name category ownerName ownerMobile place rent').lean();

  return {
    ids: rows.map((r) => String(r._id)),
    byId: new Map(rows.map((r) => [String(r._id), r])),
  };
};

/**
 * The free categories: what the user and the owner have agreed, and whether
 * we have collected on it.
 *
 * Built from the REQUEST rather than the booking, because the question is
 * about the conversation — a request the owner declined is as interesting to
 * this screen as one they accepted, and a declined request has no booking.
 */
const freeCategoryRows = async (code) => {
  const { ids, byId } = await propertyIdsFor(code);
  if (!ids.length) return [];

  const requests = await VisitRequest.find({ listingId: { $in: ids } })
    .sort({ createdAt: -1 }).limit(500).lean();

  /* The bookings those requests became, in one read rather than per row. */
  const bookingIds = requests.map((r) => r.bookingId).filter(Boolean);
  const bookings = bookingIds.length
    ? await PartnerBooking.find({ _id: { $in: bookingIds } }).lean()
    : [];
  const bookingById = new Map(bookings.map((b) => [String(b._id), b]));

  return requests.map((request) => {
    const property = byId.get(String(request.listingId)) || {};
    const booking = request.bookingId ? bookingById.get(String(request.bookingId)) : null;
    const commission = (booking && booking.commission) || {};

    return {
      id: String(request._id),
      requestId: String(request._id),
      bookingId: request.bookingId || null,

      propertyId: request.listingId,
      propertyName: request.propertyName || property.name || '',
      place: property.place || '',
      ownerName: property.ownerName || request.ownerName || '',
      ownerPhone: property.ownerMobile || '',

      guestName: request.customer?.name || '',
      guestPhone: request.customer?.phone || '',

      /* The conversation, as four separate facts rather than one word. An
         administrator ringing an owner needs to know which of them moved. */
      requestStatus: request.status,
      ownerAnswered: Boolean(request.decidedAt),
      ownerAccepted: request.status === 'confirmed',
      declineReason: request.decisionReason || null,
      bookingStatus: booking ? booking.status : null,

      requestedAt: request.createdAt,
      notifiedAt: request.notifiedAt || null,
      seenAt: request.seenAt || null,
      decidedAt: request.decidedAt || null,
      checkInDate: booking ? booking.checkInDate : (request.intent?.joiningDate || null),

      /* Listed rent, as the reference figure a commission is negotiated
         against. Explicitly the LISTING's, not an agreed rent — Lampose is
         never told what the two of them settled on. */
      listedRent: property.rent ?? null,

      /* The offline half. Nothing here moves money; it records that somebody
         rang the owner and what came of it. */
      commissionCollected: commission.collected === true,
      commissionAmount: commission.amountPaise != null ? rupees(commission.amountPaise) : null,
      commissionPercent: commission.percent ?? null,
      commissionCollectedAt: commission.collectedAt || null,
      commissionNote: commission.note || '',
    };
  });
};

/**
 * Bachelor: the ₹199 assisted visit.
 *
 * Deliberately NOT a settlement. The fee is entirely ours — there is no owner
 * share to hold, split or release — so this tab shows a payment and nothing
 * about a payout. Giving it a percentage field would invite somebody to set
 * one on money that has no second party.
 */
const bachelorRows = async () => {
  const { ids, byId } = await propertyIdsFor('BACHELOR');
  if (!ids.length) return [];

  const requests = await VisitRequest.find({ listingId: { $in: ids } })
    .sort({ createdAt: -1 }).limit(500).lean();

  return requests.map((request) => {
    const property = byId.get(String(request.listingId)) || {};
    const payment = request.payment || {};

    return {
      id: String(request._id),
      requestId: String(request._id),
      bookingId: request.bookingId || null,

      propertyId: request.listingId,
      propertyName: request.propertyName || property.name || '',
      place: property.place || '',
      ownerName: property.ownerName || '',

      guestName: request.customer?.name || '',
      guestPhone: request.customer?.phone || '',

      requestStatus: request.status,
      ownerAccepted: request.status === 'confirmed',

      paymentRequired: payment.required === true,
      paymentStatus: payment.status || 'not_required',
      /* `dev` means the development bypass waived it. Sent so the console
         never shows "paid" over money nobody sent. */
      paymentMode: payment.mode || 'online',
      amount: payment.amountPaise != null ? rupees(payment.amountPaise) : null,
      paymentId: payment.paymentId || null,
      paidAt: payment.verifiedAt || null,

      visitStatus: request.lamposeVisit?.status || 'none',
      visitDate: request.lamposeVisit?.date || null,
      visitTime: request.lamposeVisit?.time || null,

      requestedAt: request.createdAt,
      decidedAt: request.decidedAt || null,
    };
  });
};

/**
 * Hotel: the full lifecycle, payment through payout.
 *
 * The settlement is the spine — it is the only record of the split — but a
 * paid booking whose settlement failed to write must not vanish from this
 * screen, so the request is the outer query and the settlement is joined on.
 * A row with no settlement is exactly what an administrator needs to see.
 */
const hotelRows = async () => {
  const { ids, byId } = await propertyIdsFor('HOTEL');
  if (!ids.length) return [];

  const requests = await VisitRequest.find({ listingId: { $in: ids } })
    .sort({ createdAt: -1 }).limit(500).lean();

  const bookingIds = requests.map((r) => r.bookingId).filter(Boolean);
  const rows = bookingIds.length
    ? await HotelSettlement.find({ bookingId: { $in: bookingIds } })
    : [];
  const settlementByBooking = new Map(rows.map((s) => [s.bookingId, s]));

  const bookings = bookingIds.length
    ? await PartnerBooking.find({ _id: { $in: bookingIds } }).select('status checkInDate checkOutDate').lean()
    : [];
  const bookingById = new Map(bookings.map((b) => [String(b._id), b]));

  return requests.map((request) => {
    const property = byId.get(String(request.listingId)) || {};
    const payment = request.payment || {};
    const booking = request.bookingId ? bookingById.get(String(request.bookingId)) : null;
    const settlement = request.bookingId ? settlementByBooking.get(String(request.bookingId)) : null;

    return {
      id: String(request._id),
      requestId: String(request._id),
      bookingId: request.bookingId || null,

      propertyId: request.listingId,
      propertyName: request.propertyName || property.name || '',
      place: property.place || '',
      ownerName: property.ownerName || '',
      ownerPhone: property.ownerMobile || '',

      guestName: request.customer?.name || '',
      guestPhone: request.customer?.phone || '',

      requestStatus: request.status,
      bookingStatus: booking ? booking.status : null,
      checkInDate: request.intent?.checkIn || booking?.checkInDate || null,
      checkOutDate: request.intent?.checkOut || booking?.checkOutDate || null,
      nights: request.intent?.rateQuantity ?? null,
      nightsUnit: request.intent?.rateQuantityUnit || null,

      /* Money IN — what the guest did. */
      paymentStatus: payment.status || 'not_required',
      paymentMode: payment.mode || 'online',
      paymentId: payment.paymentId || null,
      orderId: payment.orderId || null,
      paidAt: payment.verifiedAt || null,

      /* Money OUT — the split and the payout. Null when no settlement was
         written, which the console renders as its own state rather than as
         zeroes: a missing ledger row is a fault, not a free booking. */
      settlement: settlement ? settlement.toAdmin() : null,

      requestedAt: request.createdAt,
      decidedAt: request.decidedAt || null,
    };
  });
};

// @route  GET /api/v1/admin/monitor/:category
// @desc   One category's bookings, in the shape that category needs
// @access Any active administrator
const getCategory = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);

    const code = CODE_BY_SLUG[String(req.params.category || '').toLowerCase()];
    if (!code) {
      return fail(res, 404, 'UNKNOWN_CATEGORY',
        `No such category. Expected one of: ${Object.keys(CODE_BY_SLUG).join(', ')}.`);
    }

    const data = code === 'HOTEL'
      ? await hotelRows()
      : code === 'BACHELOR'
        ? await bachelorRows()
        : await freeCategoryRows(code);

    return res.json({
      success: true,
      category: code,
      label: CATEGORY_LABEL[code],
      /* What this category does about money, so the console renders the right
         columns without keeping its own copy of the rule. */
      paymentPurpose: paymentPurposeFor(code),
      count: data.length,
      data,
    });
  } catch (error) {
    return next(error);
  }
};

// @route  GET /api/v1/admin/monitor
// @desc   The tab bar: every category and how much is waiting in each
// @access Any active administrator
const getSummary = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);

    /* One aggregate for the whole payout queue rather than a count per tab. */
    const byStatus = await HotelSettlement.aggregate([
      { $group: { _id: '$status', n: { $sum: 1 }, owed: { $sum: '$ownerSharePaise' } } },
    ]);
    const counts = Object.fromEntries(byStatus.map((r) => [r._id, r.n]));
    const owed = byStatus.find((r) => r._id === 'releasable');

    const tabs = await Promise.all(CATEGORIES.map(async (code) => {
      const slug = Object.keys(CODE_BY_SLUG).find((k) => CODE_BY_SLUG[k] === code);
      const { ids } = await propertyIdsFor(code);
      return {
        code,
        slug,
        label: CATEGORY_LABEL[code],
        paymentPurpose: paymentPurposeFor(code),
        properties: ids.length,
        /* The badge: what needs a person. For a hotel that is money waiting to
           be released; for the rest there is no queue, so it stays null rather
           than showing a zero that means nothing. */
        needsAction: code === 'HOTEL' ? (counts.releasable || 0) + (counts.failed || 0) : null,
      };
    }));

    return res.json({
      success: true,
      data: {
        tabs,
        settlements: {
          held: counts.held || 0,
          releasable: counts.releasable || 0,
          withdrawing: counts.withdrawing || 0,
          paidOut: counts.paid_out || 0,
          failed: counts.failed || 0,
          reversed: counts.reversed || 0,
          /* Rupees owed to hotels that could be released right now. */
          readyToRelease: rupees(owed ? owed.owed : 0),
        },
      },
    });
  } catch (error) {
    return next(error);
  }
};

// @route  PATCH /api/v1/admin/monitor/settlements/:id/commission
// @desc   Set the percentage Lampose keeps on one hotel booking
// @access Super Admin, Admin
const setCommission = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);

    /*
     * A PERCENTAGE is the only figure this route accepts.
     *
     * There is deliberately no way to send an amount, an owner share or a
     * commission in rupees. The server multiplies the percentage by what
     * Razorpay actually captured — see `splitAmount` — so a client that wanted
     * to pay a different figure has no field to say it in.
     */
    const { settlement, before } = await settlements.setCommission(
      req.params.id, req.body?.percent,
    );

    await audit.record(req, {
      action: 'settlement.commission_changed',
      targetType: 'hotel_settlements',
      targetId: settlement._id,
      before,
      after: {
        commissionPercent: settlement.commissionPercent,
        commissionPaise: settlement.commissionPaise,
        ownerSharePaise: settlement.ownerSharePaise,
      },
    });

    return res.json({ success: true, data: settlement.toAdmin() });
  } catch (error) {
    if (error instanceof settlements.SettlementError) {
      return fail(res, error.status, error.code, error.message);
    }
    return next(error);
  }
};

// @route  POST /api/v1/admin/monitor/settlements/:id/withdraw
// @desc   Release the hotel's share. The one route that moves money out.
// @access Super Admin only
const withdraw = async (req, res, next) => {
  const { id } = req.params;
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);

    /* Recorded BEFORE the attempt, so a release that never came back is still
       traceable to whoever asked for it. */
    await audit.record(req, {
      action: 'settlement.withdraw_requested',
      targetType: 'hotel_settlements',
      targetId: id,
    });

    /* No amount is passed. There is no parameter for one — see the service. */
    const { settlement } = await settlements.releaseToOwner(id);

    await audit.record(req, {
      action: 'settlement.withdraw_succeeded',
      targetType: 'hotel_settlements',
      targetId: id,
      /* What the press actually produced. `settledAt` is usually still null
         here — a payout is queued, not paid, and the webhook is what fills
         it in — so this records the payout we now have to watch. */
      after: {
        ownerSharePaise: settlement.ownerSharePaise,
        payoutId: settlement.payoutId,
        payoutStatus: settlement.payoutStatus,
        settledAt: settlement.settledAt,
      },
    });

    return res.json({ success: true, data: settlement.toAdmin() });
  } catch (error) {
    if (error instanceof settlements.SettlementError) {
      await audit.record(req, {
        action: 'settlement.withdraw_failed',
        targetType: 'hotel_settlements',
        targetId: id,
        errorCode: error.code,
        errorMessage: error.message,
      });
      return fail(res, error.status, error.code, error.message);
    }
    return next(error);
  }
};

// @route  PATCH /api/v1/admin/monitor/bookings/:id/commission-collected
// @desc   Record that our cut was collected from a PG/Hostel or Co-live owner
// @access Super Admin, Admin
const markCommissionCollected = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);

    const booking = await PartnerBooking.findById(req.params.id);
    if (!booking) return fail(res, 404, 'NOT_FOUND', 'That booking does not exist.');

    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      return fail(res, 400, 'BAD_AMOUNT', 'Enter the amount you collected, in rupees.');
    }

    const before = {
      collected: booking.commission?.collected === true,
      amountPaise: booking.commission?.amountPaise ?? null,
    };

    /*
     * The amount is TYPED here, and that is correct rather than a lapse.
     *
     * Everywhere else in this file an amount from a client is refused, because
     * it would decide what a gateway pays out. Nothing is paid out here: this
     * is a note that a person rang an owner and was given some money offline.
     * The typed figure IS the fact being recorded, and there is no server-side
     * number to check it against — Lampose is never told what rent the two of
     * them agreed.
     */
    booking.commission = {
      ...(booking.commission || {}),
      collected: true,
      amountPaise: Math.round(amount * 100),
      percent: req.body?.percent != null ? Number(req.body.percent) : booking.commission?.percent,
      collectedAt: new Date(),
      collectedByAdminId: String(req.admin._id),
      note: String(req.body?.note || '').slice(0, 300),
    };
    await booking.save();

    await audit.record(req, {
      action: 'booking.commission_collected',
      targetType: 'partner_bookings',
      targetId: booking._id,
      before,
      after: { collected: true, amountPaise: booking.commission.amountPaise },
    });

    return res.json({
      success: true,
      data: {
        bookingId: String(booking._id),
        commissionCollected: true,
        commissionAmount: rupees(booking.commission.amountPaise),
        commissionCollectedAt: booking.commission.collectedAt,
      },
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getSummary, getCategory, setCommission, withdraw, markCommissionCollected,
};
