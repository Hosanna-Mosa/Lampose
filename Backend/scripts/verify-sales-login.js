/* ══════════════════════════════════════════════════════════════════════════
   Sales rep account creation + login, end to end — the Tracker app's whole
   backend surface as it stands today.

     npm run verify:sales-login

   Same shape as `verify-partner-login.js`: its own throwaway
   `mongodb-memory-server`, thrown away at the end, so this never touches a
   real deployment.

   There is no self-registration any more — `sales.controller.js`'s header
   explains why. An account is created by an administrator at
   `POST /api/v1/admin/sales-reps`, so that is the door this script walks
   through too, the same way `verify-driver-onboarding.js` signs its own
   admin token to reach an admin-only route. From there: a rep created that
   way can sign back in, the token `requireSalesRep` actually accepts, and —
   the half that matters more — every way of NOT getting in is refused, with
   the same sentence for a wrong password as for an unknown email.
   ══════════════════════════════════════════════════════════════════════════ */

const { MongoMemoryServer } = require('mongodb-memory-server');

const results = [];
const check = (name, ok, extra = '') => results.push([!!ok, name, extra]);

const EMAIL = 'verify-sales-login@example.test';
const PASSWORD = 'verify-sales-1234';
const NAME = 'Verify Rep';

(async () => {
  const mongo = await MongoMemoryServer.create();

  /* Both BEFORE config/env is required — it reads the environment once. */
  process.env.MONGO_URI = mongo.getUri('lampose-verify');
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'verify-only-secret-not-a-credential';

  require('../src/config/env');
  /* Refuse to run against production. See src/infrastructure/database/guard.js */
  require('../src/infrastructure/database/guard').assertDevTargetOrExit();
  const { connectDB, closeConnections, isLamposeUp } = require('../src/infrastructure/database/db');
  const createApp = require('../app');
  const SalesRep = require('../src/modules/sales/salesRep.model');
  const Admin = require('../src/modules/admins/admin.model');
  const { signAdminToken } = require('../src/modules/admins/adminToken');

  await connectDB().catch(() => {});
  for (let i = 0; i < 40 && !isLamposeUp(); i += 1) {
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!isLamposeUp()) { console.log('\nin-memory MongoDB did not come up\n'); process.exit(2); }

  const app = createApp({});
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;

  const call = async (method, path, body, token) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Client': 'sales-login-verify',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json = null;
    try { json = await res.json(); } catch { /* empty body is fine */ }
    return { status: res.status, json };
  };

  try {
    /* ── 0. An administrator to create the account with ─────────────────── */
    const stamp = String(Date.now()).slice(-6);
    const admin = await Admin.create({
      name: 'Verify Sales Admin',
      email: `verify-sales-admin-${stamp}@lampose.test`,
      password: `Verify!${stamp}aA`,
      role: 'Admin',
      status: 'Active',
    });
    const adminToken = signAdminToken(admin, { expiresIn: '1h' });

    /* An admin-only route — no token at all must not work. */
    const noAuth = await call('POST', '/api/v1/admin/sales-reps', { name: NAME, email: EMAIL, password: PASSWORD });
    check('creating a rep with no admin token → 401', noAuth.status === 401, `got ${noAuth.status}`);

    /* ── the happy path: an admin creates the account, the rep signs in ──── */
    const created = await call('POST', '/api/v1/admin/sales-reps', { name: NAME, email: EMAIL, password: PASSWORD }, adminToken);
    check('POST /api/v1/admin/sales-reps → 201', created.status === 201, `got ${created.status}`);
    check('the rep comes back', created.json?.data?.salesRep?.email === EMAIL);
    check('a salesRepId in the SR- shape', /^SR-[0-9A-F]{8}$/.test(created.json?.data?.salesRep?.id || ''));
    check(
      'the response carries no passwordHash',
      !JSON.stringify(created.json || {}).includes('passwordHash'),
    );

    const stored = await SalesRep.findOne({ email: EMAIL }).select('+passwordHash');
    check(
      'the hash is bcrypt, not the plaintext',
      stored.passwordHash && stored.passwordHash !== PASSWORD && stored.passwordHash.startsWith('$2'),
    );
    const ordinary = await SalesRep.findOne({ email: EMAIL });
    check('passwordHash is select:false on an ordinary read', ordinary.passwordHash === undefined);

    const ok = await call('POST', '/api/v2/sales/auth/login', { email: EMAIL, password: PASSWORD });
    check('POST /api/v2/sales/auth/login → 200', ok.status === 200, `got ${ok.status}`);
    check('a token comes back on login', Boolean(ok.json?.data?.token));

    /* The token is a REAL sales session, not merely a signed string. */
    const token = ok.json?.data?.token;
    const me = await call('GET', '/api/v2/sales/me', undefined, token);
    check('that token is accepted by requireSalesRep', me.status === 200, `got ${me.status}`);
    check('/me is the same rep', me.json?.data?.salesRep?.email === EMAIL);

    /* A token from a DIFFERENT identity (no typ at all) must not work here —
       the one line every guard in this process lives or dies by. */
    const jwt = require('jsonwebtoken');
    const foreignToken = jwt.sign({ sub: 'whatever' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const foreign = await call('GET', '/api/v2/sales/me', undefined, foreignToken);
    check('a token with no typ claim is refused', foreign.status === 401, `got ${foreign.status}`);

    /* A sales rep's own token must not open the admin-only creation route —
       the two identity systems never cross-authorise. */
    const repCreates = await call('POST', '/api/v1/admin/sales-reps', { name: 'X', email: 'nope@example.test', password: 'irrelevant1' }, token);
    check('a sales rep token on the admin create route → refused', repCreates.status === 401 || repCreates.status === 403, `got ${repCreates.status}`);

    /* ── every way of failing ────────────────────────────────────────────── */
    const dup = await call('POST', '/api/v1/admin/sales-reps', { name: 'Someone Else', email: EMAIL, password: 'irrelevant1' }, adminToken);
    check('creating the same email twice → 409', dup.status === 409, `got ${dup.status}`);

    const wrongPw = await call('POST', '/api/v2/sales/auth/login', { email: EMAIL, password: 'wrong-password' });
    check('a wrong password → 401', wrongPw.status === 401, `got ${wrongPw.status}`);

    const noSuch = await call('POST', '/api/v2/sales/auth/login', { email: 'nobody@example.test', password: PASSWORD });
    check('an unknown email → 401', noSuch.status === 401, `got ${noSuch.status}`);

    check(
      'both refusals read the same — no account enumeration',
      wrongPw.json?.message === noSuch.json?.message,
      `${wrongPw.json?.message} vs ${noSuch.json?.message}`,
    );

    const shortPw = await call('POST', '/api/v1/admin/sales-reps', { name: 'X', email: 'short@example.test', password: '123' }, adminToken);
    check('a too-short password on create → 400', shortPw.status === 400, `got ${shortPw.status}`);

    const badEmail = await call('POST', '/api/v2/sales/auth/login', { email: 'not-an-email', password: PASSWORD });
    check('a malformed email → 400', badEmail.status === 400, `got ${badEmail.status}`);

    const blankLogin = await call('POST', '/api/v2/sales/auth/login', { email: '', password: '' });
    check('an empty login form → 400, not a generic refusal', blankLogin.status === 400, `got ${blankLogin.status}`);

    /* A deactivated rep is refused at the door, not one call later. */
    stored.status = 'inactive';
    await stored.save();
    const inactive = await call('POST', '/api/v2/sales/auth/login', { email: EMAIL, password: PASSWORD });
    check('a deactivated rep → 403 at sign-in', inactive.status === 403, `got ${inactive.status}`);
    stored.status = 'active';
    await stored.save();

    /* Self-registration is gone — the old public door stays shut. */
    const oldRegister = await call('POST', '/api/v2/sales/auth/register', { name: 'X', email: 'anyone@example.test', password: 'irrelevant1' });
    check('the old /api/v2/sales/auth/register is gone (404)', oldRegister.status === 404, `got ${oldRegister.status}`);

    /* The unversioned path stays a 404 — /sales has no unversioned alias,
       matching /drivers and /food-partners. */
    const unversioned = await call('POST', '/api/sales/auth/login', { email: EMAIL, password: PASSWORD });
    check(
      '/api/sales/auth/login (no version) stays 404',
      unversioned.status === 404,
      `got ${unversioned.status}`,
    );
  } finally {
    server.close();
    await closeConnections().catch(() => {});
    await mongo.stop().catch(() => {});
  }

  const failed = results.filter(([ok]) => !ok);
  console.log('');
  results.forEach(([ok, name, extra]) => {
    console.log(`  ${ok ? '✓' : '✗'} ${name}${!ok && extra ? `  — ${extra}` : ''}`);
  });
  console.log(`\n  ${results.length - failed.length}/${results.length} passed\n`);
  process.exit(failed.length ? 1 : 0);
})().catch((error) => {
  console.error('\nverify:sales-login blew up:', error);
  process.exit(2);
});
