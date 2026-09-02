/* ══════════════════════════════════════════════════════════════════════════
   Building a zone from what an administrator drew, and finding the one a
   point falls in.

   Ported from Project-X's `zones.service.ts`. Two things live here rather than
   in a controller, because both have exactly one correct implementation and
   three callers each:

     buildZoneFields   turns a request body into stored geometry, refusing the
                       shapes MongoDB would otherwise reject at query time
     findZoneFor       the question every client asks: what zone is this point
                       in, right now, for this service?

   ## Polygons are asked of MongoDB, circles are measured here

   `$geoIntersects` is exact for polygons and needs the 2dsphere index the
   model declares. Circles have no such operator — `$near` sorts by distance
   but does not filter to a radius the way this needs — so active circles are
   read and measured with a haversine, which is what Project-X does. There are
   tens of zones, not thousands; when that stops being true the circle pass
   becomes `$geoWithin: { $centerSphere: [...] }`, and the seam is this one
   function.

   ## An inactive zone matches nothing

   Filtered in the query rather than after it, so a city with one live zone
   does not read every shape ever drawn.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const Zone = require('./zone.model');

const {
  ZONE_TYPES, ZONE_SERVICES, haversineMeters, isWithinActiveHours, isServiceAllowed,
} = Zone;

/** Thrown for anything a caller can fix by sending different input. */
class ZoneInputError extends Error {
  constructor(message, code = 'BAD_ZONE') {
    super(message);
    this.name = 'ZoneInputError';
    this.code = code;
  }
}

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/**
 * Close a ring if the console did not.
 *
 * GeoJSON requires the last position to equal the first, and a drawing UI that
 * lets somebody place the final vertex and press Save has no natural moment to
 * add it. Project-X's admin closes the loop client-side; this closes it again
 * server-side, because the rule belongs to the data rather than to one client.
 */
const closeRing = (ring) => {
  if (!Array.isArray(ring) || ring.length < 3) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return ring;
  return [...ring, first];
};

/**
 * The geometry half of a create or update, validated.
 *
 * Returns the fields to set AND the fields to clear — switching a zone from a
 * polygon to a circle has to REMOVE the boundary, or the document carries two
 * geometries and the matcher will happily match the stale one.
 */
const buildZoneFields = (body = {}, { partial = false } = {}) => {
  const set = {};
  const unset = {};

  const type = body.type === undefined ? undefined : String(body.type).toLowerCase();
  if (type !== undefined) {
    if (!ZONE_TYPES.includes(type)) {
      throw new ZoneInputError(`"type" must be one of: ${ZONE_TYPES.join(', ')}.`);
    }
    set.type = type;
  }

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) throw new ZoneInputError('A zone needs a name.', 'NAME_REQUIRED');
    set.name = name.slice(0, 80);
  }
  if (body.description !== undefined) set.description = String(body.description).trim().slice(0, 300);
  if (body.isActive !== undefined) set.isActive = body.isActive === true || body.isActive === 'true';

  if (body.pricingMultiplier !== undefined) {
    const multiplier = num(body.pricingMultiplier);
    if (multiplier === null || multiplier < 0.1 || multiplier > 10) {
      throw new ZoneInputError('The pricing multiplier must be a number between 0.1 and 10.', 'BAD_MULTIPLIER');
    }
    set.pricingMultiplier = multiplier;
  }

  if (body.allowedServices !== undefined) {
    const list = Array.isArray(body.allowedServices) ? body.allowedServices : [];
    const bad = list.find((s) => !ZONE_SERVICES.includes(String(s)));
    if (bad) {
      throw new ZoneInputError(`"${bad}" is not a service. Use: ${ZONE_SERVICES.join(', ')}.`, 'BAD_SERVICE');
    }
    set.allowedServices = list.map(String);
  }

  if (body.activeHours !== undefined) {
    const hours = body.activeHours || {};
    const shape = /^([01]\d|2[0-3]):[0-5]\d$/;
    const start = String(hours.start || '').trim();
    const end = String(hours.end || '').trim();
    if (start && !shape.test(start)) throw new ZoneInputError('Start time must be HH:MM.', 'BAD_HOURS');
    if (end && !shape.test(end)) throw new ZoneInputError('End time must be HH:MM.', 'BAD_HOURS');
    /* One without the other is not a window. Refused rather than half-applied,
       because "live from 22:00" with no end reads as a restriction and would
       silently behave as no restriction at all. */
    if (Boolean(start) !== Boolean(end)) {
      throw new ZoneInputError('Give both a start and an end time, or neither.', 'BAD_HOURS');
    }
    set.activeHours = { start, end };
  }

  /* ── The geometry ─────────────────────────────────────────────────────
     On a create, `type` decides and the matching geometry is required. On a
     partial update it is only checked when the caller sent it — but a caller
     who CHANGES the type must send the new geometry with it, because there is
     no sensible way to derive a polygon from a radius. */
  const effectiveType = set.type;

  if (effectiveType === 'circle') {
    const raw = body.center && body.center.coordinates ? body.center.coordinates : body.center;
    const pair = Array.isArray(raw) ? raw.map(num) : null;
    const radius = num(body.radius);

    if (!pair || pair.length !== 2 || pair.some((v) => v === null)) {
      throw new ZoneInputError('A circle needs a centre as [longitude, latitude].', 'BAD_CENTER');
    }
    if (Math.abs(pair[0]) > 180 || Math.abs(pair[1]) > 90) {
      throw new ZoneInputError('That centre is not a real coordinate. Order is [longitude, latitude].', 'BAD_CENTER');
    }
    if (radius === null || radius <= 0) {
      throw new ZoneInputError('A circle needs a radius in metres.', 'BAD_RADIUS');
    }

    set.center = { type: 'Point', coordinates: pair };
    set.radius = radius;
    /* The other geometry goes, or the matcher can match a shape the operator
       has stopped editing. */
    unset.boundary = '';
  } else if (effectiveType === 'polygon') {
    const raw = body.boundary && body.boundary.coordinates ? body.boundary.coordinates : body.boundary;
    if (!Array.isArray(raw) || !raw.length) {
      throw new ZoneInputError('A polygon needs at least three points.', 'BAD_BOUNDARY');
    }

    /* Accept BOTH shapes a client might send: a bare ring [[lng,lat], …] and a
       full GeoJSON coordinate array [[[lng,lat], …]]. The drawing UI holds a
       bare ring while somebody is placing vertices, and requiring it to wrap
       before posting is a rule that gets forgotten exactly once. */
    const rings = Array.isArray(raw[0]) && Array.isArray(raw[0][0]) ? raw : [raw];
    const closed = rings.map((ring) => closeRing(ring.map((p) => [num(p[0]), num(p[1])])));

    const outer = closed[0];
    if (!outer || outer.length < 4) {
      throw new ZoneInputError('A polygon needs at least three points.', 'BAD_BOUNDARY');
    }
    if (outer.some((p) => p[0] === null || p[1] === null
      || Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90)) {
      throw new ZoneInputError('One of those points is not a real coordinate. Order is [longitude, latitude].', 'BAD_BOUNDARY');
    }

    set.boundary = { type: 'Polygon', coordinates: closed };
    unset.center = '';
    unset.radius = '';
  } else if (!partial) {
    throw new ZoneInputError(`"type" must be one of: ${ZONE_TYPES.join(', ')}.`);
  }

  return { set, unset };
};

/**
 * The zone a point is in, or null.
 *
 * Polygons first because they are the precise answer and MongoDB does the
 * work; circles second. The first match wins — overlapping zones are legal and
 * the console shows them, and "which one" is decided by drawing order rather
 * than by an arbitration rule nobody asked for.
 */
const findZoneFor = async (lat, lng, service) => {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (mongoose.connection.readyState !== 1) return null;

  const now = new Date();
  const usable = (zone) => isWithinActiveHours(zone, now) && isServiceAllowed(zone, service);

  try {
    const polygons = await Zone.find({
      type: 'polygon',
      isActive: true,
      boundary: {
        $geoIntersects: { $geometry: { type: 'Point', coordinates: [lng, lat] } },
      },
    }).sort({ createdAt: 1 });

    const hit = polygons.find(usable);
    if (hit) return hit;
  } catch (error) {
    /* A missing 2dsphere index, or a ring MongoDB will not accept. Logged and
       stepped over rather than thrown: the circle pass below is a real answer,
       and a serviceability check that 500s takes the whole checkout with it. */
    console.error(`🗺️  [zones] polygon match failed: ${error.message}`);
  }

  const circles = await Zone.find({ type: 'circle', isActive: true }).sort({ createdAt: 1 });
  for (const zone of circles) {
    const pair = zone.center && zone.center.coordinates;
    if (!Array.isArray(pair) || !zone.radius) continue;
    if (haversineMeters(lat, lng, pair[1], pair[0]) <= zone.radius && usable(zone)) return zone;
  }

  return null;
};

module.exports = {
  ZoneInputError,
  buildZoneFields,
  closeRing,
  findZoneFor,
};
