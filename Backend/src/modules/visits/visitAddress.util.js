/* ══════════════════════════════════════════════════════════════════════════
   The one place that turns a listing into a street address.

   The address is NOT snapshotted onto a visit request. It is read from the
   property each time it is needed, so an owner who corrects their door number
   corrects it everywhere at once rather than only for requests made after the
   edit.

   Three callers needed the same six lines and each had its own copy: the
   verify handler (which puts it in the owner's WhatsApp), the token handler
   (which releases it to the customer once paid), and the status endpoint
   (which hands it to the page). Three copies of a rule about what a customer
   is allowed to see is two too many.
   ══════════════════════════════════════════════════════════════════════════ */
const Property = require('../properties/property.model');

/**
 * "12-3-45 Main Road, Chintal" — the address and the locality, without saying
 * the locality twice.
 *
 * Owners type the area into `address` about half the time, so appending
 * `place` unconditionally produced "…, Chintal, Chintal". The containment
 * check is what stops that, and it is case-insensitive because the two fields
 * are typed on different screens months apart.
 *
 * Returns `''` for a listing that has since been removed, or when the
 * database read fails. Every caller treats an empty address as a line to drop
 * rather than an error: a missing door number must never block a request that
 * is otherwise fine.
 */
const readListingAddress = async (listingId) => {
  try {
    const listing = await Property.findById(listingId).select('address place').lean();
    if (!listing) return '';

    return listing.address && listing.place
      && String(listing.address).toLowerCase().includes(String(listing.place).toLowerCase())
      ? listing.address
      : [listing.address, listing.place].filter(Boolean).join(', ');
  } catch (error) {
    console.warn('[visits] Could not read the listing address:', error.message);
    return '';
  }
};

/**
 * Everything the ₹99 unlock buys: where it is, and who to ring.
 *
 * ## Read from the property, never from the request
 *
 * The visit request carries an `ownerMobile` of its own, snapshotted when the
 * request was made. This deliberately ignores it and reads the property, for
 * the same reason `readListingAddress` does: an owner who corrects their
 * number corrects it for everybody at once, and a customer who has paid to
 * reach them should get the number that works today rather than the one that
 * worked in March.
 *
 * ## The map pin is a search, and says so
 *
 * No coordinates are captured at onboarding, so "live location" is a Google
 * Maps query for the typed address — as accurate as the onboarding agent's
 * typing and no more. The same link the WhatsApp confirmation already sends,
 * built the same way, so the page and the message never disagree.
 *
 * Returns empty strings rather than throwing. A caller that has verified a
 * payment must still answer; a missing door number is a line to drop, not a
 * reason to fail a request somebody has paid for.
 */
const readListingContact = async (listingId) => {
  const empty = { address: '', mapUrl: '', ownerName: '', ownerPhone: '', ownerAltPhone: '' };

  try {
    const listing = await Property.findById(listingId)
      .select('address place ownerName ownerMobile ownerAltMobile')
      .lean();
    if (!listing) return empty;

    const address = listing.address && listing.place
      && String(listing.address).toLowerCase().includes(String(listing.place).toLowerCase())
      ? listing.address
      : [listing.address, listing.place].filter(Boolean).join(', ');

    return {
      address: address || '',
      mapUrl: address
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
        : '',
      ownerName: listing.ownerName || '',
      ownerPhone: listing.ownerMobile || '',
      ownerAltPhone: listing.ownerAltMobile || '',
    };
  } catch (error) {
    console.warn('[visits] Could not read the listing contact:', error.message);
    return empty;
  }
};

module.exports = { readListingAddress, readListingContact };
