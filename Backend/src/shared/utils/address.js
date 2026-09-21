/* ══════════════════════════════════════════════════════════════════════════
   What a postal address is, once, for every identity that has one.

   Three collections need to store where somebody is, and they need to agree:

     app_customers.addresses[]   a diner's address BOOK — several, one default
     app_drivers.address         a rider's own address — one
     app_partners.address        a property owner's own address — one

   Written once here rather than three times because the alternative is three
   validators that agree today. The first divergence is always the same one: a
   pincode check that exists in the app somebody was working on and not in the
   other two, and it surfaces as a payout going to a six-digit number that is
   not a pincode.

   ## Why the driver and the partner get ONE, and the customer gets many

   A diner orders to their room, to the gate, to a friend's block — the address
   is a property of the ORDER, chosen each time, so it is a list. A rider and an
   owner have an address the way a person has one: it is who they are, it is
   read by whoever verifies them, and a second one would raise the question of
   which is real. Modelling all three as lists would mean two apps carrying an
   "add another" button nobody should press.

   ## The pin is optional, and that is deliberate

   `location` is a GeoJSON point when the app could get one and absent when it
   could not. An address typed by somebody who declined location permission is
   an ordinary address, and refusing to save it would be refusing the order.
   What a missing pin costs is named rather than hidden: the dispatcher falls
   back to searching around the restaurant, and a rider's map cannot plot
   it. Both of those are already how the code behaves.

   `[longitude, latitude]` — GeoJSON's order and MongoDB's, kept unswapped
   everywhere in this backend. See `driver.model.js` for the full warning.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');
const crypto = require('crypto');

/**
 * What kind of place this is.
 *
 * Not decoration: the app shows a different glyph for each, and a rider
 * reading "Gate" knows not to look for a door. `other` exists so the list
 * never has to be exhaustive.
 */
const ADDRESS_KINDS = ['room', 'hostel', 'home', 'work', 'gate', 'other'];

/** `AD-` plus eight hex, matching every other public id in this codebase. */
const makeAddressId = () => `AD-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

/** Six digits, first not a zero — the Indian pincode shape. */
const PINCODE = /^[1-9]\d{5}$/;

const point = new mongoose.Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: (pair) => Array.isArray(pair) && pair.length === 2
          && Number.isFinite(pair[0]) && Number.isFinite(pair[1])
          && Math.abs(pair[0]) <= 180 && Math.abs(pair[1]) <= 90,
        message: 'location.coordinates must be [longitude, latitude] and in range.',
      },
    },
  },
  { _id: false },
);

/**
 * The stored shape.
 *
 * `addressId` is on every one, including the single ones the rider and the
 * owner hold. It costs nothing and it means an address can be referred to
 * later — by an order that snapshotted it, or by a support ticket — without
 * caring which collection it came out of.
 */
const addressSchema = new mongoose.Schema(
  {
    addressId: { type: String, required: true },

    kind: { type: String, enum: ADDRESS_KINDS, default: 'home' },
    /* What the person calls it: "Home", "Block C". Free text, because the
       whole point of a label is that it is theirs. */
    label: { type: String, default: '', trim: true },

    /* The line a rider actually reads at the door. Required — an address with
       no first line is a pincode. */
    line1: { type: String, required: true, trim: true },
    line2: { type: String, default: '', trim: true },
    landmark: { type: String, default: '', trim: true },
    city: { type: String, default: '', trim: true },
    state: { type: String, default: '', trim: true },
    pincode: { type: String, default: '', trim: true },

    /* "Ring the bell twice, door left of the stairs." The single most useful
       field on a delivery and the one no form template includes. */
    instructions: { type: String, default: '', trim: true },

    /* Absent when the app could not get one — see the header. */
    location: { type: point, default: undefined },

    /* Only meaningful on a list. Exactly one is kept true by
       `applyDefault` below; nothing else may set it. */
    isDefault: { type: Boolean, default: false },
  },
  { _id: false, timestamps: true },
);

/** Thrown for anything the caller can fix by sending different input. */
class AddressInputError extends Error {
  constructor(message, code = 'BAD_ADDRESS') {
    super(message);
    this.name = 'AddressInputError';
    this.code = code;
  }
}

const trimmed = (value, max) => String(value === undefined || value === null ? '' : value)
  .trim()
  .slice(0, max);

/**
 * A request body turned into storable fields.
 *
 * `partial` is what tells an edit from a create: on a create `line1` is
 * required, on an edit an absent key means "leave it alone" rather than
 * "clear it". Getting that backwards is how a PATCH that changes a label
 * wipes an address's instructions.
 */
const buildAddress = (body = {}, { partial = false } = {}) => {
  const set = {};

  if (body.line1 !== undefined || !partial) {
    const line1 = trimmed(body.line1, 120);
    if (!line1) {
      throw new AddressInputError('The first line of the address is needed.', 'LINE1_REQUIRED');
    }
    set.line1 = line1;
  }

  if (body.kind !== undefined) {
    const kind = String(body.kind).toLowerCase();
    if (!ADDRESS_KINDS.includes(kind)) {
      throw new AddressInputError(`"kind" must be one of: ${ADDRESS_KINDS.join(', ')}.`, 'BAD_KIND');
    }
    set.kind = kind;
  }

  if (body.label !== undefined) set.label = trimmed(body.label, 40);
  if (body.line2 !== undefined) set.line2 = trimmed(body.line2, 120);
  if (body.landmark !== undefined) set.landmark = trimmed(body.landmark, 80);
  if (body.city !== undefined) set.city = trimmed(body.city, 60);
  if (body.state !== undefined) set.state = trimmed(body.state, 60);
  if (body.instructions !== undefined) set.instructions = trimmed(body.instructions, 200);

  if (body.pincode !== undefined) {
    const pincode = trimmed(body.pincode, 6);
    /* Empty is allowed — plenty of hostel addresses are given without one and
       nothing in the product needs it. A pincode that is PRESENT and wrong is
       refused, because that is a typo somebody can fix now rather than a
       failed delivery later. */
    if (pincode && !PINCODE.test(pincode)) {
      throw new AddressInputError('That pincode does not look right. It is six digits.', 'BAD_PINCODE');
    }
    set.pincode = pincode;
  }

  /*
   * The pin. Accepted as `{lat, lng}` from an app, because that is what a
   * device's location API hands back and asking every client to flip it is
   * asking for the flip to be forgotten. Stored as [lng, lat].
   *
   * `null` explicitly CLEARS it — an address corrected from one building to
   * another must be able to drop a pin that is now wrong, and leaving a stale
   * one would send a rider to the old place with the right text on screen.
   */
  if (body.location !== undefined) {
    if (body.location === null) {
      set.location = undefined;
    } else {
      const lat = Number(body.location.lat ?? body.location.latitude);
      const lng = Number(body.location.lng ?? body.location.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw new AddressInputError('A pin needs both lat and lng as numbers.', 'BAD_LOCATION');
      }
      if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        throw new AddressInputError('That pin is not a real coordinate.', 'BAD_LOCATION');
      }
      set.location = { type: 'Point', coordinates: [lng, lat] };
    }
  }

  return set;
};

/**
 * Exactly one default, always.
 *
 * Called after every write to a list. Two rules, and the second is the one
 * that is easy to miss: if the chosen id is gone — deleted, or never there —
 * the FIRST address becomes the default rather than none of them, because a
 * list with no default is a checkout with nothing selected.
 */
const applyDefault = (addresses, preferredId) => {
  if (!Array.isArray(addresses) || !addresses.length) return addresses;

  const wanted = addresses.some((a) => a.addressId === preferredId)
    ? preferredId
    : (addresses.find((a) => a.isDefault) || addresses[0]).addressId;

  addresses.forEach((address) => {
    address.isDefault = address.addressId === wanted;
  });
  return addresses;
};

/** The address as a CLIENT reads it. `[lng, lat]`, unswapped. */
const publicAddress = (address) => (address ? {
  addressId: address.addressId,
  kind: address.kind || 'home',
  label: address.label || '',
  line1: address.line1 || '',
  line2: address.line2 || '',
  landmark: address.landmark || '',
  city: address.city || '',
  state: address.state || '',
  pincode: address.pincode || '',
  instructions: address.instructions || '',
  location: address.location && Array.isArray(address.location.coordinates)
    ? address.location.coordinates
    : null,
  isDefault: !!address.isDefault,
} : null);

/**
 * The one line a rider reads, built the same way everywhere.
 *
 * `food_orders.deliveryAddress` is a single string, and every screen that
 * shows an address to somebody standing at a door needs the same one. Built
 * here so the order, the tracking screen and the rider's job card cannot
 * disagree about what the address is.
 */
const addressLine = (address) => {
  if (!address) return '';
  return [address.line1, address.line2, address.landmark, address.city, address.pincode]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(', ');
};

module.exports = {
  ADDRESS_KINDS,
  PINCODE,
  addressSchema,
  AddressInputError,
  makeAddressId,
  buildAddress,
  applyDefault,
  publicAddress,
  addressLine,
};
