/* ══════════════════════════════════════════════════════════════════════════
   How an approved owner gets into their console.

   TWO messages, because neither channel can carry the whole thing: an SMS on
   the DLT-registered route with their ID and their password, and a WhatsApp
   saying they are approved, naming the listing, and pointing at the console.
   Meta refused EIGHT WhatsApp templates on this account before one passed —
   two carrying a credential, and six carrying none, of which the last three
   were refused merely for saying that sign-in details had been sent. So the
   approved one mentions neither, and DLT text is one registered sentence that
   cannot carry a name, a link and an instruction.

   Five things have to hold together, and each fails silently on its own:

     · A restaurant onboarded by a field agent has a password hash from the
       start, so no account sits in the database with no credential at all.
     · Approving one mints a password, stores only its bcrypt hash, and sends
       it — once, on a real transition. Approving an already-approved
       restaurant must not mint a second and invalidate the first.
     · The ID and the password go into the registered body IN ORDER. One value
       repeated into both slots would tell an owner their password is their
       phone number.
     · When the SMS fails the owner is stuck and the password is unrecoverable
       by design, so a one-time LINK is minted and handed to the approver
       instead. A password never appears on a staff screen.
     · The owner can change it afterwards, and only with the current one.

   The plaintext is asserted to be absent from the document and from the reply
   in the same breath as it is asserted to be IN the text message. That is the
   whole design: it exists for the length of one request.
   ══════════════════════════════════════════════════════════════════════════ */
const test = require('node:test');
const assert = require('node:assert/strict');

const { withDatabase } = require('./helpers/db');
const twilio = require('../src/infrastructure/twilio/twilio');
const FoodRestaurant = require('../src/modules/foodpartners/foodRestaurant.model');
const { sanitiseApplication } = require('../src/modules/foodpartners/foodPartner.util');
const { decideRestaurant, resendCredentials } = require('../src/modules/foodpartners/foodAdmin.controller');
const {
  changePassword, checkPasswordSetup, completePasswordSetup,
} = require('../src/modules/foodpartners/restaurantAdmin.controller');
const { hashSetupToken } = require('../src/modules/foodpartners/passwordSetup.util');
const approvedTemplate = require('../src/infrastructure/twilio/restaurantApprovedTemplate');

/*
 * The approved template's sid, fixed here.
 *
 * It decides which of two paths `sendContentOrText` takes — a TEMPLATE send
 * with numbered variables when it is set, free text when it is not — so
 * leaving it to whatever is in a developer's `.env` means this file asserts
 * one shape on one machine and the other on the next. Production has it set;
 * that is the path worth asserting.
 */
const CONTENT_SID = 'HXTESTrestaurantapproved00000000';

withDatabase();

/** A stand-in for Twilio's client — it records what would have been sent. */
const fakeClient = ({ createError = null } = {}) => {
  const created = [];
  const messages = () => ({ fetch: async () => ({ status: 'delivered' }) });
  messages.create = async (payload) => {
    created.push(payload);
    if (createError) throw createError;
    return { sid: 'SMFAKE0001', status: 'queued' };
  };
  return { client: { messages }, created };
};

/*
 * The DLT gateway, stubbed at `fetch`.
 *
 * `sms.js` reads its configuration from the environment on every call, so the
 * template is set here rather than mocked — the body below has the shape of
 * the one registered with smslogin.co, both slots and all.
 */
const SMS_ENV = {
  SMS_USERNAME: 'test-user',
  SMS_APIKEY: 'test-key',
  SMS_SENDERID: 'LMPPVT',
  SMS_PARTNER_PASSWORD_TEMPLATE_ID: '1707000000000000000',
  PARTNER_PASSWORD_SMS_TEMPLATE:
    'Your Lampose partner console ID is {#var#} and your password is {#var#}. Change your password after your first sign-in.',
};

const fakeGateway = ({ refuse = false } = {}) => {
  const sent = [];
  const real = global.fetch;

  global.fetch = async (url) => {
    sent.push(new URL(String(url)));
    return {
      ok: true,
      status: 200,
      text: async () => (refuse ? 'Invalid template id' : "{'campid':'a3b928bcffad921463c3'}"),
    };
  };

  return {
    sent,
    /** What the handset would have shown, for the most recent send. */
    lastMessage: () => (sent.length ? sent[sent.length - 1].searchParams.get('message') : null),
    restore: () => { global.fetch = real; },
  };
};

/** The password, read back out of the text message the gateway was given. */
const passwordFrom = (message) => (String(message || '').match(/password is (\S+?)\./) || [])[1];

/** And the ID it was sent beside. */
const idFrom = (message) => (String(message || '').match(/ID is (\S+?) /) || [])[1];

/** The reply, captured — these controllers answer, they do not return. */
const fakeRes = () => {
  const out = { statusCode: 200, body: null };
  out.status = (code) => { out.statusCode = code; return out; };
  out.json = (body) => { out.body = body; return out; };
  return out;
};

const never = (error) => { throw error || new Error('next() should not be called'); };

/* bcrypt is deliberately slow, and this file would otherwise pay for it a
   dozen times over for one fixed string. Hashed once, reused — the hashing
   itself is exercised by the code under test, which mints its own. */
let onboardingHash = null;
const startingHash = async () => {
  if (!onboardingHash) onboardingHash = await FoodRestaurant.hashPassword('onboarding-generated');
  return onboardingHash;
};

let seq = 0;
const saveRestaurant = async (over = {}) => {
  seq += 1;
  const { restaurant } = sanitiseApplication({
    restaurantName: 'Paradise Biryani',
    cuisines: ['North Indian'],
    ownerName: 'Ravi Kumar',
    ownerPhone: `98480123${String(seq).padStart(2, '0')}`,
    address: { line1: '12-4-9 Main Road', landmark: 'Danavaipeta', city: 'Rajahmundry' },
    selectedDays: ['Monday'],
    dayTimeSlots: { Monday: [{ open: '09:00', close: '22:00' }] },
    fssaiNumber: '12345678901234',
    fssaiExpiry: '2030-01-01',
    contract: { accepted: true, signature: 'Ravi Kumar' },
    ...over,
  });

  return FoodRestaurant.create({
    ...restaurant,
    restaurantId: `FP-CRED${String(seq).padStart(4, '0')}`,
    /* What `submitApplication` now always writes — a hash, whether or not a
       password was typed. The test for that is in
       `foodPartnerApplication.test.js`; this file starts from it. */
    passwordHash: await startingHash(),
  });
};

const approve = async (restaurantId, decision = 'approved') => {
  const res = fakeRes();
  await decideRestaurant(
    { params: { restaurantId }, body: { decision }, admin: { email: 'staff@lampose.in' } },
    res,
    never,
  );
  return res;
};

let gateway = null;

test.beforeEach(() => {
  Object.entries(SMS_ENV).forEach(([key, value]) => { process.env[key] = value; });
  process.env.TWILIO_RESTAURANT_APPROVED_CONTENT_SID = CONTENT_SID;
  gateway = fakeGateway();
});

test.afterEach(() => {
  twilio._useClientForTests(null);
  process.env.TWILIO_RESTAURANT_APPROVED_CONTENT_SID = '';
  Object.keys(SMS_ENV).forEach((key) => { delete process.env[key]; });
  if (gateway) gateway.restore();
  gateway = null;
});



test.describe('approving a restaurant sends its owner their sign-in details', () => {
  test('the SMS carries the ID and the password; the reply, the document and WhatsApp do not', async () => {
    const fake = fakeClient();
    twilio._useClientForTests(fake.client);

    const restaurant = await saveRestaurant();
    const res = await approve(restaurant.restaurantId);

    assert.equal(res.body.success, true);
    assert.equal(gateway.sent.length, 1, 'one SMS, to the owner');
    assert.equal(fake.created.length, 1, 'one WhatsApp, to the same number');

    /* `ownerPhone` is stored already normalised to +91… by the sanitiser; the
       gateway wants it without the plus. */
    const [smsUrl] = gateway.sent;
    assert.equal(smsUrl.searchParams.get('mobile'), restaurant.ownerPhone.replace('+', ''));
    assert.equal(smsUrl.searchParams.get('templateid'), SMS_ENV.SMS_PARTNER_PASSWORD_TEMPLATE_ID);

    const message = gateway.lastMessage();
    const password = passwordFrom(message);
    assert.ok(password, 'the SMS states a password');

    /* The two slots, in order — not the same value twice. */
    /* Their own number, as the ten digits they would type — `login` matches a
       phone on its last ten, so this signs in exactly as +91… would. */
    assert.equal(idFrom(message), restaurant.ownerPhone.slice(-10), 'the ID is their own number');
    assert.match(idFrom(message), /^\d{10}$/, 'plain digits, for a DLT Numeric variable');
    assert.notEqual(idFrom(message), password, 'and it is not the password');

    /* It works — the whole point. */
    const saved = await FoodRestaurant.findOne({ restaurantId: restaurant.restaurantId }).select('+passwordHash');
    assert.equal(await saved.verifyPassword(password), true);

    /* And it is nowhere else. The WhatsApp goes as the APPROVED TEMPLATE, so
       what is asserted is the four values filled into it — the body itself is
       Meta's copy, and `restaurantApprovedTemplate.js` is where it is checked. */
    const [notice] = fake.created;
    assert.equal(notice.to, `whatsapp:${restaurant.ownerPhone}`);
    assert.equal(notice.contentSid, CONTENT_SID, 'sent as the template, not as free text');

    const filled = JSON.parse(notice.contentVariables);
    assert.deepEqual(Object.keys(filled).sort(), ['1', '2', '3', '4']);
    assert.equal(filled['1'], restaurant.ownerName);
    assert.equal(filled['2'], restaurant.restaurantName);
    assert.equal(filled['3'], '12-4-9 Main Road, Danavaipeta, Rajahmundry', 'the address a rider would be given');
    assert.match(filled['4'], /^https?:\/\//, 'and the console to manage it at');
    assert.equal(
      JSON.stringify(filled).includes(password), false,
      'no credential in any slot — two templates were refused over this',
    );
    assert.equal(JSON.stringify(res.body).includes(password), false, 'not in the reply');
    assert.equal(JSON.stringify(saved.toObject()).includes(password), false, 'not on the document');

    assert.equal(res.body.data.credentials.sent, true);
    assert.equal(res.body.data.credentials.notice.sent, true);
  });

  test('the template body says nothing a classifier reads as a login', async () => {
    /* Seven refusals, and the last three were the sentence rather than the
       fact: "your sign-in details have been sent" was refused as
       INCORRECT_CATEGORY three times, and "please check your text messages for
       what you need to get started" was approved in two minutes. This asserts
       the vocabulary stays on the approved side of that line — and that the
       body keeps the four slots the sender fills, since a fifth would be sent
       empty and Twilio refuses the whole message for it (63028). */
    const { BODY, variableKeys, CATEGORY } = approvedTemplate;

    assert.deepEqual(variableKeys(), ['1', '2', '3', '4']);
    assert.equal(CATEGORY, 'MARKETING');
    assert.ok(/text messages/i.test(BODY), 'it points at the SMS');
    assert.equal(
      /sign[ -]?in|log ?in|password|credential|OTP|verification code/i.test(BODY), false,
      'and names no credential',
    );
    /* Meta refuses a body that begins or ends with a variable (subCode
       2388299) — v8 was, for a trailing "{{4}}." that a full stop did not
       rescue. */
    assert.equal(/^\{\{/.test(BODY.trim()), false);
    assert.equal(/\{\{\d+\}\}[.\s]*$/.test(BODY.trim()), false, 'no variable at the end');
  });

  test('a second approval does not mint a second password', async () => {
    const fake = fakeClient();
    twilio._useClientForTests(fake.client);

    const restaurant = await saveRestaurant();
    await approve(restaurant.restaurantId);
    const first = passwordFrom(gateway.lastMessage());

    /* A note corrected, a button clicked twice — the owner is holding the
       details from the first one. */
    await approve(restaurant.restaurantId);

    assert.equal(gateway.sent.length, 1, 'no second SMS');
    assert.equal(fake.created.length, 1, 'no second WhatsApp');

    const saved = await FoodRestaurant.findOne({ restaurantId: restaurant.restaurantId }).select('+passwordHash');
    assert.equal(await saved.verifyPassword(first), true, 'the first password still works');
  });

  test('going back to the queue and approving again DOES issue new details', async () => {
    const fake = fakeClient();
    twilio._useClientForTests(fake.client);

    const restaurant = await saveRestaurant();
    await approve(restaurant.restaurantId);
    await approve(restaurant.restaurantId, 'pending');
    await approve(restaurant.restaurantId);

    assert.equal(gateway.sent.length, 2);
    const second = passwordFrom(gateway.lastMessage());
    const saved = await FoodRestaurant.findOne({ restaurantId: restaurant.restaurantId }).select('+passwordHash');
    assert.equal(await saved.verifyPassword(second), true);
  });

  test('a WhatsApp that fails leaves the details sent, and says which half went', async () => {
    const fake = fakeClient({ createError: new Error('63016 template not approved') });
    twilio._useClientForTests(fake.client);

    const restaurant = await saveRestaurant();
    const res = await approve(restaurant.restaurantId);

    assert.equal(res.body.data.credentials.sent, true, 'the SMS went');
    assert.equal(res.body.data.credentials.notice.sent, false);
    assert.match(res.body.message, /WhatsApp notice did not go/);

    /* And it is the half that matters: the owner can still sign in. */
    const password = passwordFrom(gateway.lastMessage());
    const saved = await FoodRestaurant.findOne({ restaurantId: restaurant.restaurantId }).select('+passwordHash');
    assert.equal(await saved.verifyPassword(password), true);
  });

  test('no address on file: the notice is withheld, the sign-in details still go', async () => {
    const fake = fakeClient();
    twilio._useClientForTests(fake.client);

    /* A template variable may not be empty — Twilio refuses the whole send
       (63028) — so a blank address is reported rather than attempted. */
    const restaurant = await saveRestaurant({ address: {} });
    const res = await approve(restaurant.restaurantId);

    assert.equal(fake.created.length, 0, 'nothing was handed to Twilio');
    assert.equal(res.body.data.credentials.sent, true, 'the SMS still went');
    assert.equal(res.body.data.credentials.notice.sent, false);
    assert.match(res.body.data.credentials.notice.error, /address/i);
  });

  test('rejecting sends nothing at all', async () => {
    const fake = fakeClient();
    twilio._useClientForTests(fake.client);

    const restaurant = await saveRestaurant();
    const res = fakeRes();
    await decideRestaurant(
      { params: { restaurantId: restaurant.restaurantId }, body: { decision: 'rejected', note: 'The FSSAI licence has expired.' }, admin: {} },
      res,
      never,
    );

    assert.equal(res.body.success, true);
    assert.equal(fake.created.length, 0);
    assert.equal(gateway.sent.length, 0, 'and no SMS either');
  });
});

test.describe('when the text message does not go', () => {
  /** Approve with a gateway that refuses, and hand back the reply. */
  const approvedWithoutSms = async () => {
    gateway.restore();
    gateway = fakeGateway({ refuse: true });

    const fake = fakeClient();
    twilio._useClientForTests(fake.client);

    const restaurant = await saveRestaurant();
    const res = await approve(restaurant.restaurantId);
    return { restaurant, res };
  };

  test('the approval stands, and the reply says the owner is stuck', async () => {
    const { res } = await approvedWithoutSms();

    assert.equal(res.body.success, true);
    assert.equal(res.body.data.verificationStatus, 'approved', 'the decision stands');
    assert.equal(res.body.data.credentials.sent, false);
    assert.match(res.body.message, /cannot sign in yet/);
  });

  test('a one-time LINK is handed to the approver — never a password', async () => {
    const { restaurant, res } = await approvedWithoutSms();

    const { setupUrl } = res.body.data.credentials;
    assert.ok(setupUrl, 'the link comes back when the SMS did not');

    /* It is a real, live link. */
    const token = setupUrl.split('/').pop();
    const saved = await FoodRestaurant.findOne({ restaurantId: restaurant.restaurantId });
    assert.equal(saved.passwordSetup.tokenHash, hashSetupToken(token));

    /* And what came back is the link, not the credential the SMS would have
       carried — nothing on a staff screen is a password. */
    const spent = fakeRes();
    await completePasswordSetup({ body: { token, newPassword: 'my-own-one' } }, spent, never);
    assert.equal(spent.body.success, true);

    const after = await FoodRestaurant.findOne({ restaurantId: restaurant.restaurantId }).select('+passwordHash');
    assert.equal(await after.verifyPassword('my-own-one'), true);
  });

  test('and no link is handed over when the SMS DID go', async () => {
    const fake = fakeClient();
    twilio._useClientForTests(fake.client);

    const restaurant = await saveRestaurant();
    const res = await approve(restaurant.restaurantId);

    assert.equal(res.body.data.credentials.sent, true);
    assert.equal('setupUrl' in res.body.data.credentials, false);

    const saved = await FoodRestaurant.findOne({ restaurantId: restaurant.restaurantId });
    assert.equal(saved.passwordSetup, undefined, 'and none was minted');
  });
});

test.describe('the recovery link', () => {
  /** Approve with no SMS, and hand back the token the approver was given. */
  const handedOff = async () => {
    gateway.restore();
    gateway = fakeGateway({ refuse: true });

    const fake = fakeClient();
    twilio._useClientForTests(fake.client);

    const restaurant = await saveRestaurant();
    const res = await approve(restaurant.restaurantId);
    return { restaurant, token: String(res.body.data.credentials.setupUrl).split('/').pop() };
  };

  const check = async (token) => {
    const res = fakeRes();
    await checkPasswordSetup({ params: { token } }, res, never);
    return res;
  };

  const complete = async (token, newPassword) => {
    const res = fakeRes();
    await completePasswordSetup({ body: { token, newPassword } }, res, never);
    return res;
  };

  test('says whose it is before a password is typed', async () => {
    const { restaurant, token } = await handedOff();
    const res = await check(token);

    assert.equal(res.body.success, true);
    assert.equal(res.body.data.restaurantName, restaurant.restaurantName);
    assert.equal(res.body.data.userId, restaurant.ownerPhone);
  });

  test('works ONCE — a second click is refused in words', async () => {
    const { token } = await handedOff();
    await complete(token, 'my-own-one');

    const again = await complete(token, 'a-different-one');
    assert.equal(again.statusCode, 410);
    assert.equal(again.body.code, 'LINK_NOT_USABLE');
    assert.match(again.body.message, /already been used/);

    /* And the page that draws the form says the same thing. */
    const drawn = await check(token);
    assert.equal(drawn.statusCode, 410);
    assert.match(drawn.body.message, /already been used/);
  });

  test('is refused once it has expired', async () => {
    const { restaurant, token } = await handedOff();

    await FoodRestaurant.updateOne(
      { restaurantId: restaurant.restaurantId },
      { $set: { 'passwordSetup.expiresAt': new Date(Date.now() - 1000) } },
    );

    const res = await complete(token, 'my-own-one');
    assert.equal(res.statusCode, 410);
    assert.match(res.body.message, /expired/);

    const saved = await FoodRestaurant.findOne({ restaurantId: restaurant.restaurantId }).select('+passwordHash');
    assert.equal(await saved.verifyPassword('my-own-one'), false, 'nothing was changed');
  });

  test('a token nobody was sent is refused, and so is an empty one', async () => {
    await handedOff();

    for (const bogus of ['', 'short', 'f'.repeat(64)]) {
      const res = await complete(bogus, 'my-own-one');
      assert.equal(res.statusCode, 410, `refused: "${bogus.slice(0, 8)}"`);
    }
  });

  test('refuses a password that is too short, before spending the link', async () => {
    const { token } = await handedOff();

    const short = await complete(token, 'abc');
    assert.equal(short.body.code, 'WEAK_PASSWORD');

    /* The link survives a password the form should have caught — an owner who
       typed four characters has not used up their one chance. */
    const res = await complete(token, 'long-enough');
    assert.equal(res.body.success, true);
  });
});

test.describe('resending the sign-in details', () => {
  test('replaces the password, and the old one stops working', async () => {
    const fake = fakeClient();
    twilio._useClientForTests(fake.client);

    const restaurant = await saveRestaurant();
    await approve(restaurant.restaurantId);
    const first = passwordFrom(gateway.lastMessage());

    const res = fakeRes();
    await resendCredentials(
      { params: { restaurantId: restaurant.restaurantId }, admin: { email: 'staff@lampose.in' } },
      res,
      never,
    );

    assert.equal(res.body.success, true);
    assert.equal(gateway.sent.length, 2);

    const second = passwordFrom(gateway.lastMessage());
    assert.notEqual(second, first);

    const saved = await FoodRestaurant.findOne({ restaurantId: restaurant.restaurantId }).select('+passwordHash');
    assert.equal(await saved.verifyPassword(second), true, 'the new one works');
    assert.equal(await saved.verifyPassword(first), false, 'and the old one does not');
  });

  test('is refused for a restaurant nobody has approved', async () => {
    const fake = fakeClient();
    twilio._useClientForTests(fake.client);

    const restaurant = await saveRestaurant();
    const res = fakeRes();
    await resendCredentials({ params: { restaurantId: restaurant.restaurantId }, admin: {} }, res, never);

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, 'NOT_APPROVED');
    assert.equal(fake.created.length, 0);
    assert.equal(gateway.sent.length, 0);
  });
});

test.describe('the owner changing their own password', () => {
  const change = async (restaurant, body) => {
    const res = fakeRes();
    await changePassword({ restaurantAdmin: restaurant, body }, res, never);
    return res;
  };

  test('needs the current one, even with a session in hand', async () => {
    const restaurant = await saveRestaurant();
    const res = await change(restaurant, { currentPassword: 'not-the-one', newPassword: 'counter-tablet' });

    assert.equal(res.statusCode, 401);
    assert.equal(res.body.code, 'INVALID_CREDENTIALS');

    const saved = await FoodRestaurant.findOne({ restaurantId: restaurant.restaurantId }).select('+passwordHash');
    assert.equal(await saved.verifyPassword('onboarding-generated'), true, 'unchanged');
  });

  test('replaces it when the current one is right', async () => {
    const restaurant = await saveRestaurant();
    const res = await change(restaurant, { currentPassword: 'onboarding-generated', newPassword: 'my-own-one' });

    assert.equal(res.body.success, true);

    const saved = await FoodRestaurant.findOne({ restaurantId: restaurant.restaurantId }).select('+passwordHash');
    assert.equal(await saved.verifyPassword('my-own-one'), true);
    assert.equal(await saved.verifyPassword('onboarding-generated'), false);
  });

  test('refuses one that is too short, and one that is the same as before', async () => {
    const restaurant = await saveRestaurant();

    const short = await change(restaurant, { currentPassword: 'onboarding-generated', newPassword: 'abc' });
    assert.equal(short.body.code, 'WEAK_PASSWORD');

    const same = await change(restaurant, {
      currentPassword: 'onboarding-generated', newPassword: 'onboarding-generated',
    });
    assert.equal(same.body.code, 'SAME_PASSWORD');
  });
});
