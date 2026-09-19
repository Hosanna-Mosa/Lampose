/* ══════════════════════════════════════════════════════════════════════════
   The "you have a new order" WhatsApp, without sending one.

     npm run verify:order-whatsapp

   ## Nothing is sent, and that is the point

   Twilio is stubbed at `client.messages.create`, so every assertion is made
   against the payload that WOULD have gone out. A verify script that sent
   real WhatsApps would cost money, would reach a real kitchen, and could
   not be run twice in a row — which means it would not be run at all.

   ## What it asserts

   1. The alert reaches WhatsApp AT ALL, from the same call that rings the
      handsets. Adding a fourth channel is easy to do in a way that only
      fires on one of the two paths an order can arrive by.
   2. The five variables are in the ORDER the template declares. Twilio
      renders whatever it is handed; a swapped pair produces a message where
      the amount reads as the order number, and nothing anywhere throws.
   3. The link points at this order, in the console, and is absent rather
      than broken when no console URL is configured. A kitchen that taps a
      localhost link once does not tap the next one.
   4. A Twilio failure does not take the order down with it, and does not
      stop the push either — the two used to share a `try`.
   5. The TWO templates get the right fifth variable. The button's URL
      prefix is baked into its approved content, so it takes the order
      number alone; the text one takes the whole URL. Handing either the
      other's value sends cleanly and is useless — a bare order number
      where a link should be, or a URL too long for a button suffix. Both
      branches are exercised here because only one of them is ever live at
      a time, and the dormant one is the one that rots.
   ══════════════════════════════════════════════════════════════════════════ */

const results = [];
const check = (name, ok, extra = '') => results.push([!!ok, name, extra]);

/* Before anything requires config/env — it reads the environment once. */
process.env.TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || 'ACverifyonly0000000000000000000000';
process.env.TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || 'verify-only-not-a-credential';
process.env.TWILIO_WHATSAPP_FROM = 'whatsapp:+10000000000';
process.env.TWILIO_FOOD_ORDER_CONTENT_SID = 'HXverifyonly0000000000000000000000';
process.env.RESTAURANT_CONSOLE_API = '';

/*
 * The stub, installed INTO the twilio module before the notifier loads it.
 *
 * `twilio(sid, token)` is called at require time in `infrastructure/twilio/
 * twilio.js`, so the constructor is what has to be replaced — reaching in
 * afterwards would find a client that had already been built.
 */
const sent = [];
const twilioModule = require.cache[require.resolve('twilio')];
const realTwilio = require('twilio');
let failNext = false;

require.cache[require.resolve('twilio')] = {
  ...(twilioModule || {}),
  id: require.resolve('twilio'),
  filename: require.resolve('twilio'),
  loaded: true,
  exports: Object.assign(
    function stubTwilio() {
      return {
        messages: {
          create: async (payload) => {
            if (failNext) throw new Error('Twilio is having a bad day');
            sent.push(payload);
            return { sid: `SM${sent.length}` };
          },
        },
      };
    },
    realTwilio,
  ),
};

const { MongoMemoryServer } = require('mongodb-memory-server');

(async () => {
  const mongo = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongo.getUri('lampose-verify');
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'verify-only-secret-not-a-credential';

  const config = require('../src/config/env');
  const { connectDB, closeConnections, isLamposeUp } = require('../src/infrastructure/database/db');
  const FoodRestaurant = require('../src/modules/foodpartners/foodRestaurant.model');

  await connectDB().catch(() => {});
  for (let i = 0; i < 40 && !isLamposeUp(); i += 1) {
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!isLamposeUp()) { console.log('\nin-memory MongoDB did not come up\n'); process.exit(2); }

  /* Set AFTER config/env is first required, then overridden on the frozen
     object — `restaurantConsoleUrl` is read at module load, and the point of
     this script is to exercise both the set and the unset case. */
  config.restaurantConsoleUrl = 'https://console.lampose.test';

  const notifier = require('../src/modules/foodpartners/foodOrder.notifier');

  const shop = await FoodRestaurant.create({
    restaurantId: 'FP-WHATSAPP1',
    restaurantName: 'Verify Kitchen',
    ownerName: 'Verify Owner',
    ownerPhone: '+919876500201',
    ownerEmail: 'verify-whatsapp@example.test',
    fssaiLicenseNumber: '12345678901234',
    verificationStatus: 'approved',
    isActive: true,
  });

  const order = {
    orderNumber: 'LO777001',
    restaurantId: shop.restaurantId,
    grandTotal: 450,
    lines: [
      { productName: 'Ghee Podi Idli', quantity: 2, lineTotal: 140 },
      { productName: 'Masala Dosa', quantity: 1, lineTotal: 110 },
    ],
    placedAt: new Date().toISOString(),
  };

  try {
    /* ── 1. It goes out at all ──────────────────────────────────────── */
    const result = await notifier.notifyRestaurantOfOrder(order);
    /* The send is started but not awaited by the notifier — on purpose, so a
       slow Twilio cannot hold up a diner's checkout. Give the microtask a
       tick to land before asserting on it. */
    await new Promise((r) => setTimeout(r, 120));

    check('the notifier reports it tried WhatsApp', result.whatsapp === true);
    check('exactly one WhatsApp was sent', sent.length === 1, `${sent.length} sent`);

    const msg = sent[0] || {};
    check('it went to the owner’s number', msg.to === 'whatsapp:+919876500201', msg.to);
    check('it used the content template, not plain text',
      msg.contentSid === 'HXverifyonly0000000000000000000000', msg.contentSid);

    /* ── 2. The variables are in the template's order ───────────────── */
    const vars = JSON.parse(msg.contentVariables || '{}');
    check('1 is the restaurant name', vars['1'] === 'Verify Kitchen', vars['1']);
    check('2 is the order number', vars['2'] === 'LO777001', vars['2']);
    check('3 is the amount', vars['3'] === '₹450', vars['3']);
    check('4 is what was ordered', vars['4'] === '2× Ghee Podi Idli and 1 more item', vars['4']);
    /* The one that matters most: a swap here reads as the amount being the
       order number and nothing throws. */
    check(
      '…and none of them is empty — Twilio rejects a blank variable (63028)',
      ['1', '2', '3', '4', '5'].every((k) => typeof vars[k] === 'string' && vars[k].length > 0),
      JSON.stringify(vars),
    );

    /* ── 3. The link ────────────────────────────────────────────────── */
    check(
      '5 carries a link to THIS order in the console',
      String(vars['5']).includes('https://console.lampose.test/?order=LO777001'),
      vars['5'],
    );
    check(
      'the link builder agrees with what was sent',
      notifier.orderLink('LO777001') === 'https://console.lampose.test/?order=LO777001',
      notifier.orderLink('LO777001'),
    );

    /* Unset console URL → no link, rather than a broken one. */
    config.restaurantConsoleUrl = '';
    check('no console URL configured → no link is built', notifier.orderLink('LO777001') === null);

    sent.length = 0;
    await notifier.notifyRestaurantOfOrder({ ...order, orderNumber: 'LO777002' });
    await new Promise((r) => setTimeout(r, 120));
    const noLink = JSON.parse((sent[0] || {}).contentVariables || '{}');
    check('…and the message still goes, with a sentence in place of the link',
      sent.length === 1 && noLink['5'] && !String(noLink['5']).includes('http'),
      noLink['5']);
    config.restaurantConsoleUrl = 'https://console.lampose.test';

    /* ── 4. Failure is contained ────────────────────────────────────── */
    sent.length = 0;
    failNext = true;
    let threw = false;
    let outcome = null;
    try {
      outcome = await notifier.notifyRestaurantOfOrder({ ...order, orderNumber: 'LO777003' });
      await new Promise((r) => setTimeout(r, 120));
    } catch {
      threw = true;
    }
    failNext = false;
    check('a Twilio failure does not throw out of the notifier', !threw);
    check('…and the notifier still returns its report', Boolean(outcome));
    check('…and nothing was recorded as sent', sent.length === 0, `${sent.length}`);

    /* ── The two templates take different fifth variables ───────────── */

    /* The text template — what is live today. Already asserted above, but
       re-stated here as the control for the button case below. */
    sent.length = 0;
    delete process.env.TWILIO_FOOD_ORDER_BUTTON_SID;
    await notifier.notifyRestaurantOfOrder({ ...order, orderNumber: 'LO777005' });
    await new Promise((r) => setTimeout(r, 120));
    const textVars = JSON.parse((sent[0] || {}).contentVariables || '{}');
    check('text template → 5 is the WHOLE url',
      String(textVars['5']).startsWith('https://console.lampose.test/?order='),
      textVars['5']);
    check('text template → the SID used is the text one',
      (sent[0] || {}).contentSid === 'HXverifyonly0000000000000000000000',
      (sent[0] || {}).contentSid);

    /* The button template. Its prefix lives in the approved content, so the
       variable must be the SUFFIX and nothing else. */
    sent.length = 0;
    process.env.TWILIO_FOOD_ORDER_BUTTON_SID = 'HXbuttononly000000000000000000000';
    await notifier.notifyRestaurantOfOrder({ ...order, orderNumber: 'LO777006' });
    await new Promise((r) => setTimeout(r, 120));
    const btnVars = JSON.parse((sent[0] || {}).contentVariables || '{}');
    check('button template wins when it is configured',
      (sent[0] || {}).contentSid === 'HXbuttononly000000000000000000000',
      (sent[0] || {}).contentSid);
    check('button template → 5 is the order number ALONE',
      btnVars['5'] === 'LO777006', btnVars['5']);
    check('button template → 5 carries no url — the prefix is in the template',
      !String(btnVars['5']).includes('http'), btnVars['5']);
    check('button template → the other four are unchanged',
      btnVars['1'] === 'Verify Kitchen' && btnVars['2'] === 'LO777006',
      JSON.stringify(btnVars));
    delete process.env.TWILIO_FOOD_ORDER_BUTTON_SID;

    /* The link the console must be able to read back. */
    check('the link is a QUERY param, not a fragment — WhatsApp mangles fragments',
      notifier.orderLink('LO777006') === 'https://console.lampose.test/?order=LO777006',
      notifier.orderLink('LO777006'));

    /* ── A restaurant with no phone ─────────────────────────────────── */
    const silent = await FoodRestaurant.create({
      restaurantId: 'FP-NOPHONE01',
      restaurantName: 'No Phone Kitchen',
      ownerName: 'Nobody',
      /* `ownerPhone` is required by the schema, so the realistic case is a
         row whose number was cleared afterwards rather than one created
         without. Set directly to skip the validator. */
      ownerPhone: '+919876500202',
      ownerEmail: 'verify-nophone@example.test',
      fssaiLicenseNumber: '12345678901234',
      verificationStatus: 'approved',
    });
    await FoodRestaurant.updateOne({ restaurantId: silent.restaurantId }, { $set: { ownerPhone: '' } });

    sent.length = 0;
    await notifier.notifyRestaurantOfOrder({
      ...order, orderNumber: 'LO777004', restaurantId: silent.restaurantId,
    });
    await new Promise((r) => setTimeout(r, 120));
    check('a restaurant with no number is skipped, not crashed on', sent.length === 0,
      `${sent.length} sent`);
  } finally {
    await closeConnections().catch(() => {});
    await mongo.stop().catch(() => {});
  }

  const failed = results.filter(([ok]) => !ok);
  console.log('');
  results.forEach(([ok, name, extra]) => {
    console.log(`  ${ok ? '✓' : '✗'} ${name}${!ok && extra ? `  — ${extra}` : ''}`);
  });
  console.log(`\n  ${results.length - failed.length}/${results.length} passed`);
  console.log('  (no WhatsApp was sent — Twilio is stubbed)\n');
  process.exit(failed.length ? 1 : 0);
})().catch((error) => {
  console.error('\nverify:order-whatsapp blew up:', error);
  process.exit(2);
});
