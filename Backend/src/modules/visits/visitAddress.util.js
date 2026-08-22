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

module.exports = { readListingAddress };
