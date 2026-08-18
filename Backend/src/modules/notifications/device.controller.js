/* ══════════════════════════════════════════════════════════════════════════
   Registering a handset, for both apps.

   One controller, two account types, because the rules are identical and the
   only difference is which collection the token lands in. A second copy of
   this for partners would be a second place to forget the validation.

   ## Why this is behind a session

   An Expo push token is not a secret, but anybody holding one can send that
   device a notification through Expo. Accepting tokens on a public route
   would let somebody register a stranger's handset against their own account
   and receive nothing — or, worse, register their own token against an
   account they do not own and read the titles of somebody else's alerts from
   the lock screen. So the session decides whose device this is; the body only
   says which device.

   ## Registering is an upsert, not an append

   The same token arriving twice is the ordinary case: the app registers on
   every launch, because a token can be reissued at any time. Appending would
   grow the array without bound and send the same person four copies of one
   notification.
   ══════════════════════════════════════════════════════════════════════════ */
const { isExpoToken } = require('../../infrastructure/push/push');

/* Enough for a phone, a tablet and a spare. Bounded because the array is
   pushed to on every launch of every install, and an account that somehow
   accumulated hundreds would turn one notification into hundreds of sends. */
const MAX_DEVICES = 10;

const PLATFORMS = ['ios', 'android', 'web'];

const badToken = (res) => res.status(422).json({
  success: false,
  code: 'INVALID_PUSH_TOKEN',
  message: 'That is not a valid Expo push token.',
});

/**
 * Store a device against whichever account is signed in.
 *
 * `find` identifies the account for the update; `label` is what the response
 * calls it. Both apps' routes are one line each on top of this.
 */
const registerFor = (Model, find) => async (req, res, next) => {
  try {
    const token = String((req.body && req.body.token) || '').trim();
    if (!isExpoToken(token)) return badToken(res);

    const platform = PLATFORMS.includes((req.body || {}).platform)
      ? req.body.platform
      : 'unknown';

    /* Upsert-by-token in two steps rather than one clever update, because
       Mongo cannot conditionally push-or-set an array element in a single
       operation. The pull is a no-op when the token is new. */
    await Model.updateOne(find, { $pull: { devices: { token } } });
    await Model.updateOne(find, {
      $push: {
        devices: {
          $each: [{ token, platform, lastSeenAt: new Date() }],
          /* Oldest out when the list is full: the device somebody last used is
             the one they are most likely holding. */
          $slice: -MAX_DEVICES,
        },
      },
    });

    /* The token is not echoed back. It arrived from the client, they have it,
       and putting it in a response body is one more place it can be logged. */
    return res.status(201).json({ success: true, data: { registered: true, platform } });
  } catch (error) {
    return next(error);
  }
};

/**
 * Forget a device.
 *
 * Called on sign-out. Without it, signing out of a shared handset leaves the
 * previous account still receiving that phone's notifications — somebody
 * else's booking alerts on a screen they can read.
 */
const unregisterFor = (Model, find) => async (req, res, next) => {
  try {
    const token = String((req.body && req.body.token) || '').trim();
    if (!token) return badToken(res);

    await Model.updateOne(find, { $pull: { devices: { token } } });
    return res.json({ success: true, data: { registered: false } });
  } catch (error) {
    return next(error);
  }
};

/* The two bindings. `req.customer` / `req.partner` are set by the session
   middleware — never read from the body, which is the whole point. */
const registerCustomerDevice = (req, res, next) => registerFor(
  require('../customers/customer.model'),
  { customerId: req.customer.customerId },
)(req, res, next);

const unregisterCustomerDevice = (req, res, next) => unregisterFor(
  require('../customers/customer.model'),
  { customerId: req.customer.customerId },
)(req, res, next);

const registerPartnerDevice = (req, res, next) => registerFor(
  require('../partners/partner.model'),
  { partnerId: req.partner.partnerId },
)(req, res, next);

const unregisterPartnerDevice = (req, res, next) => unregisterFor(
  require('../partners/partner.model'),
  { partnerId: req.partner.partnerId },
)(req, res, next);

module.exports = {
  MAX_DEVICES,
  registerCustomerDevice,
  unregisterCustomerDevice,
  registerPartnerDevice,
  unregisterPartnerDevice,
};
