/* ══════════════════════════════════════════════════════════════════════════
   A diner's address book.

     GET    /api/v2/customers/me/addresses
     POST   /api/v2/customers/me/addresses
     PATCH  /api/v2/customers/me/addresses/:addressId
     DELETE /api/v2/customers/me/addresses/:addressId
     POST   /api/v2/customers/me/addresses/:addressId/default

   The shape and every rule about it live in `shared/utils/address.js`, shared
   with the rider's and the owner's single address so the three cannot drift.
   What is here is the LIST behaviour, which only this audience has.

   ## Exactly one default, and it survives a delete

   `applyDefault` is called after every write. Deleting the default promotes
   the first remaining address rather than leaving none — a book with no
   default is a checkout with nothing selected, and the screen that would have
   to handle that is the one nobody tests.

   ## A cap, said out loud

   Ten. Not a storage concern — it is that an address list is chosen from on a
   phone, and the fortieth entry makes the first nine harder to find. Somebody
   who genuinely needs more is editing rather than adding.

   ## Nothing here deletes an order's copy

   An order snapshots the address it was placed to, the same way it snapshots
   the rider. Removing an address from the book does not change where a
   delivered order went, and must not.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const {
  AddressInputError, applyDefault, buildAddress, makeAddressId, publicAddress,
} = require('../../shared/utils/address');

const BADGE = '📍 [customers/addresses]';
const MAX_ADDRESSES = 10;

const fail = (res, status, code, message) => res.status(status).json({
  success: false, code, message, error: message,
});

const dbDown = (res) => fail(
  res, 503, 'DB_DISCONNECTED', 'The server is running but not connected to the database.',
);

const isUp = () => mongoose.connection.readyState === 1;

const handle = (res, next, error, what) => {
  if (error instanceof AddressInputError) return fail(res, 400, error.code, error.message);
  if (error && error.name === 'ValidationError') {
    return fail(res, 400, 'BAD_ADDRESS', error.message);
  }
  console.error(`${BADGE} ${what} failed:`, error.message);
  return next(error);
};

/** The book, default first — which is the order a picker should offer them. */
const book = (customer) => {
  const list = (customer.addresses || []).map(publicAddress);
  return list.sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
};

// @route   GET /api/v2/customers/me/addresses
const listAddresses = async (req, res, next) => {
  try {
    if (!isUp()) return dbDown(res);
    return res.json({ success: true, count: (req.customer.addresses || []).length, data: book(req.customer) });
  } catch (error) {
    return handle(res, next, error, 'listing addresses');
  }
};

// @route   POST /api/v2/customers/me/addresses
const addAddress = async (req, res, next) => {
  try {
    if (!isUp()) return dbDown(res);
    const { customer } = req;

    if ((customer.addresses || []).length >= MAX_ADDRESSES) {
      return fail(
        res, 409, 'TOO_MANY_ADDRESSES',
        `You can save up to ${MAX_ADDRESSES} addresses. Edit or remove one to add another.`,
      );
    }

    const fields = buildAddress(req.body || {}, { partial: false });
    const address = { addressId: makeAddressId(), ...fields };

    customer.addresses.push(address);
    /* The first address a person saves is their default, whatever they said —
       there is nothing else for it to be. After that, `isDefault` is only
       moved by the route that exists for it. */
    const preferred = customer.addresses.length === 1
      ? address.addressId
      : (customer.addresses.find((a) => a.isDefault) || address).addressId;
    applyDefault(customer.addresses, preferred);

    await customer.save();
    console.log(`${BADGE} ${customer.customerId} added ${address.addressId}`);

    const saved = customer.addresses.find((a) => a.addressId === address.addressId);
    return res.status(201).json({ success: true, data: publicAddress(saved), addresses: book(customer) });
  } catch (error) {
    return handle(res, next, error, 'adding an address');
  }
};

// @route   PATCH /api/v2/customers/me/addresses/:addressId
const updateAddress = async (req, res, next) => {
  try {
    if (!isUp()) return dbDown(res);
    const { customer } = req;

    const address = (customer.addresses || []).find((a) => a.addressId === req.params.addressId);
    if (!address) return fail(res, 404, 'NOT_FOUND', 'We could not find that address.');

    /* Partial: an absent key means "leave it alone". A PATCH that changes a
       label must not clear the delivery instructions. */
    const fields = buildAddress(req.body || {}, { partial: true });
    Object.entries(fields).forEach(([key, value]) => {
      address[key] = value;
    });

    await customer.save();
    return res.json({ success: true, data: publicAddress(address), addresses: book(customer) });
  } catch (error) {
    return handle(res, next, error, 'updating an address');
  }
};

// @route   DELETE /api/v2/customers/me/addresses/:addressId
const removeAddress = async (req, res, next) => {
  try {
    if (!isUp()) return dbDown(res);
    const { customer } = req;

    const before = (customer.addresses || []).length;
    customer.addresses = (customer.addresses || []).filter((a) => a.addressId !== req.params.addressId);
    if (customer.addresses.length === before) {
      return fail(res, 404, 'NOT_FOUND', 'We could not find that address.');
    }

    /* Promotes the first remaining one when the default was the one removed —
       see the header. */
    applyDefault(customer.addresses, (customer.addresses.find((a) => a.isDefault) || {}).addressId);

    await customer.save();
    console.log(`${BADGE} ${customer.customerId} removed ${req.params.addressId}`);
    return res.json({ success: true, addresses: book(customer) });
  } catch (error) {
    return handle(res, next, error, 'removing an address');
  }
};

// @route   POST /api/v2/customers/me/addresses/:addressId/default
/**
 * Its own route rather than a field on PATCH.
 *
 * Choosing a default is one tap in a list, and routing it through the edit
 * endpoint would mean that tap sends an address body — which is both a larger
 * request and a chance to overwrite a field the screen did not load.
 */
const setDefaultAddress = async (req, res, next) => {
  try {
    if (!isUp()) return dbDown(res);
    const { customer } = req;

    const exists = (customer.addresses || []).some((a) => a.addressId === req.params.addressId);
    if (!exists) return fail(res, 404, 'NOT_FOUND', 'We could not find that address.');

    applyDefault(customer.addresses, req.params.addressId);
    await customer.save();
    return res.json({ success: true, addresses: book(customer) });
  } catch (error) {
    return handle(res, next, error, 'setting the default address');
  }
};

module.exports = {
  listAddresses, addAddress, updateAddress, removeAddress, setDefaultAddress,
  book, MAX_ADDRESSES,
};
