/* ══════════════════════════════════════════════════════════════════════════
   GET /api/v2/app-version?app=user

   The oldest build of each app this server still serves, so an app can stop
   itself — with the update screen — rather than run against an API it no
   longer matches and show a wrong price.

   Set per app in the environment, and absent by default: with nothing set
   no build is ever blocked, so deploying this changes nothing until somebody
   decides a version is too old.

     MIN_VERSION_USER_APP=1.4.0
     STORE_URL_USER_APP=https://play.google.com/store/apps/details?id=…

   Public and unauthenticated — the check runs before sign-in, and the answer
   is the same for everybody.
   ══════════════════════════════════════════════════════════════════════════ */
const express = require('express');

const APPS = {
  user: 'USER_APP',
  partner: 'STAY_PARTNER',
  food: 'FOOD_PARTNER',
  driver: 'DRIVER',
};

const router = express.Router();

router.get('/', (req, res) => {
  const key = APPS[String(req.query.app || '').trim()];
  if (!key) {
    return res.status(400).json({ success: false, code: 'UNKNOWN_APP', message: `app must be one of: ${Object.keys(APPS).join(', ')}.` });
  }
  return res.json({
    success: true,
    data: {
      minVersion: (process.env[`MIN_VERSION_${key}`] || '').trim() || null,
      storeUrl: (process.env[`STORE_URL_${key}`] || '').trim() || null,
    },
  });
});

module.exports = router;
