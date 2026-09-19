/* ══════════════════════════════════════════════════════════════════════════
   Create the "you have a new order" WhatsApp template in Twilio.

     npm run twilio:order-template           show what WOULD be created
     npm run twilio:order-template -- --create    create the TEXT one
     npm run twilio:order-template -- --button --create
                                             create the BUTTON one
     npm run twilio:order-template -- --button --create --submit
     npm run twilio:order-template -- --create --submit
                                             create it AND send it to Meta
     npm run twilio:order-template -- --submit-sid HXxxxx
                                             send an existing one to Meta
     npm run twilio:order-template -- --list      what already exists
     npm run twilio:order-template -- --delete HXxxxx   remove one

   ## Why a script and not a click in the console

   Because the template has to match `sendFoodOrderAlert` in
   `infrastructure/twilio/twilio.js` variable for variable, and a template
   typed by hand into a web form is a template that drifts from the code
   sending it. The body below IS the contract: five variables, in order.

   ## Dry by default

   Creating a template is a write to a live Twilio account, and submitting
   one starts a Meta review that a person then has to wait on. Neither
   happens without the flag. `--create` alone leaves the template
   unapproved, which is enough to send inside an open 24-hour session and
   therefore enough to test with.

   ## UTILITY, not MARKETING

   Meta's own definition: a utility message facilitates a specific,
   agreed-upon transaction. "A customer has placed an order with you" is the
   textbook case. Filing it as marketing would cost more per message and
   would let a restaurant's marketing opt-out silence an operational alert
   they need to run their kitchen.
   ══════════════════════════════════════════════════════════════════════════ */
require('dotenv').config();

const LANGUAGE = 'en';

/*
 * Two templates, and the difference is where the link lives.
 *
 *   text    the whole URL sits in the body. WhatsApp auto-links it — but
 *           only when it looks like a domain, which `localhost` does not.
 *   button  a real "Open order" button. A WhatsApp URL button is a FIXED
 *           prefix plus a variable suffix, so the console's host is baked
 *           in here and changing it means a new template and a new review.
 *
 * Both exist so the text one can keep working through the hours the button
 * one spends in review. `sendFoodOrderAlert` prefers the button when
 * `TWILIO_FOOD_ORDER_BUTTON_SID` is set.
 */
const BUTTON = process.argv.includes('--button');
const FRIENDLY_NAME = BUTTON ? 'lampose_food_new_order_btn' : 'lampose_food_new_order';

/*
 * The button's URL prefix — everything before the order number.
 *
 * Read from the environment so the template and the server cannot disagree
 * about where the console is. If you change `RESTAURANT_CONSOLE_URL` you
 * need a NEW template: this string is inside the approved content and Meta
 * has to see it again.
 */
const CONSOLE_URL = String(process.env.RESTAURANT_CONSOLE_URL || '').trim().replace(/\/+$/, '');

/*
 * The body, and the five variables it takes.
 *
 * Kept in step with `sendFoodOrderAlert`. If you change the order or the
 * count here, change it there in the same commit — Twilio renders whatever
 * it is given and a swapped pair produces a message that reads as though
 * the amount were the order number.
 *
 * `{{5}}` is the LINK, passed whole rather than as a suffix to a fixed URL
 * button. The reason is in the sender's header: a WhatsApp URL button must
 * have a fixed prefix, which would bake one deployment's console host into
 * a Meta-approved template.
 */
const BODY = (BUTTON
  ? [
    /* No link line — the button carries it, and a URL in the body beside a
       button that goes to the same place is two ways to do one thing. */
    '🍽️ New order at {{1}}',
    '',
    'Order {{2}} · {{3}}',
    '{{4}}',
    '',
    'Please accept or refuse it so the diner knows where they stand.',
  ]
  : [
    '🍽️ New order at {{1}}',
    '',
    'Order {{2}} · {{3}}',
    '{{4}}',
    '',
    '{{5}}',
    '',
    'Please accept or refuse it so the diner knows where they stand.',
  ]).join('\n');

/* Twilio requires a sample for every variable — Meta reviews the RENDERED
   message, not the placeholders. These are what a reviewer sees. */
const SAMPLES = {
  1: 'Testing-1',
  2: 'LO151171',
  3: '₹450',
  4: '2× Ghee Podi Idli and 1 more item',
  /* The fifth means different things to the two templates: the whole URL to
     the text one, and just the suffix to the button's. Kept in step with
     `sendFoodOrderAlert`, which branches on exactly this. */
  5: BUTTON ? 'LO151171' : `Accept it here: ${CONSOLE_URL || 'https://admin.lampose.com'}/?order=LO151171`,
};

/** What Twilio stores for the button template. */
const TYPES = BUTTON
  ? {
    'twilio/call-to-action': {
      body: BODY,
      actions: [{
        type: 'URL',
        title: 'Open order',
        /* Prefix fixed, order number variable — the only shape WhatsApp
           allows for a dynamic URL button. */
        url: `${CONSOLE_URL}/?order={{5}}`,
      }],
    },
  }
  : { 'twilio/text': { body: BODY } };

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const valueOf = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
};

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

if (!accountSid || !authToken) {
  console.error('\n  TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set in .env\n');
  process.exit(2);
}

const auth = `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`;

/** The Content API lives on content.twilio.com, not api.twilio.com. */
const call = async (method, path, body) => {
  const res = await fetch(`https://content.twilio.com${path}`, {
    method,
    headers: {
      Authorization: auth,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }
  return { status: res.status, ok: res.ok, json, text };
};

const preview = () => {
  let rendered = BODY;
  Object.entries(SAMPLES).forEach(([k, v]) => {
    rendered = rendered.split(`{{${k}}}`).join(v);
  });
  console.log('\n  ── The template ─────────────────────────────────────────');
  console.log(`  name      ${FRIENDLY_NAME}`);
  console.log(`  language  ${LANGUAGE}`);
  console.log(`  type      ${BUTTON ? 'twilio/call-to-action' : 'twilio/text'}`);
  console.log('  category  UTILITY');
  console.log('\n  ── Body, as Twilio stores it ────────────────────────────');
  BODY.split('\n').forEach((l) => console.log(`  │ ${l}`));
  console.log('\n  ── Rendered, as a kitchen sees it ───────────────────────');
  rendered.split('\n').forEach((l) => console.log(`  │ ${l}`));
  if (BUTTON) {
    console.log('  │ ────────────────────────────────');
    console.log(`  │      ↗  Open order`);
    console.log(`  │      → ${CONSOLE_URL}/?order=LO151171`);
  }
  console.log('');
};

(async () => {
  if (has('--list')) {
    const res = await call('GET', '/v1/Content?PageSize=50');
    if (!res.ok) {
      console.error(`\n  Could not list templates: ${res.status} ${res.text}\n`);
      process.exit(1);
    }
    const rows = res.json?.contents || [];
    console.log(`\n  ${rows.length} template(s) in this account:\n`);
    rows.forEach((c) => {
      const mine = c.friendly_name === FRIENDLY_NAME ? '  ← ours' : '';
      console.log(`  ${c.sid}  ${String(c.friendly_name).padEnd(34)} ${c.language}${mine}`);
    });
    console.log('');
    return;
  }

  /* Submitting one that already exists — the ordinary case, because
     `--create` deliberately stops short of the Meta review. */
  const submitSid = valueOf('--submit-sid');
  if (submitSid) {
    const res = await call('POST', `/v1/Content/${submitSid}/ApprovalRequests/whatsapp`, {
      name: FRIENDLY_NAME,
      category: 'UTILITY',
    });
    if (!res.ok) {
      console.error(`\n  Twilio refused the approval request: ${res.status}`);
      console.error(`  ${res.text}\n`);
      process.exit(1);
    }
    console.log(`\n  Submitted ${submitSid} to Meta as UTILITY.`);
    console.log(`  Status: ${res.json?.status || 'received'}`);
    console.log('  Approval usually takes minutes to a few hours.\n');
    return;
  }

  const toDelete = valueOf('--delete');
  if (toDelete) {
    const res = await call('DELETE', `/v1/Content/${toDelete}`);
    console.log(res.ok ? `\n  Deleted ${toDelete}\n` : `\n  Could not delete: ${res.status} ${res.text}\n`);
    process.exit(res.ok ? 0 : 1);
  }

  /* A button whose URL prefix is empty would be created, approved, and
     then send people to `/?order=LO151171` with no host in front of it.
     Refused here rather than discovered by a kitchen. */
  if (BUTTON && !CONSOLE_URL) {
    console.error('\n  RESTAURANT_CONSOLE_URL must be set before creating the button template —');
    console.error('  its URL prefix is baked into the approved content.\n');
    process.exit(2);
  }

  preview();

  if (!has('--create')) {
    console.log('  Nothing was created. Re-run with --create to make it,');
    console.log('  and --create --submit to also send it to Meta for approval.\n');
    return;
  }

  /* Refuse to make a second copy of a template that already exists — Twilio
     de-duplicates neither friendly names nor bodies, and an account with
     three `lampose_food_new_order`s is one where nobody knows which SID the
     server is actually using. */
  const existing = await call('GET', '/v1/Content?PageSize=50');
  const already = (existing.json?.contents || []).find((c) => c.friendly_name === FRIENDLY_NAME);
  if (already) {
    console.log(`  A template named ${FRIENDLY_NAME} already exists: ${already.sid}`);
    console.log('  Delete it first (--delete <sid>) if you meant to replace it.\n');
    console.log(`  ${BUTTON ? 'TWILIO_FOOD_ORDER_BUTTON_SID' : 'TWILIO_FOOD_ORDER_CONTENT_SID'}=${already.sid}\n`);
    return;
  }

  const created = await call('POST', '/v1/Content', {
    friendly_name: FRIENDLY_NAME,
    language: LANGUAGE,
    variables: SAMPLES,
    types: TYPES,
  });

  if (!created.ok) {
    console.error(`\n  Twilio refused to create it: ${created.status}`);
    console.error(`  ${created.text}\n`);
    process.exit(1);
  }

  const sid = created.json.sid;
  console.log(`  Created ${sid}`);
  console.log('\n  Put this in your .env:\n');
  console.log(`  ${BUTTON ? 'TWILIO_FOOD_ORDER_BUTTON_SID' : 'TWILIO_FOOD_ORDER_CONTENT_SID'}=${sid}\n`);

  if (!has('--submit')) {
    console.log('  NOT submitted to Meta. Until it is approved this template can only');
    console.log('  be sent inside an open 24-hour session — which is enough to test.');
    console.log(`  To submit: npm run twilio:order-template -- --submit-sid ${sid}\n`);
    return;
  }

  const submitted = await call('POST', `/v1/Content/${sid}/ApprovalRequests/whatsapp`, {
    name: FRIENDLY_NAME,
    category: 'UTILITY',
  });

  if (!submitted.ok) {
    console.error(`\n  Created, but the approval request failed: ${submitted.status}`);
    console.error(`  ${submitted.text}`);
    console.error('  The template exists — submit it from the Twilio console.\n');
    process.exit(1);
  }

  console.log(`  Submitted to Meta for approval as UTILITY. Status: ${submitted.json?.status || 'received'}`);
  console.log('  Approval usually takes minutes to a few hours.\n');
})().catch((error) => {
  console.error('\n  Failed:', error.message, '\n');
  process.exit(1);
});
