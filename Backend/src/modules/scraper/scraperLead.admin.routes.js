/* ══════════════════════════════════════════════════════════════════════════
   Admin-console CRUD over `scriper_leads`. scraper.routes.js already lets the
   leads panel filter/assign/change-status of leads; this adds the console's
   own Super-Admin-only path plus the two operations that never existed
   anywhere — a full-field edit and an outright delete of a single lead. See
   scriperUser.admin.routes.js for why this lives on the v1 side.
   ══════════════════════════════════════════════════════════════════════════ */
const express = require('express');
const router = express.Router();

const dbStore = require('./scraper.store');
const requireSuperAdmin = require('../../shared/middleware/requireSuperAdmin');
const { requireScriperStore } = require('../../shared/middleware/requireDb');

router.use(requireSuperAdmin, requireScriperStore);

// @route   GET /api/admin/scriper-leads
router.get('/', async (req, res) => {
  try {
    const { search, jobId, source, leadStatus } = req.query;
    const leads = await dbStore.getLeads({ search, jobId, source, leadStatus });
    return res.json({ success: true, count: leads.length, data: leads, items: leads });
  } catch (error) {
    console.error('❌ [GET /api/admin/scriper-leads Error]:', error.message);
    return res.status(500).json({ success: false, message: error.message || 'Error fetching leads.' });
  }
});

// @route   POST /api/admin/scriper-leads
// @desc    A manually-entered lead — not one found by a scrape job.
router.post('/', async (req, res) => {
  try {
    const { businessName, source, phone, email, website, address, rating, reviewsCount, category, city, landmark, mapsUrl, jobId } = req.body || {};
    if (!businessName) {
      return res.status(400).json({ success: false, message: 'Business name is required.' });
    }
    if (!source) {
      return res.status(400).json({ success: false, message: 'Source is required.' });
    }

    const created = await dbStore.createLead({
      jobId: jobId || 'manual',
      source,
      businessName,
      phone: phone || '',
      email: email || '',
      website: website || '',
      hasWebsite: Boolean(website),
      address: address || '',
      rating: rating || '',
      reviewsCount: Number(reviewsCount) || 0,
      category: category || '',
      city: city || '',
      landmark: landmark || '',
      mapsUrl: mapsUrl || '',
    });

    console.log(`✅ [Lead Created] "${created.businessName}"`);
    return res.status(201).json({ success: true, message: 'Lead created.', data: created });
  } catch (error) {
    console.error('❌ [POST /api/admin/scriper-leads Error]:', error.message);
    return res.status(500).json({ success: false, message: error.message || 'Error creating lead.' });
  }
});

// @route   PUT /api/admin/scriper-leads/:id
router.put('/:id', async (req, res) => {
  try {
    const {
      businessName, source, phone, email, website, address, rating,
      reviewsCount, category, city, landmark, mapsUrl, leadStatus,
    } = req.body || {};

    const changes = {
      ...(businessName !== undefined && { businessName }),
      ...(source !== undefined && { source }),
      ...(phone !== undefined && { phone }),
      ...(email !== undefined && { email }),
      ...(website !== undefined && { website, hasWebsite: Boolean(website) }),
      ...(address !== undefined && { address }),
      ...(rating !== undefined && { rating }),
      ...(reviewsCount !== undefined && { reviewsCount: Number(reviewsCount) }),
      ...(category !== undefined && { category }),
      ...(city !== undefined && { city }),
      ...(landmark !== undefined && { landmark }),
      ...(mapsUrl !== undefined && { mapsUrl }),
      ...(leadStatus !== undefined && { leadStatus }),
    };

    const updated = await dbStore.updateLead(req.params.id, changes);
    if (!updated) return res.status(404).json({ success: false, message: 'Lead not found.' });

    console.log(`✏️ [Lead Updated] "${updated.businessName}" (${req.params.id})`);
    return res.json({ success: true, message: 'Lead updated.', data: updated });
  } catch (error) {
    console.error(`❌ [PUT /api/admin/scriper-leads/${req.params.id} Error]:`, error.message);
    return res.status(500).json({ success: false, message: error.message || 'Error updating lead.' });
  }
});

// @route   DELETE /api/admin/scriper-leads/:id
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await dbStore.deleteLead(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: 'Lead not found.' });

    console.log(`🗑️ [Lead Deleted] ID: ${req.params.id}`);
    return res.json({ success: true, message: 'Lead deleted.' });
  } catch (error) {
    console.error(`❌ [DELETE /api/admin/scriper-leads/${req.params.id} Error]:`, error.message);
    return res.status(500).json({ success: false, message: error.message || 'Error deleting lead.' });
  }
});

module.exports = router;
