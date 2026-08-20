/* ══════════════════════════════════════════════════════════════════════════
   The website's one-day session.

   Proving a phone number on a visit request opens a customer session, and
   that session lets the NEXT request skip the SMS code. The saving is real
   money — every skipped code is a DLT message nobody pays for — but the thing
   under test here is the opposite: that the skip is available in exactly one
   situation and no other.

   The rule the whole visit flow rests on is that an owner is contacted only
   after the customer's number is proven. A session is that proof, carried
   forward for a day. So every test below is a variation on "whose number does
   this token actually prove", and only the case where the answer is "the one
   being requested with" is allowed to skip anything.
   ══════════════════════════════════════════════════════════════════════════ */
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

/* ── the stubs go in BEFORE `app.js` is required, and that is not a style
      preference ─────────────────────────────────────────────────────────────
   The controller destructures its senders at the top of the file:

     const { sendVisitRequestMessage, … } = require('…/twilio');

   which copies the function into a local binding the moment that module is
   first loaded. Replacing the property on the module object afterwards
   changes nothing the controller can see, and the test then sends a real
   WhatsApp and a real SMS — or, without credentials, fails in a way that
   looks like a bug in the code under test.

   Requiring the two senders here, patching them, and only then loading the
   app means the destructure copies the stubs. Every capture below depends on
   this order.
   ────────────────────────────────────────────────────────────────────────── */
const twilio = require('../src/infrastructure/twilio/twilio');
const sms = require('../src/infrastructure/sms/sms');

/* Every code that would have been texted, and every owner message that would
   have gone out on WhatsApp. Neither third party is called. */
let codes = [];
let ownerMessages = [];

sms.sendOtpSms = async (phone, otp) => {
  codes.push({ phone, otp });
  return { success: true };
};
/* The gateway is unconfigured in a test environment, and the controller
   refuses with a 503 before it ever tries to send. Saying it is fine is what
   lets the OTP branch actually run. */
sms.smsConfigProblem = () => null;
twilio.sendVisitRequestMessage = async (payload) => {
  ownerMessages.push(payload);
  return { success: true, messageSid: `SM_${ownerMessages.length}` };
};

const { withDatabase } = require('./helpers/db');
const createApp = require('../app');
const config = require('../src/config/env');
const Customer = require('../src/modules/customers/customer.model');
const Property = require('../src/modules/properties/property.model');
const VisitRequest = require('../src/modules/visits/visitRequest.model');
const { signCustomerToken } = require('../src/modules/customers/customerAuth.middleware');
const { syncShareTypes } = require('../src/modules/inventory/inventory.service');
const { resetRateLimits } = require('../src/shared/middleware/rateLimit');

withDatabase();

let server;
let base;

before(async () => {
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  codes = [];
  ownerMessages = [];
  /* Eight starts an hour from one IP is the real limit, and it is the correct
     limit — but every test here starts a request from 127.0.0.1, so the file
     would trip it a third of the way through and the rest would fail as rate
     limiting rather than as whatever they were checking. Cleared between
     tests, never disabled: the limiter still runs, and the endToEnd suite
     still exercises it against the routes it guards. */
  resetRateLimits();
});

const call = (method, path, { token, body } = {}) => fetch(`${base}${path}`, {
  method,
  headers: {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  },
  body: body === undefined ? undefined : JSON.stringify(body),
}).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));

const ASKER = '9000012388';
const ASKER_E164 = `+91${ASKER}`;

let n = 0;
/** A listing with beds free, unique per call so no duplicate guard fires. */
const makeListing = async () => {
  n += 1;
  const property = await Property.create({
    name: `Session probe ${n}`,
    place: 'Hyderabad',
    category: 'PG_HOSTEL',
    ownerName: 'Owner',
    ownerMobile: '+919876500021',
    rent: 6000,
    isVerified: true,
    categoryDetails: {
      sharingTypes: ['2 Sharing'],
      sharingPrices: { '2 Sharing': 6000 },
      sharingBeds: { '2 Sharing': 5 },
    },
  });
  await syncShareTypes(property);
  return property;
};

const startRequest = async (property, token) => call('POST', '/api/v2/visit-requests', {
  token,
  body: {
    listingId: String(property._id),
    name: 'Venky',
    phone: ASKER,
    sharing: '2 Sharing',
    intent: {},
    consentedTerms: true,
    consentWhatsApp: true,
  },
});

describe('the website session — earning it', () => {
  it('a first request sends a code, and verifying it opens a session', async () => {
    const property = await makeListing();

    const started = await startRequest(property);
    assert.equal(started.status, 201);
    assert.equal(started.body.otpRequired, true, 'a stranger must be sent a code');
    assert.equal(codes.length, 1);

    const verified = await call('POST', `/api/v2/visit-requests/${started.body.data.id}/verify`, {
      body: { otp: codes[0].otp },
    });
    assert.equal(verified.status, 200);
    assert.equal(verified.body.data.status, 'pending_owner', 'the owner is told');
    assert.ok(verified.body.session, 'a session comes back with the result');
    assert.ok(verified.body.session.token);
  });

  it('the session lasts one day — not the app\'s week', async () => {
    const property = await makeListing();
    const started = await startRequest(property);
    const verified = await call('POST', `/api/v2/visit-requests/${started.body.data.id}/verify`, {
      body: { otp: codes[0].otp },
    });

    const claims = jwt.decode(verified.body.session.token);
    assert.equal(claims.typ, 'customer', 'it is an ordinary customer session');
    assert.equal(claims.exp - claims.iat, 24 * 60 * 60, 'exactly 24 hours');
  });

  it('the customer it belongs to keeps the name that was typed', async () => {
    const property = await makeListing();
    const started = await startRequest(property);
    await call('POST', `/api/v2/visit-requests/${started.body.data.id}/verify`, {
      body: { otp: codes[0].otp },
    });

    const customer = await Customer.findOne({ phone: ASKER_E164 });
    assert.equal(customer.name, 'Venky');
    assert.ok(customer.phoneVerifiedAt, 'and counts as a verified number');
  });

  it('and it works as a real session on the customer routes', async () => {
    const property = await makeListing();
    const started = await startRequest(property);
    const verified = await call('POST', `/api/v2/visit-requests/${started.body.data.id}/verify`, {
      body: { otp: codes[0].otp },
    });

    /* Not a private token type for the website. The same session the app
       issues, so a visitor who later installs the app is the same person. */
    const me = await call('GET', '/api/v2/customers/me', { token: verified.body.session.token });
    assert.equal(me.status, 200);
    assert.equal(me.body.data.phone, ASKER_E164);
  });
});

describe('the website session — spending it', () => {
  /** A live session for `ASKER`, without going through the OTP each time. */
  const sessionForAsker = async () => {
    const customer = await Customer.findOneAndUpdate(
      { phone: ASKER_E164 },
      { $setOnInsert: { customerId: `cus_test_${Date.now().toString(36)}`, phone: ASKER_E164 } },
      { upsert: true, new: true },
    );
    return signCustomerToken(customer, { expiresIn: '1d' });
  };

  it('a held session skips the code entirely', async () => {
    const token = await sessionForAsker();
    const property = await makeListing();

    const started = await startRequest(property, token);
    assert.equal(started.status, 201);
    assert.equal(started.body.otpRequired, false);
    assert.equal(codes.length, 0, 'no SMS was sent, and none was paid for');
  });

  it('and the owner is still only told after a call that says so', async () => {
    const token = await sessionForAsker();
    const property = await makeListing();

    const started = await startRequest(property, token);
    assert.equal(ownerMessages.length, 0, 'creating a request never messages an owner');

    /* With the session, and no code — that pairing is the whole feature. */
    const done = await call('POST', `/api/v2/visit-requests/${started.body.data.id}/verify`, {
      token,
      body: {},
    });
    assert.equal(done.status, 200);
    assert.equal(done.body.data.status, 'pending_owner');
    assert.equal(ownerMessages.length, 1);
  });

  it('but a stranger who guesses the request id cannot finish it', async () => {
    const token = await sessionForAsker();
    const property = await makeListing();
    const started = await startRequest(property, token);

    /* No code was sent for this request, so the code cannot be what protects
       it. Without the session it was created from, the request id alone must
       not be enough to make an owner's phone ring. */
    const stranger = await call('POST', `/api/v2/visit-requests/${started.body.data.id}/verify`, {
      body: {},
    });
    assert.equal(stranger.status, 401);
    assert.equal(stranger.body.code, 'SESSION_REQUIRED');
    assert.equal(ownerMessages.length, 0, 'the owner was not told');

    /* And the person it belongs to still finishes it normally. */
    const owner = await call('POST', `/api/v2/visit-requests/${started.body.data.id}/verify`, {
      token,
      body: {},
    });
    assert.equal(owner.status, 200);
    assert.equal(ownerMessages.length, 1);
  });

  it('a session for a different number cannot finish it either', async () => {
    const token = await sessionForAsker();
    const property = await makeListing();
    const started = await startRequest(property, token);

    const other = await Customer.findOneAndUpdate(
      { phone: '+919000099922' },
      { $setOnInsert: { customerId: 'cus_verify_other', phone: '+919000099922' } },
      { upsert: true, new: true },
    );
    const wrong = await call('POST', `/api/v2/visit-requests/${started.body.data.id}/verify`, {
      token: signCustomerToken(other, { expiresIn: '1d' }),
      body: {},
    });
    assert.equal(wrong.status, 401);
    assert.equal(ownerMessages.length, 0);
  });

  it('the request is recorded as verified, not merely unasked', async () => {
    const token = await sessionForAsker();
    const property = await makeListing();

    const started = await startRequest(property, token);
    const doc = await VisitRequest.findById(started.body.data.id);
    assert.ok(doc.phoneVerifiedAt, 'the number is proven by the session');
    assert.equal(doc.otp.hash, null, 'and no code exists to be guessed');
  });
});

describe('the website session — what must never skip a code', () => {
  /* Each case asks with `ASKER`'s number and some token. Only a live customer
     session for that same number may skip. Everything else — including
     tokens that are perfectly valid for something else — falls back to SMS,
     which is the safe direction to fail in. */
  const mustDemandACode = async (label, makeToken) => {
    const property = await makeListing();
    const before = codes.length;
    const started = await startRequest(property, await makeToken());

    assert.notEqual(started.body.otpRequired, false, `${label} skipped the code`);
    assert.equal(codes.length, before + 1, `${label} did not trigger an SMS`);
  };

  it('a session belonging to a different number', async () => {
    const other = await Customer.create({ customerId: 'cus_someone_else', phone: '+919000099911' });
    await mustDemandACode('another number\'s session', () => signCustomerToken(other, { expiresIn: '1d' }));
  });

  it('an expired session', async () => {
    const mine = await Customer.findOneAndUpdate(
      { phone: ASKER_E164 },
      { $setOnInsert: { customerId: 'cus_expired_probe', phone: ASKER_E164 } },
      { upsert: true, new: true },
    );
    await mustDemandACode('an expired session', () => signCustomerToken(mine, { expiresIn: '-1s' }));
  });

  it('a staff token, which verifies against the same secret', async () => {
    /* The `typ` claim is the only thing separating the three identity systems
       that share this process. This is the test that says so. */
    await mustDemandACode('a staff token', () => jwt.sign(
      { userId: 'staff-1', typ: 'staff', phone: ASKER_E164 },
      config.auth.jwtSecret,
      { expiresIn: '1d' },
    ));
  });

  it('a token signed with the wrong secret', async () => {
    const mine = await Customer.findOne({ phone: ASKER_E164 })
      || await Customer.create({ customerId: 'cus_forged_probe', phone: ASKER_E164 });
    await mustDemandACode('a forged token', () => jwt.sign(
      { sub: mine.customerId, typ: 'customer', phone: ASKER_E164 },
      'not-the-real-secret-not-the-real-secret',
      { expiresIn: '1d' },
    ));
  });

  it('a blocked account, even with a live token', async () => {
    const blocked = await Customer.findOneAndUpdate(
      { phone: ASKER_E164 },
      { $setOnInsert: { customerId: 'cus_blocked_probe', phone: ASKER_E164 } },
      { upsert: true, new: true },
    );
    const token = signCustomerToken(blocked, { expiresIn: '1d' });
    blocked.status = 'blocked';
    await blocked.save();

    /* The database is read on every request precisely so that blocking takes
       effect immediately rather than whenever the token happens to run out. */
    await mustDemandACode('a blocked account', () => token);
  });

  it('nonsense in the Authorization header', async () => {
    await mustDemandACode('a garbage token', () => 'not.a.jwt');
  });

  it('no token at all', async () => {
    await mustDemandACode('no token', () => null);
  });
});
