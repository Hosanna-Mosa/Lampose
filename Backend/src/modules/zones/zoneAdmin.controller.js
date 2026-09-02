/* ══════════════════════════════════════════════════════════════════════════
   The admin console's zone CRUD.

   The console draws a shape; this stores it. Ported from Project-X's
   `zones.controller.ts`, with its four handlers kept one-to-one — list, read,
   create, update, delete — and the validation moved into `zone.service.js` so
   create and update cannot drift apart, which is the one bug this shape of
   controller reliably grows.

   ## v1, because the reader is an administrator

   Mounted under `/api/v1/admin/zones` behind `verifyAdminToken` — the `admins`
   collection, the v1 identity system. The apps read zones through
   `/api/v2/zones`, which is a different router with a different audience and
   no way to write. Same arrangement as `driverAdmin.routes.js`.

   ## Deleting a zone does not delete anything else

   A zone is a shape and a price, not a parent. Nothing holds a foreign key to
   it — an order records what it was charged, not which zone charged it — so a
   delete is a delete. That is worth stating because the obvious worry on
   reading this file is what happens to orders inside a zone somebody removes,
   and the answer is nothing.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const Zone = require('./zone.model');
const { ZoneInputError, buildZoneFields } = require('./zone.service');

const { makeZoneId } = Zone;

const BADGE = '🗺️  [zones/admin]';
const LIST_LIMIT = 200;

const fail = (res, status, code, message) => res.status(status).json({
  success: false, code, message, error: message,
});

const dbDown = (res) => fail(
  res, 503, 'DB_DISCONNECTED', 'The server is running but not connected to the database.',
);

const isUp = () => mongoose.connection.readyState === 1;

/** The whole zone, as the console needs it — including what it must redraw. */
const adminZone = (doc) => ({
  zoneId: doc.zoneId,
  name: doc.name,
  description: doc.description || '',
  type: doc.type,
  /* Sent as the raw coordinate arrays rather than the GeoJSON wrapper: the
     console draws from these directly, and unwrapping in one place beats
     every screen reaching through `.coordinates`. Still [lng, lat]. */
  center: doc.center ? doc.center.coordinates : null,
  radius: doc.radius || null,
  boundary: doc.boundary ? doc.boundary.coordinates : null,
  pricingMultiplier: doc.pricingMultiplier,
  isActive: !!doc.isActive,
  allowedServices: doc.allowedServices || [],
  activeHours: {
    start: (doc.activeHours && doc.activeHours.start) || '',
    end: (doc.activeHours && doc.activeHours.end) || '',
  },
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

/** A `ZoneInputError` is the caller's fault; anything else is ours. */
const handle = (res, next, error, what) => {
  if (error instanceof ZoneInputError) return fail(res, 400, error.code, error.message);
  if (error && error.name === 'ValidationError') {
    /* Mongoose's own message names the path, which for a geometry error is the
       most useful sentence available. */
    return fail(res, 400, 'BAD_ZONE', error.message);
  }
  console.error(`${BADGE} ${what} failed:`, error.message);
  return next(error);
};

// @route   GET /api/v1/admin/zones
// @desc    Every zone, newest first
const listZones = async (req, res, next) => {
  try {
    if (!isUp()) return dbDown(res);

    const filter = {};
    const active = String(req.query.active || '').trim();
    if (active === 'true') filter.isActive = true;
    else if (active === 'false') filter.isActive = false;

    const type = String(req.query.type || '').trim();
    if (Zone.ZONE_TYPES.includes(type)) filter.type = type;

    const search = String(req.query.search || '').trim();
    if (search) {
      const safe = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [{ name: new RegExp(safe, 'i') }, { zoneId: new RegExp(safe, 'i') }];
    }

    const rows = await Zone.find(filter).sort({ createdAt: -1 }).limit(LIST_LIMIT).lean();
    const counts = {
      total: await Zone.countDocuments({}),
      active: await Zone.countDocuments({ isActive: true }),
      circle: await Zone.countDocuments({ type: 'circle' }),
      polygon: await Zone.countDocuments({ type: 'polygon' }),
    };

    return res.json({ success: true, count: rows.length, counts, data: rows.map(adminZone) });
  } catch (error) {
    return handle(res, next, error, 'listing zones');
  }
};

// @route   GET /api/v1/admin/zones/:zoneId
const getZone = async (req, res, next) => {
  try {
    if (!isUp()) return dbDown(res);
    const zone = await Zone.findOne({ zoneId: String(req.params.zoneId || '').trim() }).lean();
    if (!zone) return fail(res, 404, 'NOT_FOUND', 'We could not find that zone.');
    return res.json({ success: true, data: adminZone(zone) });
  } catch (error) {
    return handle(res, next, error, 'reading a zone');
  }
};

// @route   POST /api/v1/admin/zones
const createZone = async (req, res, next) => {
  try {
    if (!isUp()) return dbDown(res);

    const body = req.body || {};
    if (body.name === undefined) return fail(res, 400, 'NAME_REQUIRED', 'A zone needs a name.');
    if (body.type === undefined) return fail(res, 400, 'BAD_ZONE', 'Say whether this is a circle or a polygon.');

    const { set } = buildZoneFields(body, { partial: false });
    const zone = await Zone.create({ zoneId: makeZoneId(), ...set });

    console.log(`${BADGE} ${zone.zoneId} created · ${zone.type} · "${zone.name}" by ${req.admin?.name || 'admin'}`);
    return res.status(201).json({ success: true, data: adminZone(zone.toObject()) });
  } catch (error) {
    return handle(res, next, error, 'creating a zone');
  }
};

// @route   PATCH /api/v1/admin/zones/:zoneId
// @desc    Rename, re-price, switch on or off, or redraw
/**
 * Partial by design: the console sends only what changed.
 *
 * That is what lets the list's on/off toggle be `{ isActive: false }` and the
 * drawing modal's save be the whole shape, through one endpoint. `PUT` would
 * mean the toggle had to send a geometry it never loaded.
 */
const updateZone = async (req, res, next) => {
  try {
    if (!isUp()) return dbDown(res);

    const zone = await Zone.findOne({ zoneId: String(req.params.zoneId || '').trim() });
    if (!zone) return fail(res, 404, 'NOT_FOUND', 'We could not find that zone.');

    const body = req.body || {};
    /* A caller changing the TYPE must send the matching geometry — see
       `buildZoneFields`. A caller who sends neither is editing something else
       about the zone and keeps the shape it already has. */
    const { set, unset } = buildZoneFields(
      { ...body, type: body.type === undefined ? undefined : body.type },
      { partial: true },
    );

    Object.entries(set).forEach(([key, value]) => { zone[key] = value; });
    Object.keys(unset).forEach((key) => { zone[key] = undefined; });

    await zone.save();

    console.log(`${BADGE} ${zone.zoneId} updated · ${Object.keys(set).join(', ') || 'nothing'} by ${req.admin?.name || 'admin'}`);
    return res.json({ success: true, data: adminZone(zone.toObject()) });
  } catch (error) {
    return handle(res, next, error, 'updating a zone');
  }
};

// @route   DELETE /api/v1/admin/zones/:zoneId
const deleteZone = async (req, res, next) => {
  try {
    if (!isUp()) return dbDown(res);
    const zone = await Zone.findOneAndDelete({ zoneId: String(req.params.zoneId || '').trim() });
    if (!zone) return fail(res, 404, 'NOT_FOUND', 'We could not find that zone.');

    console.log(`${BADGE} ${zone.zoneId} deleted · "${zone.name}" by ${req.admin?.name || 'admin'}`);
    return res.json({ success: true, message: `"${zone.name}" was deleted.` });
  } catch (error) {
    return handle(res, next, error, 'deleting a zone');
  }
};

module.exports = {
  listZones, getZone, createZone, updateZone, deleteZone, adminZone,
};
