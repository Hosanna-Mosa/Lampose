/* ══════════════════════════════════════════════════════════════════════════
   Beds: how many exist, how many are free, and the only place either moves.

   ## Why this is a module and not three lines in the accept handler

   Four unrelated things fill or free a bed — a stay request being accepted, an
   owner adding a walk-in, a booking being cancelled, a tenant checking out —
   and every one of them lives in a different controller. A counter that four
   controllers each nudge in their own way is a counter that drifts, and the
   drift is invisible until an owner says "it says full and it isn't". So the
   arithmetic happens here, in functions named after the events, and nowhere
   else.

   ## Capacity and availability are different facts

     categoryDetails.sharingRooms/sharingBeds   CAPACITY. What the building
                                                has. Onboarding writes it, an
                                                owner changes it, and it does
                                                not move on its own.

     partner_share_types.availableBeds          AVAILABILITY. What is free
                                                this afternoon. Moves several
                                                times a day and belongs to
                                                nobody's form.

   Keeping them in one field would mean an owner correcting a typo in their
   room count silently marking four occupied beds as free.

   ## Why a stored counter rather than counting bookings

   Because the whole conflict rule is one atomic conditional update:

     { shareTypeId, availableBeds: { $gt: 0 } }  →  $inc -1

   Two owners tapping Accept for the last bed in the same millisecond both hit
   that filter; Mongo serialises them on the document, one matches and one does
   not. A number derived by counting bookings cannot be claimed atomically —
   there is nothing to put a filter on — and every alternative (a lock, a
   transaction, a read-then-write) is either unavailable on a single-server
   deployment or wrong.

   The price of a stored counter is that it can drift from reality if a writer
   forgets. That is paid for by `reconcile()` below, and by the fact that every
   writer is in this file.

   ## A property with no recorded count is REFUSED, not treated as full

   Most of the catalogue was onboarded before beds were asked for. Those
   properties have `totalBeds: null`, and `requestableOptions()` leaves them
   out rather than reporting zero — "we have not been told" and "there is
   nothing free" look identical to a student and are completely different
   problems for support.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const { PartnerShareType, PartnerBooking } = require('../partners/partnerDomains.model');
const Partner = require('../partners/partner.model');
const { sharingOptionsFor, shareTypeIdFor } = require('../listings/sharing.util');

const { phoneKey } = Partner;

/**
 * Booking states that are sitting on a bed.
 *
 * `upcoming` counts: the bed is spoken for even though nobody has arrived, and
 * an owner who could re-let it would have two people at one door. `completed`
 * and `cancelled` do not — those beds are free.
 */
const OCCUPYING = ['in_house', 'arriving', 'departing', 'upcoming'];

/* ------------------------------------------------------------------ *
 * Sync — capacity in, rows out
 * ------------------------------------------------------------------ */

/**
 * Bring a property's `partner_share_types` rows in line with its capacity.
 *
 * Called after every property write. Idempotent by construction: it is safe to
 * run on every save, on a property that has never had rows, and on one whose
 * options have not changed.
 *
 * ## The delta rule, which is the whole reason this is not an upsert
 *
 * An owner changing "2 Sharing" from six beds to eight has built nothing — they
 * are correcting a number. So `availableBeds` moves by the DELTA (+2), not to
 * the new total. Setting it to eight would mark every occupied bed free, and
 * the owner would find out by double-booking somebody.
 *
 * On the first sync there is no previous row to take a delta from, so
 * availability is seeded from reality instead: capacity minus the bookings
 * already sitting on it.
 *
 * Never throws — a property must remain saveable even if its inventory rows
 * cannot be written. Returns what it did so the caller can log it.
 */
const syncShareTypes = async (property) => {
  const result = { synced: 0, created: 0, removed: 0, skipped: 0 };
  if (!property || mongoose.connection.readyState !== 1) return result;

  try {
    const propertyId = String(property._id || property.id || '');
    if (!propertyId) return result;

    const partnerPhoneDigits = phoneKey(property.ownerMobile);
    const options = sharingOptionsFor(property);
    const wanted = new Set();

    for (const option of options) {
      /* No count recorded is not zero beds — it is an unanswered question, and
         a row claiming zero would read as "full" everywhere downstream. */
      if (!option.totalBeds) { result.skipped += 1; continue; }

      const shareTypeId = shareTypeIdFor(propertyId, option.label);
      wanted.add(shareTypeId);

      const existing = await PartnerShareType.findOne({ shareTypeId });

      if (!existing) {
        /* Seeded from reality rather than from capacity. A property being
           given counts for the first time may already have tenants in it. */
        const occupied = await PartnerBooking.countDocuments({
          propertyId,
          shareType: option.label,
          status: { $in: OCCUPYING },
        });

        await PartnerShareType.create({
          partnerPhoneDigits,
          propertyId,
          shareTypeId,
          name: option.label,
          monthlyPrice: option.price || 0,
          totalBeds: option.totalBeds,
          availableBeds: Math.max(0, option.totalBeds - occupied),
          isAvailable: true,
        });
        result.created += 1;
        continue;
      }

      const delta = option.totalBeds - existing.totalBeds;
      /* Beds held outside the app cannot outnumber the building. A negative
         value (bookings the owner marked vacant) is kept as it is. */
      const offline = Math.min(option.totalBeds, existing.offlineOccupied || 0);

      existing.partnerPhoneDigits = partnerPhoneDigits;
      existing.name = option.label;
      existing.monthlyPrice = option.price || 0;
      existing.totalBeds = option.totalBeds;
      existing.offlineOccupied = offline;
      /* Clamped at both ends: a capacity cut below what is occupied cannot
         push availability negative, and no delta can put it above the beds
         that are not held outside the app. */
      existing.availableBeds = Math.min(
        option.totalBeds - Math.max(0, offline),
        Math.max(0, existing.availableBeds + delta),
      );
      await existing.save();
      result.synced += 1;
    }

    /* An option the property no longer offers. Removed rather than left
       behind, or a request could claim a bed in a room type that is gone. */
    const stale = await PartnerShareType.find({ propertyId }).select('shareTypeId').lean();
    const orphans = stale
      .map((row) => row.shareTypeId)
      .filter((id) => !wanted.has(id));

    if (orphans.length) {
      await PartnerShareType.deleteMany({ shareTypeId: { $in: orphans } });
      result.removed = orphans.length;
    }

    return result;
  } catch (error) {
    /* Loud, but not fatal. A property that saved without its inventory rows is
       a property that cannot be requested until the next save — degraded, not
       broken, which is the rule this backend follows everywhere. */
    console.error('[inventory] share-type sync failed:', error.message);
    return result;
  }
};

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

/** Every share-type row for these properties, keyed by `shareTypeId`. */
const rowsFor = async (propertyIds) => {
  if (mongoose.connection.readyState !== 1) return new Map();
  const ids = (Array.isArray(propertyIds) ? propertyIds : [propertyIds]).map(String).filter(Boolean);
  if (!ids.length) return new Map();

  const rows = await PartnerShareType.find({ propertyId: { $in: ids } }).lean();
  return new Map(rows.map((row) => [row.shareTypeId, row]));
};

/**
 * The sharing options a student may actually request, with live numbers.
 *
 * An option is requestable when it has a row (so a count was recorded), the
 * owner has not switched it off, and a bed is free. Options that fail any of
 * those are still RETURNED — with `requestable: false` and a reason — because
 * a listing that silently drops its full room types looks like a listing with
 * fewer options rather than one that is busy.
 */
const requestableOptions = async (property) => {
  const propertyId = String(property._id || property.id || '');
  const rows = await rowsFor(propertyId);

  return sharingOptionsFor(property).map((option) => {
    const row = rows.get(option.shareTypeId);

    if (!row) {
      return {
        ...option,
        availableBeds: null,
        requestable: false,
        reason: 'NO_INVENTORY_RECORDED',
      };
    }
    if (row.isAvailable === false) {
      return {
        ...option,
        totalBeds: row.totalBeds,
        availableBeds: row.availableBeds,
        requestable: false,
        reason: 'OWNER_PAUSED',
      };
    }
    if (row.availableBeds <= 0) {
      return {
        ...option,
        totalBeds: row.totalBeds,
        availableBeds: 0,
        requestable: false,
        reason: 'NO_BEDS_FREE',
      };
    }
    return {
      ...option,
      totalBeds: row.totalBeds,
      availableBeds: row.availableBeds,
      requestable: true,
      reason: null,
    };
  });
};

/** One option by its label, with live numbers. Null when the label is unknown. */
const findRequestableOption = async (property, label) => {
  if (!label) return null;
  const wanted = String(label).trim().toLowerCase();
  const options = await requestableOptions(property);
  return options.find((option) => option.label.toLowerCase() === wanted) || null;
};

/* ------------------------------------------------------------------ *
 * Moving beds
 * ------------------------------------------------------------------ */

/**
 * Take one bed, or fail.
 *
 * THE conflict rule, and the reason `availableBeds` is a stored number. The
 * filter is the guard: two callers racing for the last bed both send this
 * update, Mongo applies them one at a time to the document, and the second one
 * matches nothing because `availableBeds` is no longer greater than zero.
 *
 * Returns the updated row on success and `null` when there was nothing to
 * take. A caller that gets null must not proceed — see the ordering note in
 * the accept handler.
 *
 * `isAvailable` is deliberately NOT in the filter. An owner pausing a room
 * type should stop new requests being made, which is checked at creation; it
 * should not strand a request they are in the middle of accepting.
 */
const claimBed = async (shareTypeId) => {
  if (!shareTypeId || mongoose.connection.readyState !== 1) return null;
  return PartnerShareType.findOneAndUpdate(
    { shareTypeId, availableBeds: { $gt: 0 } },
    { $inc: { availableBeds: -1 } },
    { new: true },
  );
};

/**
 * When the last bed in a pool went, as a sentence fragment.
 *
 * Two sources, best first. An acceptance stamps `decidedAt` and names the pool
 * it took from, so that is the real moment. Where no acceptance names this
 * pool — an older row, or a request answered over WhatsApp before the id was
 * recorded — the share type's own `updatedAt` is when its count last moved,
 * which is close enough to say "booked around then" and far better than a
 * bare "full".
 *
 * One collection covers both surfaces: app requests are visit requests with
 * `channel: 'app'`, and both claim from the same pool, so whoever took the
 * last bed is found either way.
 *
 * Null when neither source knows, and every caller then omits the time rather
 * than inventing one.
 */
const bookedAtLabel = async (shareTypeId) => {
  const at = await lastBookedAt(shareTypeId);
  if (!at) return null;
  /* IST: where the customers and the owners both are. */
  return new Date(at).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
    hour12: true, timeZone: 'Asia/Kolkata',
  }).replace(',', ' at');
};

const lastBookedAt = async (shareTypeId) => {
  if (!shareTypeId || mongoose.connection.readyState !== 1) return null;
  try {
    const VisitRequest = require('../visits/visitRequest.model');
    const taken = await VisitRequest
      .findOne({ shareTypeId, status: 'confirmed' })
      .sort({ decidedAt: -1 })
      .select('decidedAt')
      .lean();
    if (taken && taken.decidedAt) return taken.decidedAt;

    const row = await PartnerShareType.findOne({ shareTypeId }).select('updatedAt').lean();
    return (row && row.updatedAt) || null;
  } catch (error) {
    console.warn('[inventory] Could not read when the last bed went:', error.message);
    return null;
  }
};

/**
 * Give one bed back.
 *
 * Three callers: the accept handler when it took a bed and then lost the
 * request, a cancelled booking, and a check-out. Capped at `totalBeds` with a
 * second conditional update rather than an unguarded `$inc`, because a double
 * release — a cancel replayed, a check-out tapped twice — would otherwise
 * invent a bed the building does not have.
 *
 * Idempotent at the ceiling, not below it: releasing more times than beds were
 * taken stops at capacity rather than climbing. The ceiling leaves out beds
 * held outside the app (`offlineOccupied`) — a Lampose tenant checking out
 * does not free the room the owner said a phone tenant is in.
 */
const releaseBed = async (shareTypeId) => {
  if (!shareTypeId || mongoose.connection.readyState !== 1) return null;
  return PartnerShareType.findOneAndUpdate(
    {
      shareTypeId,
      $expr: {
        $lt: [
          '$availableBeds',
          /* Only a POSITIVE hold lowers the ceiling; the building never has
             more free beds than its total. */
          { $subtract: ['$totalBeds', { $max: [0, { $ifNull: ['$offlineOccupied', 0] }] }] },
        ],
      },
    },
    { $inc: { availableBeds: 1 } },
    { new: true },
  );
};

/**
 * The share-type row a booking sits on, by the label it recorded.
 *
 * Bookings store `shareType` as a label rather than an id — the collection
 * predates share-type rows entirely — so releasing a bed on check-out has to
 * go back through the property to find which row the label meant.
 */
const shareTypeIdForBooking = (booking) => {
  if (!booking || !booking.propertyId || !booking.shareType) return null;
  return shareTypeIdFor(booking.propertyId, booking.shareType);
};

/* ------------------------------------------------------------------ *
 * Free beds, as a person sees and corrects them
 * ------------------------------------------------------------------ */

/**
 * Lampose bookings sitting on a bed, per share type, for one property.
 *
 * Keyed by `shareTypeId` (label slugged), the same way a booking finds its row
 * on check-out, so "2 Sharing" and "2 sharing" count against one pool.
 */
const bookedInAppByShareType = async (propertyId) => {
  const counts = new Map();
  if (!propertyId || mongoose.connection.readyState !== 1) return counts;

  const grouped = await PartnerBooking.aggregate([
    { $match: { propertyId: String(propertyId), status: { $in: OCCUPYING } } },
    { $group: { _id: '$shareType', n: { $sum: 1 } } },
  ]);
  for (const { _id: label, n } of grouped) {
    if (!label) continue;
    const id = shareTypeIdFor(propertyId, label);
    counts.set(id, (counts.get(id) || 0) + n);
  }
  return counts;
};

/**
 * Every sharing / room type a property offers, with capacity AND what is free.
 *
 * The one read both the owner's app and the admin console draw the "free beds
 * now" field from, so the two can never show different numbers. Options with
 * no bed count recorded are still listed (`recorded: false`) — the screen has
 * to be able to say "set total beds first" rather than silently leave a room
 * type out.
 *
 *   capacity         what the property says the building has (categoryDetails)
 *   availableBeds    free right now — the number students see as "N left"
 *   bookedInApp      Lampose bookings on a bed (upcoming / arriving / in-house / departing)
 *   offlineOccupied  beds a person said are taken outside the app
 *   markedVacant     Lampose bookings a person said have actually left (the
 *                    booking is still open, the bed was freed anyway)
 *   maxFree          free beds WITHOUT overriding a Lampose booking (capacity − bookedInApp)
 *   totalBeds        the hard limit: free beds can never exceed it
 */
const inventoryForProperty = async (property) => {
  const propertyId = String((property && (property._id || property.id)) || '');
  if (!propertyId) return [];

  const [rows, booked] = await Promise.all([
    rowsFor(propertyId),
    bookedInAppByShareType(propertyId),
  ]);

  return sharingOptionsFor(property).map((option) => {
    const row = rows.get(option.shareTypeId);
    const bookedInApp = booked.get(option.shareTypeId) || 0;

    if (!row) {
      return {
        shareTypeId: option.shareTypeId,
        label: option.label,
        capacity: option.totalBeds,
        recorded: false,
        totalBeds: null,
        availableBeds: null,
        bookedInApp,
        offlineOccupied: 0,
        markedVacant: 0,
        maxFree: null,
        isAvailable: null,
        freeBedsEditedAt: null,
        freeBedsEditedBy: '',
      };
    }

    return {
      shareTypeId: row.shareTypeId,
      label: option.label,
      capacity: option.totalBeds,
      recorded: true,
      totalBeds: row.totalBeds,
      availableBeds: row.availableBeds,
      bookedInApp,
      offlineOccupied: Math.max(0, row.offlineOccupied || 0),
      markedVacant: Math.max(0, -(row.offlineOccupied || 0)),
      maxFree: Math.max(0, row.totalBeds - bookedInApp),
      isAvailable: row.isAvailable !== false,
      freeBedsEditedAt: row.freeBedsEditedAt || null,
      freeBedsEditedBy: row.freeBedsEditedBy || '',
    };
  });
};

/**
 * A person says how many beds are free. Capacity is never touched.
 *
 * The hard limits are 0 and the TOTAL: a building never has more free beds
 * than beds.
 *
 * Going above total − Lampose bookings is ALLOWED — an OVERRIDE, not a
 * mistake. A PG tenant can leave (a dispute, a family emergency) while their
 * booking still reads "in house", because nothing in the app closes it; the
 * owner knows the bed is empty and must be able to say so. The response says
 * `override: true` and names how many Lampose bookings the owner has marked
 * vacant, so the screens can show it. The booking itself is not touched.
 *
 * Whatever is left over is stored in `offlineOccupied` — positive for beds
 * held outside the app, negative for Lampose bookings marked vacant — which is
 * what keeps the correction alive through later recounts.
 *
 * Written with the counters it was computed from in the filter, so a bed
 * claimed or released between reading and writing makes this match nothing
 * instead of silently overwriting that move. The caller is told to try again.
 *
 * Returns `{ ok: true, data }` or `{ ok: false, status, code, message }`.
 */
const setFreeBeds = async ({ propertyId, shareTypeId, freeBeds, editedBy = '' }) => {
  if (mongoose.connection.readyState !== 1) {
    return { ok: false, status: 503, code: 'DB_UNAVAILABLE', message: 'The database is not reachable right now. Try again shortly.' };
  }

  const wanted = Number(freeBeds);
  if (freeBeds === null || freeBeds === '' || !Number.isInteger(wanted) || wanted < 0) {
    return { ok: false, status: 400, code: 'VALIDATION_ERROR', message: 'Free beds must be a whole number, 0 or more.' };
  }

  const row = await PartnerShareType.findOne({ shareTypeId, propertyId: String(propertyId) }).lean();
  if (!row) {
    return {
      ok: false,
      status: 404,
      code: 'NO_INVENTORY_RECORDED',
      message: 'This room type has no total bed count yet. Set the total beds on the property first.',
    };
  }

  const booked = (await bookedInAppByShareType(row.propertyId)).get(row.shareTypeId) || 0;
  const maxFree = Math.max(0, row.totalBeds - booked);

  if (wanted > row.totalBeds) {
    return {
      ok: false,
      status: 409,
      code: 'FREE_ABOVE_TOTAL',
      message: `${row.name} has ${row.totalBeds} bed${row.totalBeds === 1 ? '' : 's'} in total, so at most ${row.totalBeds} can be free. `
        + 'Change the total beds on the property if the building has more.',
      maxFree,
      totalBeds: row.totalBeds,
    };
  }
  const offline = row.totalBeds - booked - wanted;

  const updated = await PartnerShareType.findOneAndUpdate(
    {
      shareTypeId: row.shareTypeId,
      totalBeds: row.totalBeds,
      availableBeds: row.availableBeds,
    },
    {
      $set: {
        availableBeds: wanted,
        offlineOccupied: offline,
        freeBedsEditedAt: new Date(),
        freeBedsEditedBy: String(editedBy || '').slice(0, 120),
      },
    },
    { new: true },
  ).lean();

  if (!updated) {
    return {
      ok: false,
      status: 409,
      code: 'INVENTORY_CHANGED',
      message: 'A bed was booked or freed a moment ago. Refresh and try again.',
    };
  }

  console.log(`   🛏️  [Free beds] ${row.shareTypeId}: ${row.availableBeds} → ${wanted} `
    + `(total ${row.totalBeds}, Lampose ${booked}, `
    + `${offline >= 0 ? `outside ${offline}` : `OVERRIDE — ${-offline} Lampose booking(s) marked vacant`}) `
    + `by ${editedBy || 'unknown'}`);

  return {
    ok: true,
    data: {
      shareTypeId: updated.shareTypeId,
      label: updated.name,
      totalBeds: updated.totalBeds,
      availableBeds: updated.availableBeds,
      bookedInApp: booked,
      offlineOccupied: Math.max(0, offline),
      markedVacant: Math.max(0, -offline),
      override: offline < 0,
      maxFree,
      isAvailable: updated.isAvailable !== false,
      freeBedsEditedAt: updated.freeBedsEditedAt,
      freeBedsEditedBy: updated.freeBedsEditedBy,
    },
  };
};

/* ------------------------------------------------------------------ *
 * Drift
 * ------------------------------------------------------------------ */

/**
 * What the counters say versus what the bookings say.
 *
 * A stored counter drifts the first time a writer forgets, and the symptom —
 * an owner reporting a room as full when it is not — arrives weeks later with
 * nothing to trace. This recomputes availability from the bookings collection
 * and reports every row that disagrees.
 *
 * Reports by default and only writes when asked, because a reconcile that
 * silently "fixes" rows destroys the evidence of which writer is broken.
 */
const reconcile = async ({ fix = false } = {}) => {
  if (mongoose.connection.readyState !== 1) return { checked: 0, drifted: [], fixed: 0 };

  const rows = await PartnerShareType.find({}).lean();
  const drifted = [];

  for (const row of rows) {
    const occupied = await PartnerBooking.countDocuments({
      propertyId: row.propertyId,
      shareType: row.name,
      status: { $in: OCCUPYING },
    });
    /* Beds a person said are taken outside the app are subtracted too, or a
       recount would hand them back as free. */
    const offline = row.offlineOccupied || 0;
    /* Clamped to [0, total]: a negative correction (bookings marked vacant)
       whose booking has since closed must not invent a bed. */
    const expected = Math.min(row.totalBeds, Math.max(0, row.totalBeds - occupied - offline));

    if (expected !== row.availableBeds) {
      drifted.push({
        shareTypeId: row.shareTypeId,
        propertyId: row.propertyId,
        name: row.name,
        totalBeds: row.totalBeds,
        stored: row.availableBeds,
        expected,
        occupied,
        offlineOccupied: offline,
      });
    }
  }

  let fixed = 0;
  if (fix) {
    for (const row of drifted) {
      await PartnerShareType.updateOne(
        { shareTypeId: row.shareTypeId },
        { $set: { availableBeds: row.expected } },
      );
      fixed += 1;
    }
  }

  return { checked: rows.length, drifted, fixed };
};

module.exports = {
  OCCUPYING,
  syncShareTypes,
  rowsFor,
  requestableOptions,
  findRequestableOption,
  claimBed,
  bookedAtLabel,
  releaseBed,
  shareTypeIdForBooking,
  inventoryForProperty,
  setFreeBeds,
  reconcile,
};
