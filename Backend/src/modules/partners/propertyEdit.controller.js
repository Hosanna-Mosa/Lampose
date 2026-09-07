/* ══════════════════════════════════════════════════════════════════════════
   Letting an owner finish their own onboarding.

   `portfolio.controller.js` reads `properties` and says why it never writes:
   the row was filled in by a field agent, sometimes only partly, and the v1
   onboarding surface that CAN complete it gates every write behind an
   administrator's grant. That is still true of v1. This file is a second,
   narrower door — not a bypass of that gate, a different one:

     v1 PUT /api/v1/properties/:id   any employee email with a grant, or the
                                      admin console with none. Can edit ANY
                                      property, and identifies its caller by a
                                      header nothing here verifies.

     these routes                    only the property's own owner, proven by
                                      the phone number on the session
                                      (`requirePartner`) matching
                                      `Property.ownerMobile` — see
                                      `findOwnedProperty`. Can edit only the
                                      one property that matches, and cannot
                                      touch another owner's listing by any
                                      value of `:id`.

   Reusing the v1 route from this app was considered and rejected: its
   permission gate only fires when `x-employee-email` is present and treats a
   request with no header as the admin console, which is already behind an
   administrator login. A partner session is neither of those, and sending it
   through unheadered would make an owner's phone indistinguishable from an
   admin with no grant at all — the exact hole `authorizeEmployeeWrite` exists
   to close for everyone else. A route that checks OWNERSHIP instead of an
   employee grant is the correct shape for what this app's session actually
   proves.

   ## There is no review step

   An edit here lands on the live `properties` document as soon as it is
   saved — nobody at Lampose approves it first. That was a deliberate product
   choice (an admin-console review queue was the alternative), made knowing
   it removes the one check every other write to this collection has had
   since the product existed. `propertyEditLog.model.js` is the mitigation:
   every accepted write is recorded there, before and after, so a bad edit is
   something support can find and reason about rather than a fact about the
   property nobody can now tell was ever different.

   ## `ownerMobile` is editable, but only to the owner's OWN number

   Every other field here is ordinary listing content. `ownerMobile` is not:
   `Property.ownerMobile` is the entire mechanism that decides which partner
   account sees this property at all (see `phoneKey` in `partner.model.js`).
   Letting a session write it to an arbitrary value would let an owner hand
   their listing to a phone number they do not hold, or pull somebody else's
   listing onto their own account by guessing at collisions in the last ten
   digits. The one edit that is actually useful — the field agent typed it
   wrong and the true owner wants to fix it — is exactly the case where the
   new value equals the number this session already proved. So that is the
   only value this endpoint accepts; anything else is refused with a message
   that points at support, which is the same escape hatch the old read-only
   screen offered for every field.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;

const Property = require('../properties/property.model');
const Partner = require('./partner.model');
const PropertyEditLog = require('./propertyEditLog.model');
const { formatListing } = require('../listings/listing.formatter');
const { syncShareTypes } = require('../inventory/inventory.service');

const { phoneKey } = Partner;

const MAX_PROPERTY_IMAGES = 10;

const { CATEGORIES, normaliseCategory } = require('../../shared/constants/categories');

const VALID_STAY_TYPES = ['Short Stay', 'Long Stay', 'Both Short & Long Stay'];

const dbDown = (res) => res.status(503).json({
  success: false,
  code: 'DB_DISCONNECTED',
  message: 'The server is running but not connected to the database.',
});

const badInput = (res, message, code = 'BAD_INPUT') => res.status(400).json({
  success: false, code, message,
});

const notFound = (res) => res.status(404).json({
  success: false,
  code: 'NOT_FOUND',
  message: 'We could not find that property.',
});

const digitsOf = (partner) => partner.phoneDigits || phoneKey(partner.phone);

/**
 * The one property this session may read or write, or null.
 *
 * "Does not exist" and "exists but is somebody else's" answer identically —
 * same as every other partner-scoped lookup in this module — so the id in a
 * URL cannot be used to probe which listings exist.
 */
const findOwnedProperty = async (partner, id) => {
  if (!mongoose.isValidObjectId(id)) return null;
  const property = await Property.findById(id);
  if (!property) return null;

  const key = digitsOf(partner);
  if (!key || phoneKey(property.ownerMobile) !== key) return null;

  return property;
};

const stringList = (value) => {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
};

/** A required number, 0 or more. Returns `{ error }` or `{ value }`. */
const requiredNumber = (raw, label) => {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    return { error: `${label} must be a number that is 0 or more.` };
  }
  return { value: n };
};

// @route   GET /api/v2/partners/properties/:id
// @desc    One of this partner's own listings, every onboarding field
// @access  Partner session (owner of the property only)
const getMyPropertyById = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);

    const property = await findOwnedProperty(req.partner, req.params.id);
    if (!property) return notFound(res);

    return res.json({ success: true, data: formatListing(property) });
  } catch (error) {
    return next(error);
  }
};

/**
 * Applies the whitelisted fields from `body` onto `property` IN PLACE.
 *
 * Every field is read individually and validated on its own terms — never a
 * bulk `Object.assign` or `Property.findByIdAndUpdate(id, req.body)`. That is
 * what makes the schema's `strict: true` mean something here: a caller can
 * only ever move this document between two states this function actually
 * considered, not whatever shape a request body happened to have.
 *
 * Returns an error message string to send as a 400, or null on success.
 */
const applyEditableFields = (property, body, partner) => {
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return 'Enter the property name.';
    property.name = name;
  }

  if (body.place !== undefined) {
    const place = String(body.place).trim();
    if (!place) return 'Enter the place or location.';
    property.place = place;
  }

  if (body.ownerName !== undefined) {
    const ownerName = String(body.ownerName).trim();
    if (!ownerName) return 'Enter the owner name.';
    property.ownerName = ownerName;
  }

  /* See the header note: this may only ever be set to the number this
     session itself proved. */
  if (body.ownerMobile !== undefined) {
    const ownerMobile = String(body.ownerMobile).trim();
    if (!ownerMobile) return 'Enter the owner mobile number.';
    const ownKey = digitsOf(partner);
    if (!ownKey || phoneKey(ownerMobile) !== ownKey) {
      return 'The owner mobile number on a listing can only be set to the number you signed in with. To move this listing to a different number, contact Lampose support.';
    }
    property.ownerMobile = ownerMobile;
  }

  if (body.category !== undefined) {
    const category = String(body.category).trim();
    if (!normaliseCategory(category)) {
      return `Category must be one of: ${CATEGORIES.join(', ')}`;
    }
    property.category = normaliseCategory(category);
  }

  if (body.stayType !== undefined) {
    const stayType = String(body.stayType).trim();
    if (!VALID_STAY_TYPES.includes(stayType)) {
      return `Stay type must be one of: ${VALID_STAY_TYPES.join(', ')}`;
    }
    property.stayType = stayType;
  }

  if (body.shortStayDuration !== undefined) {
    property.shortStayDuration = String(body.shortStayDuration).trim() || property.shortStayDuration;
  }
  if (body.longStayDuration !== undefined) {
    property.longStayDuration = String(body.longStayDuration).trim() || property.longStayDuration;
  }

  for (const [field, label] of [
    ['dailyPrice', 'Price per day'],
    ['monthlyPrice', 'Price per month'],
    ['deposit', 'Security deposit'],
    ['rent', 'Rent'],
  ]) {
    if (body[field] === undefined) continue;
    const result = requiredNumber(body[field], label);
    if (result.error) return result.error;
    property[field] = result.value;
  }

  if (body.address !== undefined) property.address = String(body.address).trim();
  if (body.description !== undefined) property.description = String(body.description).trim();

  /* `images` is the gallery; `imageUrl` is the single cover older code reads.
     Sending `images` keeps them in step. `imageUrl` on its own is only for a
     caller that wants to change the cover without touching the gallery. */
  if (body.images !== undefined) {
    const images = stringList(body.images);
    property.images = images;
    if (images.length) property.imageUrl = images[0];
  } else if (body.imageUrl !== undefined) {
    property.imageUrl = String(body.imageUrl).trim();
  }

  if (body.amenities !== undefined) property.amenities = stringList(body.amenities);

  if (body.categoryDetails !== undefined) {
    const details = body.categoryDetails;
    if (!details || typeof details !== 'object' || Array.isArray(details)) {
      return 'Category details must be an object.';
    }
    property.categoryDetails = details;
    property.markModified('categoryDetails'); // Mixed field — reassignment needs this to persist.
  }

  return null;
};

// @route   PATCH /api/v2/partners/properties/:id
// @desc    Add or correct onboarding fields on this owner's own listing
// @access  Partner session (owner of the property only)
const updateMyProperty = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);

    const property = await findOwnedProperty(req.partner, req.params.id);
    if (!property) return notFound(res);

    const before = property.toObject();

    const error = applyEditableFields(property, req.body || {}, req.partner);
    if (error) return badInput(res, error);

    await property.save();

    /*
     * Bed counts become claimable rows — the same line every other write to
     * this collection ends with (property.controller, properties.routes.v1,
     * the WhatsApp verification handler).
     *
     * This route was the one that did not, and it is the ONLY route an owner
     * can reach: the layout counts on `settings/property-edit` write
     * `categoryDetails.sharingRooms`/`sharingBeds`, and without this call
     * `partner_share_types` kept whatever capacity it was seeded with. An
     * owner correcting "2 BHK" from one flat to two saved successfully, saw
     * the new number on their own listing, and the catalogue went on
     * answering `NO_BEDS_FREE` from a row that still said one bed — so the
     * second flat could never be booked.
     *
     * `syncShareTypes` moves availability by the DELTA rather than resetting
     * it, so re-syncing here cannot free a bed somebody is already in. It is
     * awaited but never fatal: it swallows its own errors and returns what it
     * did, and a save the owner is waiting on must not fail because a
     * counter could not be written.
     */
    await syncShareTypes(property);

    console.log(`   ✏️  [Partner Property Edit] "${property.name}" (${property._id}) updated by partner ${req.partner.partnerId}`);

    /* Best-effort. The write to `properties` already succeeded and is the
       thing the owner is waiting on — a logging collection being briefly
       unwritable must not turn their save into a failure. */
    try {
      await PropertyEditLog.create({
        property: property._id,
        partnerId: req.partner.partnerId,
        partnerPhoneDigits: digitsOf(req.partner),
        before,
        after: property.toObject(),
      });
    } catch (auditError) {
      console.warn('   ⚠️  [Property Edit] Could not write the audit log:', auditError.message);
    }

    return res.json({ success: true, message: 'Property updated.', data: formatListing(property) });
  } catch (err) {
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map((e) => e.message);
      return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: messages.join(', ') });
    }
    return next(err);
  }
};

// @route   PATCH /api/v2/partners/properties/:id/availability
// @desc    Take ONE of this owner's listings off, or put it back on
// @access  Partner session (owner of the property only)
/**
 * Availability, per property.
 *
 * ## What this fills in
 *
 * There was exactly one availability control in the app and it was
 * partner-WIDE: the dashboard switch calls
 * `PATCH /partners/share-types/availability`, which sets `acceptingBookings`
 * on the partner and then `updateMany`s EVERY share type this owner has, in
 * every property. An owner with three listings could not take one of them off
 * — the switch was all of them or none — and once off, the only way back was
 * the same all-or-nothing switch.
 *
 * (`app/share-types/index.tsx` LOOKS per-room, but its save collapses the
 * whole draft to `draftVisibleCount > 0` and calls that same global endpoint,
 * so its individual switches never reached the server. That is a separate
 * bug; this route is the thing it should have been calling.)
 *
 * ## Availability is the share types', not the property's
 *
 * `properties.status` is deliberately untouched here. That field is the leads
 * panel's own lifecycle flag ("is this listing live at all"), and the stay
 * flow already refuses a request when it is anything but `active` — an owner
 * pausing bookings for a fortnight must not silently retire their listing.
 * What moves is `partner_share_types.isAvailable`, which is precisely what
 * `requestableOptions` reads to answer `OWNER_PAUSED`.
 *
 * ## Capacity is never touched
 *
 * `availableBeds` is left exactly as it is. Pausing is not the same as
 * emptying: the beds that are occupied stay occupied, and switching back on
 * must not invent free ones or forget taken ones. This flips one boolean.
 *
 * ## A property with no counts cannot be paused, and says so
 *
 * No share-type rows means nobody ever recorded bed counts, so the listing is
 * already unrequestable (`NO_INVENTORY_RECORDED`) and there is nothing to
 * flip. Reported as a 409 naming the cause rather than a silent success that
 * changes nothing.
 */
const setMyPropertyAvailability = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);

    const property = await findOwnedProperty(req.partner, req.params.id);
    if (!property) return notFound(res);

    const { isAvailable } = req.body || {};
    if (typeof isAvailable !== 'boolean') {
      return badInput(res, 'Send isAvailable as true or false.');
    }

    const { PartnerShareType } = require('./partnerDomains.model');
    const propertyId = String(property._id);

    const result = await PartnerShareType.updateMany(
      { propertyId },
      { $set: { isAvailable } },
    );

    if (!result.matchedCount) {
      return res.status(409).json({
        success: false,
        code: 'NO_INVENTORY_RECORDED',
        message: 'This listing has no room counts recorded yet, so there is nothing to switch '
          + 'on or off. Add how many rooms of each type it has first.',
      });
    }

    console.log(`   ${isAvailable ? '🟢' : '🔴'} [Partner Availability] "${property.name}" (${propertyId}) `
      + `${isAvailable ? 'accepting' : 'paused'} by partner ${req.partner.partnerId} `
      + `— ${result.matchedCount} room type(s)`);

    return res.json({
      success: true,
      message: isAvailable
        ? 'This listing is taking bookings again.'
        : 'This listing is paused. Existing bookings are unaffected.',
      data: { propertyId, isAvailable, roomTypes: result.matchedCount },
    });
  } catch (error) {
    return next(error);
  }
};

/* ── Photos ──────────────────────────────────────────────────────────────── */

/** Configured per request, exactly as the KYC and onboarding uploads do it. */
const configureCloudinary = () => {
  const cloud_name = process.env.CLOUDINARY_CLOUD_NAME;
  const api_key = process.env.CLOUDINARY_API_KEY;
  const api_secret = process.env.CLOUDINARY_API_SECRET;
  if (!cloud_name || !api_key || !api_secret) return null;
  cloudinary.config({ cloud_name, api_key, api_secret });
  return cloud_name;
};

// @route   POST /api/v2/partners/uploads/property-images
// @desc    Property photographs to Cloudinary; returns secure URLs
// @access  Partner session
const uploadPropertyImages = async (req, res, next) => {
  try {
    const cloudName = configureCloudinary();
    if (!cloudName) {
      console.error('❌ [Cloudinary] CLOUDINARY_* is not set — property image upload refused.');
      return res.status(503).json({
        success: false,
        code: 'STORAGE_NOT_CONFIGURED',
        message: 'Image storage is not set up on this server.',
      });
    }

    /* Two shapes accepted, matching uploadKycImages: multer parses a native
       picker's multipart form, `images[]` as base64 data URIs is what a JSON
       client would send instead. */
    const files = Array.isArray(req.files) ? req.files : [];
    const inline = Array.isArray((req.body || {}).images) ? req.body.images : [];

    const sources = [
      ...files.map((f) => `data:${f.mimetype || 'image/jpeg'};base64,${f.buffer.toString('base64')}`),
      ...inline.map((s) => (String(s).startsWith('data:') ? String(s) : `data:image/jpeg;base64,${s}`)),
    ];

    if (!sources.length) return badInput(res, 'No images were attached.');
    if (sources.length > MAX_PROPERTY_IMAGES) {
      return badInput(res, `Please attach at most ${MAX_PROPERTY_IMAGES} images at a time.`);
    }

    /* Foldered per owner, same reasoning as the KYC upload: a support request
       about one partner's photos should not mean trawling a shared bucket. */
    const folder = `lampose_accommodations/${digitsOf(req.partner)}`;

    const uploaded = [];
    for (const source of sources) {
      // Sequential, not parallel — see uploadKycImages for why.
      const result = await cloudinary.uploader.upload(source, { folder, resource_type: 'image' });
      uploaded.push({ url: result.secure_url, publicId: result.public_id });
    }

    console.log(`   ☁️  [Property Photo Upload] ${uploaded.length} image(s) stored in "${folder}"`);

    return res.status(201).json({ success: true, count: uploaded.length, data: uploaded });
  } catch (error) {
    console.error('   ❌ [Property Photo Upload Error]:', error.message || error);
    return next(error);
  }
};

module.exports = {
  getMyPropertyById,
  updateMyProperty,
  setMyPropertyAvailability,
  uploadPropertyImages,
  MAX_PROPERTY_IMAGES,
};
