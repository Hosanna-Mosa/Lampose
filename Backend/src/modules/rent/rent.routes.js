/* The Rent tab — mounted at `/api/v2/partners/rent` by partner.routes.js. */
const express = require('express');

const { requirePartner } = require('../partners/partnerAuth.middleware');
const { requireLamposeDb } = require('../../shared/middleware/requireDb');
const {
  getOverview,
  getResidents,
  getResident,
  getDues,
  getUpcoming,
  getPayments,
  getPayment,
  getVacancy,
  getReminders,
  updateTerms,
  recordPayment,
  voidPayment,
  logReminder,
  updateSettings,
} = require('./rent.controller');

const router = express.Router();

router.use(requireLamposeDb, requirePartner);

router.get('/overview', getOverview);
router.get('/residents', getResidents);
router.get('/residents/:id', getResident);
router.patch('/residents/:id/terms', updateTerms);
router.post('/residents/:id/payments', recordPayment);
router.post('/residents/:id/reminders', logReminder);
router.get('/dues', getDues);
router.get('/upcoming', getUpcoming);
router.get('/payments', getPayments);
router.get('/payments/:id', getPayment);
router.post('/payments/:id/void', voidPayment);
router.get('/vacancy', getVacancy);
router.get('/reminders', getReminders);
router.patch('/settings', updateSettings);

module.exports = router;
