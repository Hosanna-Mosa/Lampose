/* ══════════════════════════════════════════════════════════════════════════
   /api/v1/admin/food-staff-access — who used the Lampose staff password to
   get into a restaurant, and what they changed while in.

   Read-only. Rows are written by `staffAccess.js`; nothing here can create,
   edit or delete one, so the trail cannot be tidied up from the console.
   Super Admin and Admin only (`food.staff_access.read`): it names
   restaurants, IPs and every change, and it is the record anyone misusing
   the password would most like to read.
   ══════════════════════════════════════════════════════════════════════════ */
const express = require('express');

const verifyAdminToken = require('../analytics/verifyAdminToken.middleware');
const { requireLamposeDb } = require('../../shared/middleware/requireDb');
const { can } = require('../iam/iam.middleware');
const { tagFoodPartnerRequest } = require('./foodPartner.log');
const FoodStaffAccess = require('./foodStaffAccess.model');
const { isEnabled } = require('./staffAccess');

const router = express.Router();

const SESSION_LIMIT = 100;

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

router.use(tagFoodPartnerRequest);
router.use(verifyAdminToken);
router.use(requireLamposeDb);
router.use(can('food.staff_access.read'));

/**
 * @route   GET /api/v1/admin/food-staff-access
 * @desc    Staff sessions, newest first, each with its changes and blocked
 *          attempts. `?q=` matches restaurant id or name; `?limit=` ≤ 100.
 */
router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), SESSION_LIMIT);
    const q = String(req.query.q || '').trim();

    const loginFilter = { kind: 'login' };
    if (q) {
      const pattern = new RegExp(escapeRegex(q), 'i');
      loginFilter.$or = [{ restaurantId: pattern }, { restaurantName: pattern }, { identifier: pattern }];
    }

    const logins = await FoodStaffAccess.find(loginFilter).sort({ createdAt: -1 }).limit(limit).lean();
    const ids = logins.map((row) => row.sessionId);
    const events = ids.length
      ? await FoodStaffAccess.find({ sessionId: { $in: ids }, kind: { $ne: 'login' } })
        .sort({ createdAt: 1 }).lean()
      : [];

    const bySession = new Map(ids.map((id) => [id, []]));
    events.forEach((event) => bySession.get(event.sessionId)?.push({
      kind: event.kind,
      at: event.createdAt,
      method: event.method,
      path: event.path,
      action: event.action,
      changes: event.changes,
      statusCode: event.statusCode,
      ok: event.ok,
    }));

    const sessions = logins.map((login) => {
      const sessionEvents = bySession.get(login.sessionId) || [];
      return {
        sessionId: login.sessionId,
        restaurantId: login.restaurantId,
        restaurantName: login.restaurantName,
        surface: login.surface,
        identifier: login.identifier,
        ip: login.ip,
        userAgent: login.userAgent,
        at: login.createdAt,
        changeCount: sessionEvents.filter((event) => event.kind === 'change').length,
        blockedCount: sessionEvents.filter((event) => event.kind === 'blocked').length,
        events: sessionEvents,
      };
    });

    return res.json({ success: true, data: { enabled: isEnabled(), sessions } });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
