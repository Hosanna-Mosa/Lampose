/* ══════════════════════════════════════════════════════════════════════════
   Forgetting a handset without a session.

   POST /api/v2/devices/forget   { token }

   Every app unregisters its push token on sign-out — through a session-gated
   route. When the sign-out is BECAUSE the session died (expired, revoked,
   account gone), that call carries the dead token, is refused, and the handset
   stays registered: the lock screen keeps showing the old account's alerts,
   on a phone that may already belong to somebody else.

   So this route takes no session. It can only ever REMOVE a token, from every
   account type that holds it — never add one, never read anything. The worst a
   caller holding somebody's Expo push token can do with it is stop that
   handset's notifications until the app next registers, which it does on every
   launch. Limited by IP all the same.
   ══════════════════════════════════════════════════════════════════════════ */
const express = require('express');

const { rateLimit } = require('../../shared/middleware/rateLimit');
const { requireLamposeDb } = require('../../shared/middleware/requireDb');
const { isExpoToken } = require('../../infrastructure/push/push');

const router = express.Router();

const MODELS = [
  () => require('../customers/customer.model'),
  () => require('../partners/partner.model'),
  () => require('../foodpartners/foodRestaurant.model'),
  () => require('../drivers/driver.model'),
];

router.post(
  '/forget',
  rateLimit({ name: 'device-forget-ip', windowMs: 60 * 60 * 1000, max: 30 }),
  requireLamposeDb,
  async (req, res, next) => {
    try {
      const token = String((req.body && req.body.token) || '').trim();
      if (!isExpoToken(token)) {
        return res.status(422).json({
          success: false,
          code: 'INVALID_PUSH_TOKEN',
          message: 'That is not a valid Expo push token.',
        });
      }
      await Promise.all(MODELS.map((model) => model().updateMany(
        { 'devices.token': token },
        { $pull: { devices: { token } } },
      )));
      /* The same answer whether or not anything held it — nothing here says
         which accounts a token belonged to. */
      return res.json({ success: true, data: { registered: false } });
    } catch (error) {
      return next(error);
    }
  },
);

module.exports = router;
