/* ══════════════════════════════════════════════════════════════════════════
   The sales rep's own account: sign in, read the profile, the duty switch
   and the position it turns on.

   ## No self-registration

   There used to be a `register` handler here, reachable with no invitation
   and no admin gate. It is gone: an account is now created by an
   administrator, in the console, who hands the rep the exact email and
   password they typed in — see `salesAdmin.controller.js`'s `createSalesRep`.
   A sales rep is company-issued access to a live position feed, not a
   product signup, and a stranger who found this URL had no business being
   able to create one. `login` below is unchanged; only the door that used
   to let anyone open a NEW account is shut.

   ## Why the switch and the position are two routes, not one

   `PATCH /me/duty` is a rare, deliberate action — a rep pressing the switch
   once when they head out and once when they are done. `PATCH /me/location`
   is a frequent, automatic one — the app calling it every few seconds while
   on duty, unattended. Merging them would mean every heartbeat re-validates
   and re-writes fields (`dutyStartedAt`, `status`) that a position update has
   no business touching, and would mean the duty route's rate limit — generous,
   because a person presses it — has to also survive a location heartbeat's
   volume, which is the wrong ceiling for either caller.

   ## Why a position is refused when off duty

   `updateLocation` writes nothing if `onDuty` is false. A rep who closed the
   app mid-shift without pressing the switch is not currently tracked — the
   client should not be calling this while offline at all, and a server that
   quietly accepted a stray fix would let a bug on the client silently start
   recording a rep who believes they are off the clock.
   ══════════════════════════════════════════════════════════════════════════ */
const SalesRep = require('./salesRep.model');
const SalesLocationPing = require('./salesLocationPing.model');
const { signSalesToken } = require('./salesAuth.middleware');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const fail = (res, status, code, message) => res.status(status).json({
  success: false, code, message, error: message,
});

const WRONG_CREDENTIALS = 'That email and password do not match.';

const login = async (req, res) => {
  try {
    const body = req.body || {};
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');

    if (!email || !password) {
      return fail(res, 400, 'MISSING_CREDENTIALS', 'Enter your email address and your password.');
    }
    if (!EMAIL_RE.test(email)) {
      return fail(res, 400, 'BAD_EMAIL', 'Please enter a valid email address.');
    }

    const rep = await SalesRep.findOne({ email }).select('+passwordHash');
    const ok = rep ? await rep.verifyPassword(password) : false;
    if (!ok) {
      /* 401 and the same sentence whichever it was — the credential that was
         wrong is not named, the same rule every login in this process follows. */
      return fail(res, 401, 'INVALID_CREDENTIALS', WRONG_CREDENTIALS);
    }
    if (rep.status !== 'active') {
      return fail(res, 403, 'ACCOUNT_INACTIVE', 'This account has been deactivated.');
    }

    rep.lastLoginAt = new Date();
    await rep.save();

    const token = signSalesToken(rep);
    if (!token) {
      return fail(res, 503, 'AUTH_NOT_CONFIGURED', 'Sign-in is unavailable on this server right now.');
    }

    return res.json({ success: true, data: { token, salesRep: rep.toPublic() } });
  } catch (error) {
    console.error('❌ [sales] login failed:', error.message);
    return fail(res, 500, 'FAILED', 'We could not sign you in. Try again in a moment.');
  }
};

const getMe = async (req, res) => {
  return res.json({ success: true, data: { salesRep: req.salesRep.toPublic() } });
};

/** A finite pair of numbers, in the range a real fix can report. Named `lat`/
    `lng` at the call site on purpose — see the header on `pointSchema` in
    `salesRep.model.js` for why the order is never trusted by position alone. */
const validCoords = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng)
  && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

/* Optional — an app build from before it was sent simply omits it. */
const accuracyOf = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/**
 * The switch. Turning ON requires a starting fix — "where he started" is not
 * a sentence this route can write without one. Turning OFF needs nothing but
 * the flag itself; the last known position is left exactly where it was.
 */
const setDuty = async (req, res) => {
  try {
    const body = req.body || {};
    const onDuty = Boolean(body.onDuty);
    const rep = req.salesRep;

    if (onDuty) {
      const lat = Number(body.lat);
      const lng = Number(body.lng);
      if (!validCoords(lat, lng)) {
        return fail(res, 400, 'LOCATION_REQUIRED', 'A starting location is required to go online.');
      }

      const now = new Date();
      rep.onDuty = true;
      rep.dutyStartedAt = now;
      rep.currentLocation = { type: 'Point', coordinates: [lng, lat] };
      rep.locationUpdatedAt = now;
      await rep.save();

      await SalesLocationPing.create({
        salesRepId: rep.salesRepId,
        location: { type: 'Point', coordinates: [lng, lat] },
        accuracy: accuracyOf(body.accuracy),
        recordedAt: now,
      });
    } else {
      rep.onDuty = false;
      rep.dutyStartedAt = null;
      await rep.save();
    }

    return res.json({ success: true, data: { salesRep: rep.toPublic() } });
  } catch (error) {
    console.error('❌ [sales] setDuty failed:', error.message);
    return fail(res, 500, 'FAILED', 'We could not update your duty status. Try again in a moment.');
  }
};

/**
 * A heartbeat, while on duty. Silently refused while off — see the header.
 * Writes the account's own `currentLocation` (what the admin roster's list
 * reads) AND appends a ping (what one rep's map view draws as a path) in the
 * same call, so the two can never read a different position for "now".
 */
const updateLocation = async (req, res) => {
  try {
    const body = req.body || {};
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (!validCoords(lat, lng)) {
      return fail(res, 400, 'VALIDATION', 'A valid lat and lng are required.');
    }

    const rep = req.salesRep;
    if (!rep.onDuty) {
      return fail(res, 409, 'NOT_ON_DUTY', 'Go online before sending a location.');
    }

    const now = new Date();
    rep.currentLocation = { type: 'Point', coordinates: [lng, lat] };
    rep.locationUpdatedAt = now;
    await rep.save();

    await SalesLocationPing.create({
      salesRepId: rep.salesRepId,
      location: { type: 'Point', coordinates: [lng, lat] },
      accuracy: accuracyOf(body.accuracy),
      recordedAt: now,
    });

    return res.json({ success: true, data: { locationUpdatedAt: now } });
  } catch (error) {
    console.error('❌ [sales] updateLocation failed:', error.message);
    return fail(res, 500, 'FAILED', 'We could not record that location. Try again in a moment.');
  }
};

module.exports = {
  login, getMe, setDuty, updateLocation,
};
