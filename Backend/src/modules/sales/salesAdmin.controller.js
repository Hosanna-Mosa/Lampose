/* ══════════════════════════════════════════════════════════════════════════
   The admin console's side of sales tracking: creating an account, the
   roster, and one rep's path in a chosen time window.

   Nothing here can touch a rep's own DUTY status — going online or offline
   is the rep's own choice, made from their own token, on
   `PATCH /api/v2/sales/me/duty`. The rule this module is built on is the same
   one `driverAdmin.controller.js` states for a rider's own account: an
   administrator manages the ACCOUNT, never impersonates the person behind it.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');
const SalesRep = require('./salesRep.model');
const SalesLocationPing = require('./salesLocationPing.model');

const isUp = () => mongoose.connection.readyState === 1;

const fail = (res, status, code, message) => res.status(status).json({
  success: false, code, message, error: message,
});

const dbDown = (res) => fail(
  res, 503, 'DB_DISCONNECTED', 'Not connected to the database right now.',
);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * A new sales rep — created here, not self-registered. `sales.routes.js`
 * carries no public register route any more; this is the only door. The
 * administrator types the email and password themselves and hands that
 * exact pair to the rep, so nothing here generates or emails a credential —
 * the console already has it, because the console is where it was typed.
 */
const createSalesRep = async (req, res) => {
  if (!isUp()) return dbDown(res);
  try {
    const body = req.body || {};
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');

    if (!name || !email || !password) {
      return fail(res, 400, 'VALIDATION', 'Name, email and password are all required.');
    }
    if (!EMAIL_RE.test(email)) {
      return fail(res, 400, 'BAD_EMAIL', 'Please enter a valid email address.');
    }
    if (password.length < 6) {
      return fail(res, 400, 'WEAK_PASSWORD', 'Password must be at least 6 characters.');
    }

    const existing = await SalesRep.findOne({ email });
    if (existing) {
      return fail(res, 409, 'EMAIL_TAKEN', 'A sales rep already exists with that email.');
    }

    const passwordHash = await SalesRep.hashPassword(password);
    const rep = await SalesRep.create({
      salesRepId: SalesRep.makeSalesRepId(),
      name,
      email,
      passwordHash,
    });

    return res.status(201).json({ success: true, data: { salesRep: rep.toAdminSummary() } });
  } catch (error) {
    /* Same duplicate-key race `sales.controller.js` used to accept for
       self-registration — two admins saving the same email a moment apart. */
    if (error && error.code === 11000) {
      return fail(res, 409, 'EMAIL_TAKEN', 'A sales rep already exists with that email.');
    }
    console.error('❌ [sales-admin] createSalesRep failed:', error.message);
    return fail(res, 500, 'FAILED', 'Could not create that account.');
  }
};

/**
 * Everyone on the roster, on duty first and then by who was seen most
 * recently — the shape an operator scanning for "who is out right now"
 * wants, without a search box this small a team does not need yet.
 */
const listSalesReps = async (req, res) => {
  if (!isUp()) return dbDown(res);
  try {
    const reps = await SalesRep.find({})
      .sort({ onDuty: -1, locationUpdatedAt: -1 })
      .limit(200);

    return res.json({
      success: true,
      data: { salesReps: reps.map((rep) => rep.toAdminSummary()) },
    });
  } catch (error) {
    console.error('❌ [sales-admin] listSalesReps failed:', error.message);
    return fail(res, 500, 'FAILED', 'Could not load the sales roster.');
  }
};

/**
 * A date the query string might carry, or nothing.
 *
 * `undefined` on anything that is not a real date — an operator's typo in
 * the address bar must fall back to the default window rather than crash the
 * page with a Mongo cast error on an "Invalid Date".
 */
const parseWhen = (value) => {
  if (!value) return undefined;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? undefined : d;
};

/**
 * One rep's path in a chosen time window.
 *
 * `from`/`to` (ISO strings) let the console ask for anything: the last hour,
 * a two-hour block, a whole past date — every fix this rep has ever sent is
 * still in `sales_location_pings`, so the query is the only thing that
 * changes. With NEITHER given, this defaults to the same thing it always
 * has: the CURRENT duty session if they are online now, or today since
 * midnight if they are not — so clicking a name with no filter chosen still
 * shows something sensible rather than every fix the rep has ever sent.
 */
const getSalesRepPath = async (req, res) => {
  if (!isUp()) return dbDown(res);
  try {
    const { salesRepId } = req.params;
    const rep = await SalesRep.findOne({ salesRepId });
    if (!rep) return fail(res, 404, 'NOT_FOUND', 'No sales rep with that id.');

    const from = parseWhen(req.query.from);
    const to = parseWhen(req.query.to);

    let since;
    let until;
    if (from || to) {
      since = from ?? new Date(0);
      until = to ?? new Date();
    } else {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      since = rep.onDuty && rep.dutyStartedAt ? rep.dutyStartedAt : startOfToday;
      until = new Date();
    }

    const pings = await SalesLocationPing
      .find({ salesRepId, recordedAt: { $gte: since, $lte: until } })
      .sort({ recordedAt: 1 })
      .limit(5000);

    return res.json({
      success: true,
      data: {
        salesRep: rep.toAdminSummary(),
        since,
        until,
        path: pings.map((p) => ({
          lat: p.location.coordinates[1],
          lng: p.location.coordinates[0],
          accuracy: p.accuracy ?? null,
          at: p.recordedAt,
        })),
      },
    });
  } catch (error) {
    console.error('❌ [sales-admin] getSalesRepPath failed:', error.message);
    return fail(res, 500, 'FAILED', 'Could not load that rep\'s path.');
  }
};

module.exports = {
  createSalesRep, listSalesReps, getSalesRepPath,
};
