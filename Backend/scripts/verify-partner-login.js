/* ══════════════════════════════════════════════════════════════════════════
   The email-and-password sign-in for Stay Partner owners, end to end.

     npm run verify:partner-login

   ## It brings its own database

   `mongodb-memory-server`, started here and thrown away at the end. Nothing
   touches a real deployment: provisioning an owner is a WRITE, and a verify
   script that performed it against production would create a live account
   with a known password every time somebody ran the tests.

   ## What it asserts

   The route exists and is mounted at v2; a provisioned owner signs in and gets
   a partner session that `requirePartner` actually accepts; and — the half
   that matters more — every way of NOT signing in is refused, with the same
   sentence for a wrong address as for a wrong password, so the endpoint cannot
   be used to enumerate which owners Lampose has.
   ══════════════════════════════════════════════════════════════════════════ */

const crypto = require('crypto');
const { MongoMemoryServer } = require('mongodb-memory-server');

const results = [];
const check = (name, ok, extra = '') => results.push([!!ok, name, extra]);

const EMAIL = 'verify-partner-login@example.test';
const PASSWORD = 'verify-partner-1234';
const PHONE = '+919876500011';

/* Same shape the controller mints — see `startAuth` in partner.controller.js. */
const newPartnerId = () => `prt_${crypto.randomBytes(9).toString('hex')}`;

(async () => {
  const mongo = await MongoMemoryServer.create();

  /* Both BEFORE config/env is required — it reads the environment once. */
  process.env.MONGO_URI = mongo.getUri('lampose-verify');
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'verify-only-secret-not-a-credential';

  require('../src/config/env');
  const { connectDB, closeConnections, isLamposeUp } = require('../src/infrastructure/database/db');
  const createApp = require('../app');
  const Partner = require('../src/modules/partners/partner.model');

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
        'X-Client': 'partner-login-verify',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json = null;
    try { json = await res.json(); } catch { /* empty body is fine */ }
    return { status: res.status, json };
  };

  try {
    /* ── the account, provisioned exactly as the script does it ──────────── */
    const partner = new Partner({
      partnerId: newPartnerId(), phone: PHONE, email: EMAIL, name: 'Verify Owner',
    });
    partner.profileCompletedAt = new Date();
    /* What `--verified` asserts. `requirePartner` refuses a session without
       it, so a provisioned account that skipped this signs in to a 403. */
    partner.phoneVerifiedAt = new Date();
    partner.passwordHash = await Partner.hashPassword(PASSWORD);
    await partner.save();

    const stored = await Partner.findOne({ email: EMAIL }).select('+passwordHash');
    check(
      'the hash is bcrypt, not the plaintext',
      stored.passwordHash && stored.passwordHash !== PASSWORD && stored.passwordHash.startsWith('$2'),
    );
    check('verifyPassword accepts the right password', await stored.verifyPassword(PASSWORD));
    check('verifyPassword refuses a wrong one', !(await stored.verifyPassword('not-the-password')));

    const ordinary = await Partner.findOne({ email: EMAIL });
    check('passwordHash is select:false on an ordinary read', ordinary.passwordHash === undefined);
    check(
      'toPublic() cannot carry the hash out',
      !Object.prototype.hasOwnProperty.call(ordinary.toPublic(), 'passwordHash'),
    );

    /* ── the happy path ──────────────────────────────────────────────────── */
    const ok = await call('POST', '/api/v2/partners/auth/login', { email: EMAIL, password: PASSWORD });
    check('POST /api/v2/partners/auth/login → 200', ok.status === 200, `got ${ok.status}`);
    check('a token comes back', Boolean(ok.json?.data?.token));
    check('the partner comes back', ok.json?.data?.partner?.email === EMAIL);
    check(
      'the response carries no passwordHash',
      !JSON.stringify(ok.json || {}).includes('passwordHash'),
    );

    /* The token is a REAL partner session, not merely a signed string. */
    const token = ok.json?.data?.token;
    const me = await call('GET', '/api/v2/partners/me', undefined, token);
    check('that token is accepted by requirePartner', me.status === 200, `got ${me.status}`);
    check('/me is the same owner', me.json?.data?.email === EMAIL);

    /* ── every way of failing ────────────────────────────────────────────── */
    const wrongPw = await call('POST', '/api/v2/partners/auth/login', { email: EMAIL, password: 'wrong-password' });
    check('a wrong password → 401', wrongPw.status === 401, `got ${wrongPw.status}`);

    const noSuch = await call('POST', '/api/v2/partners/auth/login', { email: 'nobody@example.test', password: PASSWORD });
    check('an unknown email → 401', noSuch.status === 401, `got ${noSuch.status}`);

    check(
      'both refusals read the same — no account enumeration',
      wrongPw.json?.message === noSuch.json?.message,
      `${wrongPw.json?.message} vs ${noSuch.json?.message}`,
    );

    /* An owner who has never been given a password cannot be signed in with
       one — the fail-closed property the whole design rests on. */
    const noPw = new Partner({
      partnerId: newPartnerId(), phone: '+919876500022', email: 'nopassword@example.test',
    });
    await noPw.save();
    const never = await call('POST', '/api/v2/partners/auth/login', { email: 'nopassword@example.test', password: '' });
    check(
      'an account with no password cannot sign in',
      never.status === 400 || never.status === 401,
      `got ${never.status}`,
    );
    const neverTry = await call('POST', '/api/v2/partners/auth/login', { email: 'nopassword@example.test', password: 'anything-at-all' });
    check('…not even with a guess', neverTry.status === 401, `got ${neverTry.status}`);

    const blank = await call('POST', '/api/v2/partners/auth/login', { email: '', password: '' });
    check('an empty form → 400, not a generic refusal', blank.status === 400, `got ${blank.status}`);

    const badEmail = await call('POST', '/api/v2/partners/auth/login', { email: 'not-an-email', password: 'whatever' });
    check('a malformed email → 400', badEmail.status === 400, `got ${badEmail.status}`);

    /* A blocked owner is refused at the door rather than one call later. */
    stored.status = 'blocked';
    await stored.save();
    const blocked = await call('POST', '/api/v2/partners/auth/login', { email: EMAIL, password: PASSWORD });
    check('a blocked owner → 403 at sign-in', blocked.status === 403, `got ${blocked.status}`);
    stored.status = 'active';
    await stored.save();

    /*
     * An account that never proved its number is refused AT SIGN-IN, not one
     * call later. Properties are derived from the phone number, so a session
     * on an unproved one would read a stranger's listings — `requirePartner`
     * enforces that on every request, and this asserts the login route says so
     * up front rather than handing out a token every later call rejects.
     */
    const unverified = new Partner({
      partnerId: newPartnerId(), phone: '+919876500033', email: 'unverified@example.test',
    });
    unverified.passwordHash = await Partner.hashPassword(PASSWORD);
    await unverified.save();
    const unv = await call('POST', '/api/v2/partners/auth/login', { email: 'unverified@example.test', password: PASSWORD });
    check('an unverified number → 403 at sign-in, not a doomed token', unv.status === 403,
      `got ${unv.status}`);
    check('…and it says which', unv.json?.code === 'PHONE_NOT_VERIFIED', unv.json?.code);
    check('no token is issued to it', !unv.json?.data?.token);

    /* The unversioned path stays a 404 — the v1/v2 split is deliberate. */
    const unversioned = await call('POST', '/api/partners/auth/login', { email: EMAIL, password: PASSWORD });
    check(
      '/api/partners/auth/login (no version) stays 404',
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
  console.error('\nverify:partner-login blew up:', error);
  process.exit(2);
});
