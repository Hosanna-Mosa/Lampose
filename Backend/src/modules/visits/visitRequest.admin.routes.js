/* ══════════════════════════════════════════════════════════════════════════
   Admin-console CRUD over the `visitrequests` collection.

   visitRequest.routes.js is the *public* surface (OTP start/verify/resend,
   status poll) that the customer-facing "Request a visit" flow uses — this
   file is separate and Super-Admin-only, giving the console the same
   list/edit/delete control over this collection that it already has over
   properties, verifications and permissions.

   The OTP secret (`otp.hash` / `otp.salt`) is never accepted from the request
   body on PUT — editing here is for correcting/managing a request's visible
   fields and lifecycle, not for replaying its verification.
   ══════════════════════════════════════════════════════════════════════════ */
const express = require('express');
const router = express.Router();

const VisitRequest = require('./visitRequest.model');
const requireSuperAdmin = require('../../shared/middleware/requireSuperAdmin');

router.use(requireSuperAdmin);

// @route   GET /api/admin/visit-requests
router.get('/', async (req, res) => {
  try {
    const { status, search } = req.query;
    const query = {};

    if (status && status !== 'All') query.status = status;

    if (search) {
      query.$or = [
        { propertyName: { $regex: search, $options: 'i' } },
        { ownerName: { $regex: search, $options: 'i' } },
        { ownerMobile: { $regex: search, $options: 'i' } },
        { 'customer.name': { $regex: search, $options: 'i' } },
        { 'customer.phone': { $regex: search, $options: 'i' } },
        { 'customer.email': { $regex: search, $options: 'i' } },
      ];
    }

    const items = await VisitRequest.find(query).sort({ createdAt: -1 }).limit(500);
    return res.json({ success: true, count: items.length, data: items, items });
  } catch (error) {
    console.error('❌ [GET /api/admin/visit-requests Error]:', error.message);
    return res.status(500).json({ success: false, message: error.message || 'Error fetching visit requests.' });
  }
});

// @route   GET /api/admin/visit-requests/:id
router.get('/:id', async (req, res) => {
  try {
    const item = await VisitRequest.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Visit request not found.' });
    return res.json({ success: true, data: item });
  } catch (error) {
    console.error(`❌ [GET /api/admin/visit-requests/${req.params.id} Error]:`, error.message);
    return res.status(500).json({ success: false, message: error.message || 'Error fetching visit request.' });
  }
});

// @route   PUT /api/admin/visit-requests/:id
router.put('/:id', async (req, res) => {
  try {
    const { status, propertyName, ownerName, ownerMobile, preferredDate, preferredTime, decidedAt, customer } = req.body;

    const changes = {
      ...(status !== undefined && { status }),
      ...(propertyName !== undefined && { propertyName }),
      ...(ownerName !== undefined && { ownerName }),
      ...(ownerMobile !== undefined && { ownerMobile }),
      ...(preferredDate !== undefined && { preferredDate }),
      ...(preferredTime !== undefined && { preferredTime }),
      ...(decidedAt !== undefined && { decidedAt }),
    };

    if (customer && typeof customer === 'object') {
      if (customer.name !== undefined) changes['customer.name'] = customer.name;
      if (customer.phone !== undefined) changes['customer.phone'] = customer.phone;
      if (customer.email !== undefined) changes['customer.email'] = customer.email;
    }

    const updated = await VisitRequest.findByIdAndUpdate(req.params.id, { $set: changes }, { new: true, runValidators: true });
    if (!updated) return res.status(404).json({ success: false, message: 'Visit request not found.' });

    console.log(`✏️ [Visit Request Updated] ID: ${req.params.id}`);
    return res.json({ success: true, message: 'Visit request updated.', data: updated });
  } catch (error) {
    console.error(`❌ [PUT /api/admin/visit-requests/${req.params.id} Error]:`, error.message);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    return res.status(500).json({ success: false, message: error.message || 'Error updating visit request.' });
  }
});

// @route   DELETE /api/admin/visit-requests/:id
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await VisitRequest.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: 'Visit request not found.' });

    console.log(`🗑️ [Visit Request Deleted] ID: ${req.params.id}`);
    return res.json({ success: true, message: 'Visit request deleted.' });
  } catch (error) {
    console.error(`❌ [DELETE /api/admin/visit-requests/${req.params.id} Error]:`, error.message);
    return res.status(500).json({ success: false, message: error.message || 'Error deleting visit request.' });
  }
});

module.exports = router;
