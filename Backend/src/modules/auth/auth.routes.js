const express = require('express');
const {
  register,
  login,
  getMe,
  onboardingLogin,
  verifyEmployeeToken,
} = require('./auth.controller');
const { authMiddleware, protect, protectRole } = require('../../shared/middleware/authMiddleware');
const { rateLimit } = require('../../shared/middleware/rateLimit');
const { requireScriperStore, requireAuthConfig } = require('../../shared/middleware/requireDb');

const router = express.Router();

/*
 * Brute force, throttled — the same helper and the same windows the admin
 * console's login already uses.
 *
 * Counted by EMAIL as well as by IP, because a single address trying fifteen
 * accounts and fifteen addresses trying a single account are both attacks and
 * an IP-only bucket sees neither clearly. `/register` is IP-only: it is now an
 * ADMIN action, so the limit is a backstop against a stolen admin session
 * rather than the primary control.
 */
const emailKey = (req) => String((req.body && req.body.email) || '').trim().toLowerCase() || req.ip;

const loginByIp = rateLimit({ name: 'v2-auth-login-ip', windowMs: 15 * 60 * 1000, max: 40 });
const loginByEmail = rateLimit({
  name: 'v2-auth-login-email', windowMs: 15 * 60 * 1000, max: 10, keyOf: emailKey,
});
const registerByIp = rateLimit({ name: 'v2-auth-register-ip', windowMs: 60 * 60 * 1000, max: 10 });

/* Nothing here can work without a signing key, and issuing a token signed
   with a blank secret is worse than refusing. Only ever trips when
   JWT_SECRET is missing in production. */
router.use(requireAuthConfig);

/* Every route reads or writes the user collection, so a disconnected store
   must answer 503 rather than hang on a buffered query and then return a
   timeout that names nothing. */
router.use(requireScriperStore);

/*
 * ══════════════════════════════════════════════════════════════════════════
 * Creating a staff account is an ADMIN action, not a public one.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * This route used to sit here with nothing in front of it but the two health
 * guards above — neither of which asks WHO is calling. A stranger could POST a
 * name, an email and a six-character password and receive a signed
 * `scriper_users` token in the same response: no invite, no email
 * confirmation, no approval. That token is the leads panel's and the Onboard
 * app's identity, so it reached the scraped-lead database and its export, the
 * v2 property write routes, the team list and the shared Cloudinary upload.
 *
 * `role: 'ADMIN'` was already refused without `ADMIN_SECRET_KEY`, and the
 * comment beside that check called the key "the only thing standing between a
 * stranger and full access". The gap was that EMPLOYEE — the DEFAULT role —
 * was never treated as access at all. It is.
 *
 * Guarded exactly the way `POST /api/v2/users` is, because it does exactly
 * what that route does: `dbStore.createUser` is a one-line wrapper around the
 * `registerUser` this controller calls. An anonymous caller now gets 401 and a
 * signed-in EMPLOYEE gets 403.
 *
 * DEPRECATED, and kept only because two sign-up screens still post here —
 * `Onboard/src/components/auth/.../AuthModal.jsx` and `Leads/src/api/authApi.ts`.
 * Both are the front door this hole was reached through and should become an
 * invite flow; until they do, a 403 is a clearer answer than a 404. New
 * callers belong on `POST /api/v2/users`.
 *
 * NOT the v1 bootstrap pattern (`admin.routes.js` refuses once any account
 * exists) because this collection already holds administrators, so there is
 * nothing to bootstrap. A fresh deployment WOULD need that pattern — see the
 * note in the security review; `SEED_DEFAULT_USERS` is not an acceptable
 * answer, since it seeds a published password.
 */
router.post('/register', registerByIp, protect, protectRole('ADMIN'), register);
router.post('/login', loginByIp, loginByEmail, login);

/* The onboarding app posts here (onboards-frontend/src/services/auth.js).
   Same accounts as /login, different response shape. */
router.post('/onboarding-login', loginByIp, loginByEmail, onboardingLogin);
router.post('/verify-employee', loginByIp, loginByEmail, onboardingLogin);
/* A token check rather than a password check, so it is counted by IP alone —
   there is no email in the body to bucket on. */
router.post('/verify-token', loginByIp, verifyEmployeeToken);

/* Always guarded, regardless of REQUIRE_AUTH: "who am I" has no meaning
   without a token, and the panel treats a failure here as a signed-out
   session. */
router.get('/me', authMiddleware, getMe);

module.exports = router;
