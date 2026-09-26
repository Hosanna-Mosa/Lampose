/* ══════════════════════════════════════════════════════════════════════════
   The admin console's side of rider onboarding.

   A rider signs up from the Driver app and lands in `app_drivers` with
   `status: 'pending'`. Nobody is offered a delivery until a person has looked
   at their licence and approved them. These handlers are that person's tools:
   the queue, one rider in full, and the decision.

   ## Without this file, nothing works

   That is worth stating plainly rather than leaving to be discovered. No route
   on the driver router can set `status` — deliberately, because a module that
   could approve its own accounts is a module where "approved" means nothing.
   The consequence is that a deployment with no approval surface has riders who
   can sign in, finish onboarding, and never go online, with the duty switch
   correctly refusing them forever. This is the other half of that rule.

   ## This is the v1 admin surface, not the v2 driver one

   It mounts under `/api/v1/admin/drivers` behind `verifyAdminToken`, because
   the reader is an administrator in the `admins` collection — a different
   identity system from the rider's own session entirely. Same arrangement, and
   the same reasoning, as `foodAdmin.controller.js`.

   ## Suspending takes a rider off the road NOW

   Not at the end of their shift and not when their token expires. So
   suspension also clears `isOnline`, and `requireDriver` re-reads the document
   on every request — a rider suspended mid-shift stops receiving offers within
   one dispatch cycle rather than within a week.

   What it deliberately does NOT do is take an order off them. A suspended
   rider holding somebody's dinner still has to deliver it or hand it back, and
   silently unassigning it would leave a diner waiting on food that is sitting
   in a bag on a stationary scooter. The order is left where it is and the log
   line says so.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const Driver = require('./driver.model');
const DriverCashDeposit = require('./driverCashDeposit.model');
const FoodOrder = require('../foodpartners/foodOrder.model');
const { cashInHandFor, cashLedgerFor } = require('./cashInHand.service');
const accountNotifier = require('./driverAccount.notifier');

const {
  DRIVER_STATUSES, DOCUMENT_KINDS, DOCUMENT_LABELS, DOCUMENT_STATUSES,
  hasFreshLocation, documentChecklist, onboardingProgress,
} = Driver;

const BADGE = '🛵 [drivers/admin]';
const LIST_LIMIT = 100;

const fail = (res, status, code, message) => res.status(status).json({
  success: false, code, message, error: message,
});

const dbDown = (res) => fail(
  res, 503, 'DB_DISCONNECTED', 'The server is running but not connected to the database.',
);

const isUp = () => mongoose.connection.readyState === 1;

/**
 * A row in the queue.
 *
 * `documents` is included because it IS the queue's job — an approver is
 * looking at a licence number and two scans and deciding. `otp` and `devices`
 * are already stripped by the model's `toJSON`, and this reads `lean()` so
 * they are named explicitly here instead.
 */
const queueRow = (doc) => {
  /* The FULL five-row checklist, not only what happens to be stored — the
     same helper the rider's own app renders from, so a document the console
     shows as absent is exactly the one the app is asking them for. */
  const documents = documentChecklist(doc);
  const progress = onboardingProgress(doc);

  return {
    driverId: doc.driverId,
    name: doc.name || '',
    phone: doc.phone,
    email: doc.email || '',
    dateOfBirth: doc.dateOfBirth || null,
    city: doc.city || '',
    profilePhotoUrl: doc.profilePhotoUrl || '',

    status: doc.status,
    statusReason: doc.statusReason || '',

    vehicle: doc.vehicle || {},
    documents,
    /* The tally the queue table shows, so a row says "3 of 5 verified"
       without the client counting an array on every render. `missing` is a
       kind with nothing on file at all — an approver's "nothing to look at
       yet" as distinct from "looked at and refused". */
    documentCounts: DOCUMENT_STATUSES.concat('missing').reduce(
      (acc, key) => ({ ...acc, [key]: documents.filter((d) => d.status === key).length }),
      {},
    ),
    /* Everything required is on file and none of it is refused. This — not
       `hasCompletedOnboarding` — is the "safe to approve" signal, and it is
       computed here so the console cannot draw a different conclusion from
       the same rows. */
    documentsReady: documents.every(
      (d) => !d.required || d.status === 'verified' || d.status === 'pending',
    ) && documents.filter((d) => d.required).every((d) => d.status !== 'missing'),

    /* Payout without the account number. `select: false` means `.lean()`
       never loaded it in the first place; naming the four fields we DO show
       is what keeps that true if somebody adds a `.select('+…')` later. */
    payout: {
      accountHolderName: doc.payout?.accountHolderName || '',
      accountLast4: doc.payout?.accountLast4 || '',
      ifscCode: doc.payout?.ifscCode || '',
      bankName: doc.payout?.bankName || '',
      accountType: doc.payout?.accountType || '',
      upiId: doc.payout?.upiId || '',
    },

    hasCompletedOnboarding: !!doc.hasCompletedOnboarding,
    onboardingStep: doc.onboardingStep || 'personal',
    /* What the rider still has to send, in the same sentence their own app
       shows them — so support answering "why am I not approved yet" reads the
       same words the rider is looking at. */
    onboardingMissing: progress.missing,

    isOnline: !!doc.isOnline,
    isAvailable: doc.isAvailable !== false,
    currentOrderNumber: doc.currentOrderNumber || null,
    /* Whether the dispatcher can actually see them, by the same rule it uses.
       An "online" rider the matcher skips is the single most confusing state an
       operator can be shown, so it is answered rather than implied. */
    locationFresh: hasFreshLocation(doc),
    locationUpdatedAt: doc.locationUpdatedAt || null,
    /* Where they were last seen. `[longitude, latitude]`, unswapped all the
       way to the console's map link — see the module header. */
    currentLocation: doc.currentLocation?.coordinates || null,
    heading: typeof doc.heading === 'number' ? doc.heading : null,
    onlineSince: doc.onlineSince || null,
    /* How many handsets could be rung. Not the tokens themselves — a push
       token is a capability and an operator has no use for one. */
    deviceCount: Array.isArray(doc.devices) ? doc.devices.length : 0,

    phoneVerifiedAt: doc.phoneVerifiedAt || null,
    lastLoginAt: doc.lastLoginAt || null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt || null,
  };
};

// @route   GET /api/v1/admin/drivers?status=pending
// @desc    The approval queue, and the roster
// @access  Admin console (admins collection)
const listDrivers = async (req, res, next) => {
  try {
    if (!isUp()) return dbDown(res);

    const filter = {};
    const asked = String(req.query.status || '').trim();
    if (asked) {
      const wanted = asked.split(',').map((s) => s.trim()).filter((s) => DRIVER_STATUSES.includes(s));
      if (wanted.length) filter.status = { $in: wanted };
    }

    const search = String(req.query.search || '').trim();
    if (search) {
      /* Escaped before it becomes a regex — an operator pasting a phone number
         with a `+` in it must not build a pattern. */
      const safe = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { name: new RegExp(safe, 'i') },
        { phone: new RegExp(safe, 'i') },
        { driverId: new RegExp(safe, 'i') },
      ];
    }

    /* "Show me who is actually on the road right now." Its own filter rather
       than a status, because duty and approval are orthogonal — an approved
       rider is usually offline, and an operator chasing a stuck order wants
       the small live set, not the roster. */
    if (String(req.query.online || '') === 'true') filter.isOnline = true;

    const limit = Math.min(Number(req.query.limit) || LIST_LIMIT, LIST_LIMIT);

    const [rows, grouped, onlineCount] = await Promise.all([
      Driver.find(filter).sort({ createdAt: -1 }).limit(limit).lean(),
      Driver.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
      Driver.countDocuments({ isOnline: true }),
    ]);

    const counts = grouped.reduce((acc, row) => ({ ...acc, [row._id]: row.n }), {});

    /* Cash each rider on this page is holding — two aggregations for the whole
       page, not one per row. */
    const cash = await cashInHandFor(rows.map((row) => row.driverId));
    let data = rows.map((row) => ({
      ...queueRow(row),
      cashInHandPaise: (cash.get(row.driverId) || { inHandPaise: 0 }).inHandPaise,
    }));

    /* Filtered AFTER `queueRow`, not in the Mongo query, and only ever over
       the page already fetched. `documents` is a normalised five-row list
       whose `missing` entries exist nowhere in the database — a `$elemMatch`
       cannot express "has not sent an RC at all", which is the one thing an
       approver most wants to filter on. The list is capped at 100 rows, so
       this is a filter over a page rather than a scan. */
    const needs = String(req.query.documents || '').trim();
    if (needs === 'pending') data = data.filter((row) => row.documents.some((d) => d.status === 'pending'));
    else if (needs === 'rejected') data = data.filter((row) => row.documents.some((d) => d.status === 'rejected'));
    else if (needs === 'incomplete') data = data.filter((row) => !row.documentsReady);

    return res.json({
      success: true,
      count: data.length,
      counts: { ...counts, online: onlineCount },
      data,
    });
  } catch (error) {
    console.error(`${BADGE} listing riders failed:`, error.message);
    return next(error);
  }
};

// @route   GET /api/v1/admin/drivers/:driverId
// @desc    One rider in full: identity, documents, payout, duty, and the work
// @access  Admin console
const getDriver = async (req, res, next) => {
  try {
    if (!isUp()) return dbDown(res);

    const driver = await Driver.findOne({ driverId: String(req.params.driverId || '').trim() }).lean();
    if (!driver) return fail(res, 404, 'NOT_FOUND', 'We could not find that rider.');

    /* The last twenty deliveries, and the lifetime tally beside them. An
       approver deciding whether to suspend somebody is deciding about a
       pattern, and a page with no history is a page where that decision is a
       guess.

       The tally is AGGREGATED rather than summed from the twenty rows above:
       "delivered 400, earned ₹34,000" and "here are the last twenty" are two
       different questions, and answering the first from the second would
       silently under-report the moment a rider passes twenty jobs. Both run
       against `delivery.driverId`, which `foodOrder.model.js` indexes.

       Nothing is accumulated onto the rider document to make this cheaper —
       see `driver.model.js`: a counter and a ledger that disagree is the worst
       bug this product could have, and the only way they cannot disagree is
       for there to be one of them. */
    const [recent, tally, cash] = await Promise.all([
      FoodOrder.find({ 'delivery.driverId': driver.driverId })
        .select('orderNumber status restaurantId placedAt grandTotal paymentMode'
          + ' delivery.earnings delivery.assignedAt delivery.pickedUpAt delivery.deliveredAt'
          + ' collection.method')
        .sort({ placedAt: -1 })
        .limit(20)
        .lean(),
      FoodOrder.aggregate([
        { $match: { 'delivery.driverId': driver.driverId } },
        {
          $group: {
            _id: '$status',
            n: { $sum: 1 },
            earnings: { $sum: { $ifNull: ['$delivery.earnings', 0] } },
          },
        },
      ]),
      cashLedgerFor(driver.driverId),
    ]);

    const byStatus = tally.reduce((acc, row) => ({ ...acc, [row._id]: row }), {});
    const delivered = byStatus.delivered || { n: 0, earnings: 0 };

    return res.json({
      success: true,
      data: {
        ...queueRow(driver),
        lifetime: {
          /* Every order ever assigned to them, however it ended. */
          assigned: tally.reduce((sum, row) => sum + row.n, 0),
          delivered: delivered.n,
          cancelled: (byStatus.cancelled || { n: 0 }).n,
          /* What Lampose has paid them, from the ledger. */
          earnings: Math.round(delivered.earnings || 0),
        },
        /* Cash collected at doors, what has been handed over, and the rest. */
        cash,
        cashInHandPaise: cash.inHandPaise,
        recentDeliveries: recent.map((order) => ({
          orderNumber: order.orderNumber,
          status: order.status,
          /* The id, not a name — `food_orders` stores `restaurantId` and no
             snapshot of the restaurant's name, and joining twenty rows to
             `food_restaurants` to decorate an approver's sidebar is a query
             this page does not need to run. */
          restaurantId: order.restaurantId || '',
          placedAt: order.placedAt,
          assignedAt: order.delivery?.assignedAt || null,
          pickedUpAt: order.delivery?.pickedUpAt || null,
          deliveredAt: order.delivery?.deliveredAt || null,
          earnings: order.delivery?.earnings || 0,
          orderTotal: order.grandTotal || 0,
          paymentMode: order.paymentMode || '',
          /* How a COD order was actually paid at the door: 'cash', 'upi_qr' or ''. */
          collectionMethod: order.collection?.method || '',
        })),
      },
    });
  } catch (error) {
    console.error(`${BADGE} reading a rider failed:`, error.message);
    return next(error);
  }
};

// @route   PATCH /api/v1/admin/drivers/:driverId/documents/:kind
// @desc    Verify or refuse ONE document, with a reason the rider is shown
// @access  Admin console (deciding role only — see the router)
/**
 * The decision this queue actually exists for.
 *
 * An approver reads a licence and answers about the licence. Before this
 * existed the only verdict available was on the whole account, so one blurred
 * PAN card rejected an application and sent a rider back to the beginning —
 * and the rejection reason had to describe which of five documents was at
 * fault, in prose, in a field the app showed under a heading about the
 * account.
 *
 * A refusal here does NOT touch `status`. The rider stays `pending`, their
 * app shows exactly which document to photograph again and why, and
 * `POST /me/documents` puts it straight back in this queue. Rejecting the
 * ACCOUNT is a separate, heavier decision and it has its own handler below.
 */
const decideDocument = async (req, res, next) => {
  try {
    if (!isUp()) return dbDown(res);

    const kind = String(req.params.kind || '').trim().toLowerCase();
    if (!DOCUMENT_KINDS.includes(kind)) {
      return fail(res, 400, 'UNKNOWN_DOCUMENT', `"kind" must be one of: ${DOCUMENT_KINDS.join(', ')}.`);
    }

    const wanted = String((req.body || {}).status || '').trim();
    if (!['verified', 'rejected'].includes(wanted)) {
      return fail(res, 400, 'BAD_INPUT', '"status" must be "verified" or "rejected".');
    }

    const reason = String((req.body || {}).reason || '').trim().slice(0, 300);
    if (wanted === 'rejected' && !reason) {
      return fail(
        res, 400, 'REASON_REQUIRED',
        'Say what is wrong with it. The rider is shown this sentence and has to know what to photograph again.',
      );
    }

    const driver = await Driver.findOne({ driverId: String(req.params.driverId || '').trim() });
    if (!driver) return fail(res, 404, 'NOT_FOUND', 'We could not find that rider.');

    const doc = driver.documents.find((d) => d.kind === kind);
    if (!doc) {
      return fail(
        res, 409, 'NOT_SUBMITTED',
        `This rider has not sent a ${DOCUMENT_LABELS[kind].toLowerCase()} yet.`,
      );
    }

    const before = doc.status;
    doc.status = wanted;
    doc.reason = wanted === 'rejected' ? reason : '';
    doc.reviewedAt = new Date();
    doc.reviewedBy = req.admin?.name || req.admin?.email || 'admin';

    await driver.save();

    console.log(
      `${BADGE} ${driver.driverId} · ${kind} ${before} → ${wanted}`
      + `${reason ? ` · ${reason}` : ''} · by ${doc.reviewedBy}`,
    );

    /*
     * And tell the rider, which nothing did until now.
     *
     * The reason above was typed because this handler REFUSES a rejection
     * without one — "the rider is shown this sentence and has to know what to
     * photograph again" — and until this line the rider was shown nothing at
     * all unless they happened to reopen the documents screen. An approver
     * writing a careful sentence into a field nobody delivers is worse than
     * not asking for one.
     *
     * Not awaited, and its failure cannot reach the console: the verdict is
     * saved, and a handset that could not be rung must not turn a committed
     * decision into an error the approver is invited to retry. The notifier
     * swallows and logs its own problems — see its header. */
    accountNotifier.notifyDriverOfDocumentDecision(driver, kind, { status: wanted, reason })
      .catch(() => {});

    return res.json({ success: true, data: queueRow(driver.toObject()) });
  } catch (error) {
    console.error(`${BADGE} deciding a document failed:`, error.message);
    return next(error);
  }
};

// @route   PATCH /api/v1/admin/drivers/:driverId/decision
// @desc    Approve, reject, suspend, or lift a suspension
// @access  Admin console (deciding role only — see the router)
const decideDriver = async (req, res, next) => {
  try {
    if (!isUp()) return dbDown(res);

    const wanted = String((req.body || {}).status || '').trim();
    if (!DRIVER_STATUSES.includes(wanted)) {
      return fail(res, 400, 'BAD_INPUT', `"status" must be one of: ${DRIVER_STATUSES.join(', ')}.`);
    }
    /* `pending` is where a rider STARTS, not somewhere they can be sent back
       to. Moving an approved rider back to pending would leave them unable to
       work with no explanation and no way to act on it — that is what
       `suspended` is for, and it has a reason attached. */
    if (wanted === 'pending') {
      return fail(
        res, 409, 'NOT_A_DECISION',
        'A rider cannot be moved back to pending. Suspend them instead, with a reason.',
      );
    }

    const driver = await Driver.findOne({ driverId: String(req.params.driverId || '').trim() });
    if (!driver) return fail(res, 404, 'NOT_FOUND', 'We could not find that rider.');

    const reason = String((req.body || {}).reason || '').trim().slice(0, 300);
    if (wanted !== 'approved' && !reason) {
      return fail(
        res, 400, 'REASON_REQUIRED',
        'Say why. The rider is shown this, and support has to be able to explain it.',
      );
    }

    /*
     * Approving somebody whose paperwork is not on file.
     *
     * WARNED, not refused. The operator on this screen is the authority on
     * who may ride, and there are real reasons to approve early — a licence
     * checked in person at the office, a rider re-onboarding after a phone
     * change. A hard block would mean the console cannot express a decision
     * the business routinely makes, and the way round it would be somebody
     * editing MongoDB by hand, which is worse in every direction.
     *
     * So the gap is named in the response, the log line records it, and the
     * decision stands. `documentsReady` is computed from the same checklist
     * the drawer draws, so the warning cannot disagree with what the approver
     * was looking at when they pressed the button.
     */
    const readiness = queueRow(driver.toObject());
    const approvingEarly = wanted === 'approved'
      && (!readiness.documentsReady || !driver.hasCompletedOnboarding);

    const before = driver.status;
    driver.status = wanted;
    driver.statusReason = wanted === 'approved' ? '' : reason;

    /* Off the road NOW, not at the end of the shift — see the header. The
       order they may be carrying is deliberately left alone. */
    if (wanted !== 'approved') {
      driver.isOnline = false;
      driver.onlineSince = null;
    }

    await driver.save();

    console.log(
      `${BADGE} ${driver.driverId} ${before} → ${wanted}`
      + `${reason ? ` · ${reason}` : ''}`
      + `${approvingEarly ? ' · WITHOUT COMPLETE DOCUMENTS' : ''}`
      + `${driver.currentOrderNumber ? ` · STILL CARRYING ${driver.currentOrderNumber}` : ''}`,
    );

    /*
     * And tell the rider.
     *
     * This is the message the Driver app promises on the last screen of
     * onboarding — "you will be notified the moment you are approved" — and
     * nothing sent it. A rider approved at 2pm could have been earning at 2pm
     * and instead waited until they next thought to open the app; a rider
     * rejected or suspended found out by being refused at the duty switch,
     * with the reason an administrator typed reaching them only as a 403 they
     * had to trigger themselves.
     *
     * `before` goes with it because lifting a suspension arrives here as
     * `approved`, and "your account has been approved" is the wrong sentence
     * for somebody who was approved a month ago.
     *
     * Not awaited, and its failure cannot reach the console — the decision is
     * committed and the approver has moved on to the next row. */
    accountNotifier.notifyDriverOfDecision(driver, { previous: before, reason })
      .catch(() => {});

    /* One slot, and two things can want it. Ordered by which the operator has
       to act on sooner: a suspended rider holding somebody's dinner is a phone
       call to make now, an early approval is a note for the file. */
    const warning = (() => {
      if (wanted !== 'approved' && driver.currentOrderNumber) {
        return `This rider is still carrying ${driver.currentOrderNumber}. `
          + 'They keep that order — call them, or have them release it in the app.';
      }
      if (approvingEarly) {
        /* Two different gaps, and they need different words. Something never
           sent is "missing"; something sent and refused is "rejected" and is
           NOT missing — saying "still missing: nothing" over a rejected
           licence is how an operator concludes the warning is noise. */
        const refused = readiness.documents
          .filter((doc) => doc.required && doc.status === 'rejected')
          .map((doc) => doc.label);
        const gaps = [
          ...(readiness.onboardingMissing.length
            ? [`still missing ${readiness.onboardingMissing.join(', ')}`] : []),
          ...(refused.length ? [`${refused.join(' and ')} rejected`] : []),
        ];
        return `Approved without complete paperwork${gaps.length ? ` — ${gaps.join('; ')}` : ''}. `
          + 'They can go online now; the gap is recorded against this decision.';
      }
      return '';
    })();

    return res.json({ success: true, data: queueRow(driver.toObject()), warning });
  } catch (error) {
    console.error(`${BADGE} deciding a rider failed:`, error.message);
    return next(error);
  }
};

// @route   POST /api/v1/admin/drivers/:driverId/cash-deposits
// @desc    Record cash a rider has handed over
// @access  Admin console (`riders.cash`)
/**
 * The rider hands over the cash they collected at doors, and the administrator
 * who received it says so here.
 *
 * Refused above what the rider is actually holding: a hand-over bigger than
 * the cash collected is either a typo or money that belongs to some other
 * ledger, and either way it would drive the balance below zero where nobody
 * would believe it. The amount is in rupees, as the operator counts it.
 */
const recordCashDeposit = async (req, res, next) => {
  try {
    if (!isUp()) return dbDown(res);

    const driverId = String(req.params.driverId || '').trim();
    const driver = await Driver.findOne({ driverId }).select('driverId name').lean();
    if (!driver) return fail(res, 404, 'NOT_FOUND', 'We could not find that rider.');

    const body = req.body || {};
    const rupees = Number(body.amount);
    const amountPaise = Math.round(rupees * 100);
    if (!Number.isFinite(rupees) || amountPaise < 1 || Math.abs(rupees * 100 - amountPaise) > 1e-6) {
      return fail(res, 400, 'INVALID_AMOUNT', 'Enter the amount received in rupees, e.g. 1619 or 1619.50.');
    }

    const method = String(body.method || 'cash').trim();
    if (!DriverCashDeposit.DEPOSIT_METHODS.includes(method)) {
      return fail(res, 400, 'INVALID_METHOD', `"method" must be one of: ${DriverCashDeposit.DEPOSIT_METHODS.join(', ')}.`);
    }

    const { inHandPaise } = (await cashInHandFor([driverId])).get(driverId);
    if (amountPaise > inHandPaise) {
      return fail(
        res, 409, 'MORE_THAN_IN_HAND',
        `${driver.name || driverId} is holding ₹${(inHandPaise / 100).toFixed(2)}. `
        + 'A hand-over cannot be more than that.',
      );
    }

    const recordedBy = req.admin?.name || req.admin?.email || 'admin';
    await DriverCashDeposit.create({
      driverId,
      amountPaise,
      method,
      reference: String(body.reference || '').trim().slice(0, 120),
      note: String(body.note || '').trim().slice(0, 500),
      recordedBy,
    });

    console.log(`${BADGE} ₹${(amountPaise / 100).toFixed(2)} cash from ${driverId} (${method}) · by ${recordedBy}`);
    return res.status(201).json({ success: true, data: await cashLedgerFor(driverId) });
  } catch (error) {
    console.error(`${BADGE} recording cash failed:`, error.message);
    return next(error);
  }
};

module.exports = {
  listDrivers, getDriver, decideDriver, decideDocument, recordCashDeposit,
};
