/* ══════════════════════════════════════════════════════════════════════════
   The `service_zones` collection — where Lampose operates, drawn on a map.

   Ported from Project-X's `backend/src/database/models/Zone.ts`, which is the
   implementation this feature was asked to be a copy of. The shape is kept the
   same on purpose: an administrator draws a CIRCLE (a centre and a radius) or
   a POLYGON (a ring of vertices), and every client asks the same question of
   it — "is this point inside a zone, and what does that zone say?"

   ## Two geometries, one question

   A circle is a centre and a radius; a polygon is a closed ring. They are not
   two features, they are two ways of saying the same thing, and the matcher
   answers both. Circles exist because most zones start life as "everything
   within 3km of this landmark" and drawing that as a twenty-vertex polygon by
   hand is a worse way to say it.

   ## `[longitude, latitude]`, as everywhere else in this backend

   GeoJSON's order, MongoDB's order, and the order this codebase keeps
   unswapped from Mongo to the screen — see `driver.model.js` and
   `foodRestaurant.model.js`, which carry the same warning. Getting it
   backwards does not throw: it silently puts a Rajahmundry zone in the Arctic
   Ocean and `/zones/check` answers "not serviceable" for every address in the
   city. The only defences are that inputs are named `lat`/`lng` explicitly at
   the controller boundary, and that this comment exists.

   ## The collection name is prefixed

   `service_zones`, not `zones`. The same rule `app_drivers`, `food_orders` and
   `scriper_*` follow: several products share one database, and `zones` is
   exactly the name a future feature reaches for first.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');
const crypto = require('crypto');

/** The two ways a zone can be drawn. */
const ZONE_TYPES = ['circle', 'polygon'];

/**
 * What a zone may be restricted to.
 *
 * Project-X's list is its own services (bike, auto, cab, delivery, helper).
 * Lampose's are Lampose's: an empty array means "every service", which is what
 * almost every zone will be, and is why the default is empty rather than a
 * list somebody has to maintain.
 */
const ZONE_SERVICES = ['food', 'stay'];

/** `ZN-` plus eight hex, matching `DR-`/`FP-` — see `makeDriverId`. */
const makeZoneId = () => `ZN-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

/*
 * A GeoJSON Point. Identical to the one in `driver.model.js`, deliberately —
 * an inconsistency between how a rider's position and a zone's centre are
 * stored is an inconsistency the matcher would have to know about.
 */
const pointSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: (pair) => Array.isArray(pair) && pair.length === 2
          && Number.isFinite(pair[0]) && Number.isFinite(pair[1])
          && Math.abs(pair[0]) <= 180 && Math.abs(pair[1]) <= 90,
        message: 'center.coordinates must be [longitude, latitude] and in range.',
      },
    },
  },
  { _id: false },
);

/*
 * A GeoJSON Polygon: an array of linear rings, each an array of [lng, lat].
 *
 * Only the outer ring is ever written by the console — holes are a thing
 * GeoJSON allows and nothing in this product has asked for. The validator
 * enforces what `$geoIntersects` requires and MongoDB otherwise rejects at
 * query time with a message nobody can act on: at least four positions, and
 * the last identical to the first.
 */
const polygonSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['Polygon'], default: 'Polygon' },
    coordinates: {
      type: [[[Number]]],
      required: true,
      validate: {
        validator: (rings) => {
          if (!Array.isArray(rings) || !rings.length) return false;
          return rings.every((ring) => {
            if (!Array.isArray(ring) || ring.length < 4) return false;
            const inRange = ring.every((p) => Array.isArray(p) && p.length === 2
              && Number.isFinite(p[0]) && Number.isFinite(p[1])
              && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90);
            if (!inRange) return false;
            const first = ring[0];
            const last = ring[ring.length - 1];
            return first[0] === last[0] && first[1] === last[1];
          });
        },
        message: 'boundary.coordinates must be closed rings of at least 4 [longitude, latitude] points.',
      },
    },
  },
  { _id: false },
);

const zoneSchema = new mongoose.Schema(
  {
    /* The stable public id. Everything outside this module refers to a zone by
       this string rather than by the Mongo `_id`, the same rule `driverId` and
       `restaurantId` follow. */
    zoneId: { type: String, required: true, unique: true, index: true },

    name: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },

    type: { type: String, enum: ZONE_TYPES, required: true, default: 'polygon' },

    /* Set for `circle` zones only. */
    center: { type: pointSchema, default: undefined },
    /** Metres. */
    radius: { type: Number, default: undefined, min: 1 },

    /* Set for `polygon` zones only. */
    boundary: { type: polygonSchema, default: undefined },

    /**
     * What a delivery inside this zone is multiplied by.
     *
     * Stored, never derived, and read by whatever prices an order. 1.0 is
     * "normal" and is the default, so a zone drawn purely to say WHERE we
     * deliver — which is most of them — changes no price.
     */
    pricingMultiplier: { type: Number, default: 1, min: 0.1, max: 10 },

    /* An administrator's switch. A zone that is off matches nothing, which is
       how a zone is taken out of service without deleting the shape somebody
       spent ten minutes drawing. */
    isActive: { type: Boolean, default: true, index: true },

    /* Empty means every service. See `ZONE_SERVICES`. */
    allowedServices: { type: [String], enum: ZONE_SERVICES, default: [] },

    /**
     * When this zone is live, as "HH:MM" in the server's local time.
     *
     * Both absent means always. A window that wraps past midnight (22:00 to
     * 04:00) is legal and handled — see `isWithinActiveHours`.
     */
    activeHours: {
      start: { type: String, default: '' },
      end: { type: String, default: '' },
    },
  },
  { timestamps: true, collection: 'service_zones', strict: true },
);

/*
 * The two indexes the matcher needs.
 *
 * `boundary` is queried with `$geoIntersects`, which REQUIRES a 2dsphere index
 * — without it MongoDB refuses the query rather than running it slowly, so
 * this line is correctness and not tuning. `center` is indexed for the same
 * reason a future `$near` would need it; today the circle pass is a haversine
 * in JavaScript over the (small) set of active circles, which is what
 * Project-X does and is exact where `$near` on a sphere is not.
 */
zoneSchema.index({ boundary: '2dsphere' });
zoneSchema.index({ center: '2dsphere' });
zoneSchema.index({ isActive: 1, type: 1 });

/** Metres between two lat/lng pairs. */
const haversineMeters = (lat1, lng1, lat2, lng2) => {
  const R = 6371e3;
  const phi1 = lat1 * (Math.PI / 180);
  const phi2 = lat2 * (Math.PI / 180);
  const dPhi = (lat2 - lat1) * (Math.PI / 180);
  const dLambda = (lng2 - lng1) * (Math.PI / 180);
  const a = Math.sin(dPhi / 2) ** 2
    + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/**
 * Is this zone live at this moment?
 *
 * No window means always. A window whose end is before its start wraps past
 * midnight, which is the ordinary case for a late-night zone and the one a
 * naive `start <= now <= end` gets silently wrong.
 */
const isWithinActiveHours = (zone, now = new Date()) => {
  const start = zone && zone.activeHours && zone.activeHours.start;
  const end = zone && zone.activeHours && zone.activeHours.end;
  if (!start || !end) return true;

  const minutes = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = String(start).split(':').map(Number);
  const [eh, em] = String(end).split(':').map(Number);
  if (![sh, sm, eh, em].every(Number.isFinite)) return true;

  const from = sh * 60 + sm;
  const to = eh * 60 + em;
  return from <= to
    ? minutes >= from && minutes <= to
    : minutes >= from || minutes <= to;
};

/** Empty `allowedServices`, or an absent question, means yes. */
const isServiceAllowed = (zone, service) => {
  const allowed = (zone && zone.allowedServices) || [];
  if (!allowed.length || !service) return true;
  const wanted = String(service).toLowerCase();
  return allowed.some((s) => String(s).toLowerCase() === wanted);
};

/**
 * The zone as a CLIENT is allowed to see it.
 *
 * The shape goes out because the apps draw it. What does not is anything an
 * operator wrote for operators — there is nothing secret in a zone, but a
 * client that reads `description` starts depending on it, and it is a note to
 * the next administrator rather than copy.
 */
const publicZone = (zone) => (zone ? {
  zoneId: zone.zoneId,
  name: zone.name,
  type: zone.type,
  pricingMultiplier: zone.pricingMultiplier,
  ...(zone.type === 'circle'
    ? { center: zone.center ? zone.center.coordinates : null, radius: zone.radius || null }
    : { boundary: zone.boundary ? zone.boundary.coordinates : null }),
  allowedServices: zone.allowedServices || [],
  activeHours: {
    start: (zone.activeHours && zone.activeHours.start) || '',
    end: (zone.activeHours && zone.activeHours.end) || '',
  },
} : null);

const Zone = mongoose.models.Zone
  || mongoose.model('Zone', zoneSchema, 'service_zones');

module.exports = Zone;
module.exports.ZONE_TYPES = ZONE_TYPES;
module.exports.ZONE_SERVICES = ZONE_SERVICES;
module.exports.makeZoneId = makeZoneId;
module.exports.haversineMeters = haversineMeters;
module.exports.isWithinActiveHours = isWithinActiveHours;
module.exports.isServiceAllowed = isServiceAllowed;
module.exports.publicZone = publicZone;
