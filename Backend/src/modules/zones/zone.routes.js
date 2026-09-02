/* ══════════════════════════════════════════════════════════════════════════
   /api/v2/zones — the zones as every CLIENT reads them.

   One question and one list:

     GET /check?lat=&lng=&service=   is this point served, and by what?
     GET /                           every live zone, so an app can draw them

   ## Deliberately public

   No token on either route, which is the same decision Project-X made and is
   worth stating rather than leaving to look like an oversight.

   `/check` is asked by the User App on the address screen BEFORE anybody has
   signed in — a student deciding whether Lampose delivers to their block is
   not going to create an account to find out, and refusing to answer until
   they do is how that student leaves. There is nothing to protect: the answer
   is a boundary the product advertises.

   The list is the same information a delivery-area map on the website would
   show. It carries `publicZone`, which omits the operator's `description` and
   the audit timestamps — not because they are secret, but because a client
   that reads them starts depending on notes written for other administrators.

   Rate-limited by IP all the same: an unauthenticated route that runs a
   geospatial query is the one shape worth putting a ceiling on, and 120 checks
   a minute is far more than a person typing an address produces.

   ## Writing lives somewhere else entirely

   `/api/v1/admin/zones`, behind `verifyAdminToken`. Nothing on this router can
   create, change or delete a zone — the same split as riders, where the app
   may read its own status and only the console may set it.
   ══════════════════════════════════════════════════════════════════════════ */
const express = require('express');

const { rateLimit } = require('../../shared/middleware/rateLimit');
const { requireLamposeDb } = require('../../shared/middleware/requireDb');
const Zone = require('./zone.model');
const { findZoneFor } = require('./zone.service');

const { publicZone } = Zone;

const router = express.Router();

const fail = (res, status, code, message) => res.status(status).json({
  success: false, code, message, error: message,
});

// @route   GET /api/v2/zones/check?lat=&lng=&service=
// @desc    Is this coordinate inside a live zone, and what does it charge?
const checkPoint = async (req, res, next) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const service = req.query.service ? String(req.query.service) : undefined;

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return fail(res, 400, 'BAD_COORDS', 'Send lat and lng as numbers.');
    }
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return fail(res, 400, 'BAD_COORDS', 'That is not a real coordinate. lat is -90..90, lng is -180..180.');
    }

    const zone = await findZoneFor(lat, lng, service);

    return res.json({
      success: true,
      /* The three fields a client actually branches on, named so nobody has to
         read `data.zone !== null` to find out whether we deliver. */
      serviceable: zone !== null,
      pricingMultiplier: zone ? zone.pricingMultiplier : 1,
      zone: publicZone(zone),
    });
  } catch (error) {
    console.error('🗺️  [zones] check failed:', error.message);
    return next(error);
  }
};

// @route   GET /api/v2/zones
// @desc    Every live zone, for an app that wants to draw the served area
const listLiveZones = async (req, res, next) => {
  try {
    const service = req.query.service ? String(req.query.service) : undefined;
    const zones = await Zone.find({ isActive: true }).sort({ name: 1 }).lean();

    /* Active-hours filtering is deliberately NOT applied here. A map of where
       Lampose operates should not lose half its shapes at 3am — that is a
       "closed right now" fact, not a "not our area" one, and `/check` is where
       the difference matters. `activeHours` rides along so a client that cares
       can say "open from 10:00". */
    const data = zones
      .filter((zone) => Zone.isServiceAllowed(zone, service))
      .map(publicZone);

    return res.json({ success: true, count: data.length, data });
  } catch (error) {
    console.error('🗺️  [zones] listing failed:', error.message);
    return next(error);
  }
};

const byIp = (name, windowMs, max) => rateLimit({ name, windowMs, max });

router.get('/check', byIp('zones-check', 60 * 1000, 120), requireLamposeDb, checkPoint);
router.get('/', byIp('zones-list', 60 * 1000, 60), requireLamposeDb, listLiveZones);

module.exports = router;
