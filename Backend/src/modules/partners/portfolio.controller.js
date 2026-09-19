/* ══════════════════════════════════════════════════════════════════════════
   What a partner owns, and who has asked to see it.

   Both of these read data that ALREADY EXISTS and was written by somebody
   else — the onboarding flow filled in the properties, and the User App's
   "Request a visit" filled in the requests. Nothing here creates anything.
   That is what makes these the first two screens in the Stay Partner app that
   can be real without a new domain being invented first.

   ## Scoping is by proven phone number, and only by that

   `Property.ownerMobile` and `VisitRequest.ownerMobile` are the existing record
   of whose property something is. A partner who has proved a number gets the
   rows carrying it — see the note on `phoneKey` in `partner.model.js` for why
   the match is on ten digits rather than the stored string.

   `requirePartner` refuses a session whose phone was never verified, which is
   what makes this safe: without that check, anybody could type a stranger's
   number into the login screen and read their listings, their customers' names
   and their customers' phone numbers.

   ## An owner sees more of a request than the public does

   `toPublicJSON` on VisitRequest is written for the customer who made it. The
   owner needs the opposite half: who is coming, on what number, and when. That
   is the entire point of the request from their side, and it is projected here
   rather than by reusing the customer's shape.

   What they are NOT given is a request still in `otp_pending`. That is a form
   somebody abandoned before proving their own number — the customer's details
   in it are unverified, and putting an unverified stranger's name and number in
   front of an owner is how this app becomes a way to harvest them.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const Partner = require('./partner.model');
const Property = require('../properties/property.model');
const VisitRequest = require('../visits/visitRequest.model');
const { formatListing } = require('../listings/listing.formatter');
const {
  StayRequestError, acceptAndBook, decline, settleIfExpired,
} = require('../visits/stayRequest.service');
const {
  notifyStudentAccepted, notifyStudentDeclined,
} = require('../notifications/stayRequest.notifier');

/* Fired, not awaited — the transition has committed and the owner is waiting
   for their answer. See the note in visits/stayRequest.controller.js. */
const fireAndForget = (promise) => {
  Promise.resolve(promise).catch((error) => {
    console.error('[partner-requests] notification failed:', error.message);
  });
};

const { phoneKey } = Partner;

const LIST_LIMIT = 200;

const dbDown = (res) => res.status(503).json({
  success: false,
  code: 'DB_DISCONNECTED',
  message: 'The server is running but not connected to the database.',
});

/**
 * Every property whose owner mobile matches this partner's number.
 *
 * Done in memory rather than as a Mongo query, and that is a deliberate
 * trade with a shelf life. `Property.ownerMobile` holds `"+91 98765 43210"`,
 * `"+919704726252"` and `undefined` in the same collection, so there is no
 * index-usable predicate that matches all the spellings of one number. At the
 * catalogue's present size this is a sub-millisecond scan; at ten thousand
 * properties it is not, and the fix is to normalise the column on write and
 * backfill rather than to make this cleverer.
 */
const ownedProperties = async (partner) => {
  const key = partner.phoneDigits || phoneKey(partner.phone);
  if (!key) return [];

  const all = await Property.find({}).lean();
  return all.filter((property) => phoneKey(property.ownerMobile) === key);
};

// @route   GET /api/v2/partners/properties
// @desc    The partner's own listings, as the public feed would render them
// @access  Partner session
const getMyProperties = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);

    const owned = await ownedProperties(req.partner);

    /* The same formatter the public feed uses. An owner looking at their own
       listing should see exactly what a student sees — that is the only way
       "the photos are wrong" or "the rent is stale" is ever noticed. */
    /*
     * Live availability, folded on.
     *
     * `formatListing` is synchronous and pure — it reads one document and
     * nothing else — so it cannot know whether the owner has this listing
     * paused: that lives on `partner_share_types.isAvailable`, in another
     * collection. The public feed solves the same problem the same way (see
     * `withAvailability` in listing.controller.js), and the owner needs it for
     * exactly one reason: the toggle on their own property card has to show
     * which way it is currently set.
     *
     * `null` where the listing has no share-type rows at all — nobody ever
     * recorded bed counts, so it is neither on nor off, and the card says so
     * rather than drawing a switch that cannot do anything.
     */
    const { PartnerShareType } = require('./partnerDomains.model');
    const rows = await PartnerShareType
      .find({ propertyId: { $in: owned.map((p) => String(p._id)) } })
      .select('propertyId isAvailable')
      .lean();

    const byProperty = new Map();
    rows.forEach((row) => {
      const list = byProperty.get(row.propertyId) || [];
      list.push(row.isAvailable !== false);
      byProperty.set(row.propertyId, list);
    });

    const data = owned
      .map((property) => {
        const flags = byProperty.get(String(property._id));
        return {
          ...formatListing(property),
          /* True when ANY room type is still taking bookings — the same rule
             `getSummary` uses for the dashboard switch, so the two cannot
             disagree about one property. */
          isAvailable: flags && flags.length ? flags.some(Boolean) : null,
          roomTypeCount: flags ? flags.length : 0,
        };
      })
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

    return res.json({ success: true, count: data.length, data });
  } catch (error) {
    return next(error);
  }
};

/** The owner's half of a visit request. See the note at the top of the file. */
const toOwnerJSON = (request) => ({
  id: String(request._id),
  status: request.status,
  listingId: request.listingId,
  propertyName: request.propertyName,

  /* Who is coming. The reason this screen exists. */
  customer: {
    name: request.customer?.name || '',
    phone: request.customer?.phone || '',
    email: request.customer?.email || '',
  },

  /* When they asked for, in both the shapes the User App may have sent. */
  preferredDate: request.preferredDate || null,
  preferredTime: request.preferredTime || null,

  /* What they actually want — length of stay, sharing, join date. Every figure
     in here was re-derived from the property by the visit-request controller,
     so it is what the page showed rather than what a payload claimed. */
  intent: request.intent
    ? {
      stayType: request.intent.stayType ?? null,
      duration: request.intent.duration ?? null,
      durationUnit: request.intent.durationUnit ?? null,
      joiningDate: request.intent.joiningDate ?? null,
      flexibleJoin: Boolean(request.intent.flexibleJoin),
      rateAmount: request.intent.rateAmount ?? null,
      rateUnit: request.intent.rateUnit ?? null,
      totalAmount: request.intent.totalAmount ?? null,
    }
    : null,

  /*
   * The ₹199 assisted visit, in the same shape `toOwner()` sends.
   *
   * This shape is the WEB channel's; `toOwner()` is the app's, and only that
   * one carried the payment. So a bachelor request that came through
   * lampose.com looked, to every owner-side reader, exactly like a request
   * with nothing outstanding — the "Waiting on the student" card did not
   * draw, and the ongoing strip on Today skipped it. Two serialisers for one
   * audience only work while they agree.
   */
  payment: request.payment && request.payment.required
    ? {
      required: true,
      status: request.payment.status || 'pending',
      purpose: request.payment.purpose || 'assisted_visit',
      /* The figure, for the same reason `toOwner()` carries it: a hotel owes
         the stay total, not the assisted-visit fee. */
      amountPaise: request.payment.amountPaise ?? null,
    }
    : null,
  lamposeVisit: request.payment && request.payment.required
    ? {
      status: request.lamposeVisit?.status || 'none',
      date: request.lamposeVisit?.date || null,
      time: request.lamposeVisit?.time || null,
    }
    : null,

  createdAt: request.createdAt,
  updatedAt: request.updatedAt,
});

/**
 * Requests that have reached the owner. `otp_pending` never has.
 *
 * `cancelled` is here even though nobody acted on it from this side: a
 * student who withdrew is a row that VANISHED from the owner's screen if it
 * were left out, which reads as a bug. It shows as cancelled and
 * non-actionable instead, which is the truth.
 */
const VISIBLE_TO_OWNER = ['pending_owner', 'confirmed', 'declined', 'expired', 'cancelled'];

// @route   GET /api/v2/partners/requests
// @desc    Visit requests customers have sent to this partner's properties
// @access  Partner session
const getMyRequests = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);

    const partner = req.partner;
    const key = partner.phoneDigits || phoneKey(partner.phone);
    if (!key) return res.json({ success: true, count: 0, unread: 0, data: [] });

    /*
     * `VisitRequest.ownerMobile` IS clean E.164 and indexed, unlike the
     * property column, so this one is a real query rather than a scan. Both
     * spellings are offered anyway — a `+91` prefix and the bare ten digits —
     * because the index is worth using and costs nothing to be generous with.
     */
    const requests = await VisitRequest.find({
      ownerMobile: { $in: [`+91${key}`, key] },
      status: { $in: VISIBLE_TO_OWNER },
    })
      .sort({ createdAt: -1 })
      .limit(LIST_LIMIT);

    /*
     * Settled on the way past, so the list never offers Accept on a request
     * whose three minutes ran out while the app was in a pocket. The
     * NOTIFICATION for that expiry belongs to the worker — opening a screen
     * is not an event, and pushing from here would fire an expiry notice at
     * whatever moment somebody happened to look.
     *
     * Not lean(), because `toOwner()` is a document method: it carries the
     * countdown and the `actionable` flag, and duplicating that projection
     * here is how the two would drift.
     */
    const settled = await Promise.all(requests.map((request) => settleIfExpired(request)));

    const data = settled.map((request) => (
      request.channel === 'app' ? request.toOwner() : toOwnerJSON(request)
    ));

    /* Unread is a watermark on the partner, matching how the customer app
       counts alerts: these are derived rows with nowhere to hang a per-item
       flag. Only requests still waiting on the owner count — a declined one is
       not something they need to be nudged about. */
    const watermark = partner.requestsReadAt ? partner.requestsReadAt.getTime() : 0;
    const unread = data.filter(
      (request) => request.status === 'pending_owner'
        && new Date(request.createdAt).getTime() > watermark,
    ).length;

    return res.json({ success: true, count: data.length, unread, data });
  } catch (error) {
    return next(error);
  }
};

// @route   GET /api/v2/partners/requests/:id
// @desc    One request, scoped to this partner
// @access  Partner session
const getMyRequest = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);

    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(404).json({
        success: false, code: 'NOT_FOUND', message: 'We could not find that request.',
      });
    }

    const request = await VisitRequest.findById(id);

    /*
     * Ownership is re-checked here rather than trusted from the list.
     *
     * A detail route that fetches by id alone is a route where changing one
     * character in a URL reads a different owner's customer's phone number.
     * The same 404 is returned for "does not exist" and "is not yours", so the
     * id cannot be used as an oracle either.
     */
    const key = req.partner.phoneDigits || phoneKey(req.partner.phone);
    const mine = request && phoneKey(request.ownerMobile) === key;
    const visible = mine && VISIBLE_TO_OWNER.includes(request.status);

    if (!visible) {
      return res.status(404).json({
        success: false, code: 'NOT_FOUND', message: 'We could not find that request.',
      });
    }

    const current = await settleIfExpired(request);

    /*
     * The owner has this request open. Stamped once, and only while it is
     * still live — "seen" after it expired is not a fact worth recording, and
     * would put a stage on the student's screen about a wait that had ended.
     *
     * `seenAt: null` in the filter makes it idempotent: the first view wins
     * and a poll every four seconds afterwards writes nothing.
     */
    if (current.channel === 'app' && current.status === 'pending_owner' && !current.seenAt) {
      await VisitRequest.updateOne(
        { _id: current._id, seenAt: null },
        { $set: { seenAt: new Date() } },
      ).catch(() => {});
      current.seenAt = new Date();
    }

    return res.json({
      success: true,
      data: current.channel === 'app' ? current.toOwner() : toOwnerJSON(current),
    });
  } catch (error) {
    return next(error);
  }
};

// @route   POST /api/v2/partners/requests/read
// @desc    Move this partner's read watermark on the requests list
// @access  Partner session
const markRequestsRead = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);

    req.partner.requestsReadAt = new Date();
    await req.partner.save();

    return res.json({ success: true, data: { readAt: req.partner.requestsReadAt } });
  } catch (error) {
    return next(error);
  }
};

// @route   GET /api/v2/partners/summary
// @desc    The dashboard's counts, from the two things that are real
// @access  Partner session
const getSummary = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);

    const partner = req.partner;
    const key = partner.phoneDigits || phoneKey(partner.phone);

    const owned = await ownedProperties(partner);

    const requests = key
      ? await VisitRequest.find({
        ownerMobile: { $in: [`+91${key}`, key] },
        status: { $in: VISIBLE_TO_OWNER },
      }).select('status createdAt').lean()
      : [];

    const counted = (status) => requests.filter((request) => request.status === status).length;

    const { PartnerBooking, PartnerPayout, PartnerComplaint } = require('./partnerDomains.model');
    const { stageFor } = require('./bookingStage.util');

    const bookings = key ? await PartnerBooking.find({ partnerPhoneDigits: key }).lean() : [];

    /*
     * Counted on the DERIVED stage, not on the stored status.
     *
     * These two lines read `b.status === 'arriving'` and `'departing'` —
     * values nothing in this codebase has ever written. Both tiles were
     * therefore incapable of showing anything but zero, on the screen an owner
     * opens to find out who is turning up today.
     *
     * `stageFor` answers it from the dates, which is where the answer actually
     * lives. One `now` for all three, so the three figures cannot disagree.
     */
    const now = new Date();
    const stages = bookings.map((b) => stageFor(b, now));
    const inHouse = stages.filter((stage) => stage === 'in_house').length;
    const arrivals = stages.filter((stage) => stage === 'arriving').length;
    const departures = stages.filter((stage) => stage === 'departing').length;

    /*
     * Zero is an answer. `|| 9600` is not.
     *
     * These two lines read `.reduce(…) || 9600` and `|| 58400`, and the
     * fixture numbers were reaching the dashboard through them: `0 || 9600`
     * is `9600` in JavaScript, so an owner who has been paid nothing was shown
     * "₹9,600 today · ₹58,400 this week". That is not a placeholder — it is the
     * server telling somebody they earned money they did not earn, on the
     * screen they would check before chasing a payout.
     *
     * The same `||` was applied to today's arrivals, departures, in-house
     * count and open complaints below. All of them are now the real figure,
     * including when the real figure is zero, and the app renders an empty
     * state rather than an invented one.
     */
    const payouts = key ? await PartnerPayout.find({ partnerPhoneDigits: key }).lean() : [];

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    /* Seven days back from midnight today, not "every completed payout ever",
       which is what the old filter actually summed while being labelled
       "this week". */
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - 6);

    const completed = payouts.filter((p) => p.status === 'completed' && p.payoutDate);

    const todayEarnings = completed
      .filter((p) => new Date(p.payoutDate) >= startOfToday)
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    const weekEarnings = completed
      .filter((p) => new Date(p.payoutDate) >= startOfWeek)
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    /*
     * "Complaints" on the dashboard are the owner's OPEN guest reports —
     * support tickets in the `guest` category, which is where a complaint
     * about a guest now goes so the Lampose team actually sees it. The
     * `partner_complaints` collection this used to count had no reader
     * anywhere but the owner's own phone.
     */
    const Ticket = require('../support/ticket.model');
    const complaints = partner.partnerId
      ? await Ticket.find({
        'requester.kind': 'partner',
        'requester.id': String(partner.partnerId),
        category: 'guest',
        status: { $in: ['open', 'awaiting_customer'] },
      }).select('_id').lean()
      : [];
    const { PartnerShareType } = require('./partnerDomains.model');
    const hasActiveShareType = key ? Boolean(await PartnerShareType.exists({ partnerPhoneDigits: key, isAvailable: true })) : false;
    const isAvailable = Boolean(partner.acceptingBookings || hasActiveShareType);

    return res.json({
      success: true,
      data: {
        properties: owned.length,
        /* Null, not 'Sea View Villa'. An owner whose number matches no
           property in the catalogue has no property name, and the header
           needs to say so — inventing one sends them looking for a listing
           that was never theirs. */
        propertyName: owned[0]?.name ?? null,
        requests: {
          total: requests.length,
          awaitingYou: counted('pending_owner'),
          confirmed: counted('confirmed'),
          declined: counted('declined'),
          expired: counted('expired'),
        },
        today: {
          inHouse,
          arrivals,
          departures,
        },
        /* Both the formatted string and the raw number. The string is what the
           tile prints; the number is what the app needs in order to tell "₹0"
           from "not loaded yet" without parsing a currency format back. */
        earnings: {
          today: `₹${todayEarnings.toLocaleString('en-IN')}`,
          week: `₹${weekEarnings.toLocaleString('en-IN')}`,
          todayAmount: todayEarnings,
          weekAmount: weekEarnings,
        },
        openComplaints: complaints.length,
        isAvailable,
        linkedByPhone: partner.phone,
      },
    });
  } catch (error) {
    return next(error);
  }
};

/* ══════════════════════════════════════════════════════════════════════════
   Answering — the two taps this whole flow exists for.

   Thin, like every other controller here: the state transition, the bed, the
   customer row and the auto-decline sweep all live in
   `visits/stayRequest.service.js`, because the same transitions are called by
   the student's routes and by the expiry worker. A rule enforced here would
   apply to one caller and silently not the others.

   Both are idempotent by construction. A second tap does not match the
   guarded filter, so it changes nothing and creates nothing — and it is told
   WHY rather than being given a generic failure, because "this expired" and
   "the student cancelled" are different sentences and the owner acts on them
   differently.
   ══════════════════════════════════════════════════════════════════════════ */

/** A service refusal becomes a response; anything else is a bug. */
const failRequest = (res, error, next) => {
  if (error instanceof StayRequestError) {
    return res.status(error.status).json({
      success: false, code: error.code, message: error.message,
    });
  }
  return next(error);
};

// @route   POST /api/v2/partners/requests/:id/accept
// @desc    Take the bed, confirm the student, open a customer record
// @access  Partner session
const acceptRequest = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);

    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(404).json({
        success: false, code: 'NOT_FOUND', message: 'We could not find that request.',
      });
    }

    const { request, booking, autoDeclined } = await acceptAndBook(id, req.partner);

    /*
     * A visit that has to be paid for needs something to pay at.
     *
     * Created before the push so the notification does not arrive before the
     * link it is telling them to use exists. Awaited for the same reason —
     * it is one call, and a student tapping the notification immediately
     * should find the button live.
     */
    if (request.payment?.required && request.payment.status !== 'paid') {
      const { ensurePaymentLink } = require('../visits/visitPayment.controller');
      await ensurePaymentLink(request);
    }

    fireAndForget(notifyStudentAccepted(request));

    /* Everybody who was waiting on the bed this tap just took. Each gets the
       INVENTORY_TAKEN wording rather than a rejection — see the notifier. */
    for (const lost of autoDeclined) fireAndForget(notifyStudentDeclined(lost));

    return res.json({
      success: true,
      data: request.toOwner(),
      /* The owner is told what else their tap did. Accepting the last bed
         turns other people's requests away, and doing that silently is how an
         owner discovers it from an angry phone call instead. */
      booking: booking ? { id: String(booking._id), status: booking.status } : null,
      autoDeclined: autoDeclined.length,
    });
  } catch (error) {
    return failRequest(res, error, next);
  }
};

// @route   POST /api/v2/partners/requests/:id/decline
// @desc    Turn a request down. Frees nothing, because nothing was taken.
// @access  Partner session
const declineRequest = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);

    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(404).json({
        success: false, code: 'NOT_FOUND', message: 'We could not find that request.',
      });
    }

    /* The reason chips on the existing reject sheet. Free text, capped in the
       service, and kept apart from `decisionReason` — that one is a machine's
       word and this one is the owner's. */
    const note = (req.body && req.body.reason) || (req.body && req.body.note) || null;

    const request = await decline(id, req.partner, { reason: 'OWNER_DECLINED', note });

    fireAndForget(notifyStudentDeclined(request));

    return res.json({ success: true, data: request.toOwner() });
  } catch (error) {
    return failRequest(res, error, next);
  }
};

module.exports = {
  acceptRequest,
  declineRequest,
  getMyProperties,
  getMyRequests,
  getMyRequest,
  markRequestsRead,
  getSummary,
};
