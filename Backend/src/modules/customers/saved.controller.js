/* ══════════════════════════════════════════════════════════════════════════
   The shortlist.

   Three routes, and the interesting one is the read: it returns the listings
   as they are NOW, each carrying the rent it had when it was saved. That
   pairing is the whole feature. A shortlist that only says which places were
   kept is a list of links; one that says "₹500 cheaper since you saved it" is
   the reason to keep places at all, and it cannot be produced after the fact
   because the old price is gone the moment the panel edits it.

   ## A saved listing that has since been deleted

   Dropped from the response rather than returned as a husk. The row on the
   screen renders a rent, a deposit and a photograph off the listing, and
   there is nothing honest to draw for a property that no longer exists. The
   stored entry is left alone — deleting it here would mean a read request
   quietly mutating the account, and a property removed by mistake and
   restored an hour later should come back to the shortlists it was on.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const Property = require('../properties/property.model');
const { formatListing } = require('../listings/listing.formatter');

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const MAX_SAVED = 100;

const dbDown = (res) => res.status(503).json({
  success: false,
  code: 'DB_DISCONNECTED',
  message: 'The server is running but not connected to the database.',
});

// @route   GET /api/v2/customers/saved
// @desc    The shortlist, hydrated, newest first
// @access  Customer session
const getSaved = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);

    const entries = [...(req.customer.saved || [])]
      .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));

    if (!entries.length) return res.json({ success: true, count: 0, data: [] });

    const ids = entries.map((e) => e.listingId).filter((id) => OBJECT_ID.test(id));
    const properties = await Property.find({ _id: { $in: ids } }).lean();
    const byId = new Map(properties.map((p) => [String(p._id), p]));

    const data = entries
      .map((entry) => {
        const property = byId.get(entry.listingId);
        if (!property) return null;
        return {
          listing: formatListing(property),
          rentWhenSaved: entry.rentWhenSaved,
          savedAt: entry.savedAt,
        };
      })
      .filter(Boolean);

    return res.json({ success: true, count: data.length, data });
  } catch (error) {
    return next(error);
  }
};

// @route   POST /api/v2/customers/saved
// @desc    Add one, recording what it cost today
// @access  Customer session
const addSaved = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);

    const { listingId } = req.body || {};
    if (!OBJECT_ID.test(String(listingId || ''))) {
      return res.status(400).json({ success: false, code: 'BAD_INPUT', message: 'Which listing?' });
    }

    /* Read for the rent, and to refuse an id that is not a listing. Saving
       something that does not exist would put a row on the shortlist that can
       never render. */
    const property = await Property.findById(listingId).lean();
    if (!property) {
      return res.status(404).json({
        success: false, code: 'NOT_FOUND', message: 'That listing is no longer available.',
      });
    }

    const customer = req.customer;
    const already = (customer.saved || []).some((e) => e.listingId === String(listingId));

    /* Saving twice is not an error — a double tap, or two devices — and it
       must NOT overwrite `rentWhenSaved` with today's figure. Doing so would
       quietly erase the comparison every time somebody re-tapped a bookmark
       that was already filled in. */
    if (!already) {
      if ((customer.saved || []).length >= MAX_SAVED) {
        return res.status(409).json({
          success: false,
          code: 'SAVED_FULL',
          message: `A shortlist holds ${MAX_SAVED} places. Remove one to add another.`,
        });
      }
      customer.saved.push({
        listingId: String(listingId),
        rentWhenSaved: Number(property.rent) > 0 ? Number(property.rent) : null,
        savedAt: new Date(),
      });
      await customer.save();
    }

    return res.status(already ? 200 : 201).json({
      success: true,
      data: { listingId: String(listingId), alreadySaved: already },
    });
  } catch (error) {
    return next(error);
  }
};

// @route   DELETE /api/v2/customers/saved/:listingId
// @access  Customer session
const removeSaved = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);

    const { listingId } = req.params;
    const customer = req.customer;
    const before = (customer.saved || []).length;

    customer.saved = (customer.saved || []).filter((e) => e.listingId !== String(listingId));

    /* Only written when something actually changed. Removing a listing that
       was not on the list is the undo of an undo, and answering 200 for it
       keeps the client's retry simple. */
    if (customer.saved.length !== before) await customer.save();

    return res.json({ success: true, data: { listingId: String(listingId) } });
  } catch (error) {
    return next(error);
  }
};

module.exports = { getSaved, addSaved, removeSaved };
