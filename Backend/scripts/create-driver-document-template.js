/* ══════════════════════════════════════════════════════════════════════════
   Create the rider "document needs a new photo" WhatsApp template in Twilio.

     npm run twilio:driver-document-template                 show what WOULD be created
     npm run twilio:driver-document-template -- --create     create it in Twilio
     npm run twilio:driver-document-template -- --create --submit
                                                        create it AND send it to Meta
     npm run twilio:driver-document-template -- --submit-sid HXxxxx
                                                        send an existing one to Meta
     npm run twilio:driver-document-template -- --status HXxxxx
                                                        has Meta approved it yet?
     npm run twilio:driver-document-template -- --list       what already exists
     npm run twilio:driver-document-template -- --delete HXxxxx    remove one

   This is the message a rider is sent when an administrator refuses one of
   their onboarding documents — which one, and why. The definition — body,
   samples, name, category — is in `infrastructure/twilio/driverDocumentTemplate.js`.
   Derived from `create-restaurant-approved-template.js`; the two differ only in
   which definition they send.

   ## Why a script and not a click in the console

   The template has to match the sender variable for variable, and a template
   typed by hand into a web form drifts from the code sending it. This script
   only sends that definition to Twilio.

   ## Dry by default

   Creating a template is a write to a live Twilio account, and submitting one
   starts a Meta review that a person then has to wait on. Neither happens
   without the flag.

   ## Then, once it is APPROVED

   Put the id in `.env` and restart the backend:

     TWILIO_DRIVER_DOCUMENT_CONTENT_SID=HXxxxx

   Until Meta approves it, a template can only be sent to a number that has
   messaged the Lampose sender in the last 24 hours — which a rider being
   asked for a new photo has almost certainly not done. Until then the backend
   still sends the push and the in-app alert. `--status` says when it is through.
   ══════════════════════════════════════════════════════════════════════════ */
require('dotenv').config();

const {
  FRIENDLY_NAME, LANGUAGE, CATEGORY, BODY, SAMPLES, render,
} = require('../src/infrastructure/twilio/driverDocumentTemplate');

const ENV_KEY = 'TWILIO_DRIVER_DOCUMENT_CONTENT_SID';
const TYPES = { 'twilio/text': { body: BODY } };

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
  console.log('\n  ── The template ─────────────────────────────────────────');
  console.log(`  name      ${FRIENDLY_NAME}`);
  console.log(`  language  ${LANGUAGE}`);
  console.log('  type      twilio/text');
  console.log(`  category  ${CATEGORY}`);
  console.log('\n  ── Body, as Twilio stores it ────────────────────────────');
  BODY.split('\n').forEach((line) => console.log(`  │ ${line}`));
  console.log('\n  ── Rendered, as the rider reads it ───────────────');
  render().split('\n').forEach((line) => console.log(`  │ ${line}`));
  console.log('');
};

/** Ask Meta about a template, and say it in one line. */
const approvalOf = async (sid) => {
  const res = await call('GET', `/v1/Content/${sid}/ApprovalRequests`);
  if (!res.ok) return { ok: false, text: `${res.status} ${res.text}` };
  const whatsapp = (res.json && res.json.whatsapp) || null;
  return { ok: true, status: whatsapp ? whatsapp.status : 'not submitted', reason: whatsapp && whatsapp.rejection_reason, raw: res.json };
};

const submit = async (sid) => call('POST', `/v1/Content/${sid}/ApprovalRequests/whatsapp`, {
  name: FRIENDLY_NAME,
  category: CATEGORY,
});

(async () => {
  if (has('--list')) {
    const res = await call('GET', '/v1/Content?PageSize=50');
    if (!res.ok) {
      console.error(`\n  Could not list templates: ${res.status} ${res.text}\n`);
      process.exit(1);
    }
    const rows = (res.json && res.json.contents) || [];
    console.log(`\n  ${rows.length} template(s) in this account:\n`);
    rows.forEach((c) => {
      const mine = c.friendly_name === FRIENDLY_NAME ? '  ← ours' : '';
      console.log(`  ${c.sid}  ${String(c.friendly_name).padEnd(34)} ${c.language}${mine}`);
    });
    console.log('');
    return;
  }

  const statusSid = valueOf('--status');
  if (statusSid) {
    const found = await approvalOf(statusSid);
    if (!found.ok) {
      console.error(`\n  Could not read the approval status: ${found.text}\n`);
      process.exit(1);
    }
    console.log(`\n  ${statusSid}  →  ${found.status}`);
    if (found.reason) console.log(`  Reason given: ${found.reason}`);
    if (found.status === 'approved') {
      console.log('\n  Approved. Put this in .env and restart the backend:\n');
      console.log(`  ${ENV_KEY}=${statusSid}\n`);
    } else if (found.status === 'pending' || found.status === 'received') {
      console.log('  Still in review. Approval usually takes minutes to a few hours; run this again later.\n');
    } else if (found.status === 'rejected') {
      console.log('  Rejected. Delete it (--delete), fix the wording in driverDocumentTemplate.js, and create it again.\n');
    } else {
      console.log(`  Not submitted to Meta yet. To submit: npm run twilio:driver-document-template -- --submit-sid ${statusSid}\n`);
    }
    return;
  }

  /* Submitting one that already exists — the ordinary case, because
     `--create` deliberately stops short of the Meta review unless asked. */
  const submitSid = valueOf('--submit-sid');
  if (submitSid) {
    const res = await submit(submitSid);
    if (!res.ok) {
      console.error(`\n  Twilio refused the approval request: ${res.status}`);
      console.error(`  ${res.text}\n`);
      process.exit(1);
    }
    console.log(`\n  Submitted ${submitSid} to Meta as ${CATEGORY}.`);
    console.log(`  Status: ${(res.json && res.json.status) || 'received'}`);
    console.log('  Approval usually takes minutes to a few hours.');
    console.log(`  Check it with: npm run twilio:driver-document-template -- --status ${submitSid}\n`);
    return;
  }

  const toDelete = valueOf('--delete');
  if (toDelete) {
    const res = await call('DELETE', `/v1/Content/${toDelete}`);
    console.log(res.ok ? `\n  Deleted ${toDelete}\n` : `\n  Could not delete: ${res.status} ${res.text}\n`);
    process.exit(res.ok ? 0 : 1);
  }

  preview();

  if (!has('--create')) {
    console.log('  Nothing was created. Re-run with --create to make it,');
    console.log('  and --create --submit to also send it to Meta for approval.\n');
    return;
  }

  /* Refuse to make a second copy of a template that already exists — Twilio
     de-duplicates neither friendly names nor bodies, and an account with three
     `lampose_rider_document_resubmit`s is one where nobody knows which id the server
     is actually using. */
  const existing = await call('GET', '/v1/Content?PageSize=50');
  if (!existing.ok) {
    console.error(`\n  Could not check for an existing template: ${existing.status} ${existing.text}\n`);
    process.exit(1);
  }
  const already = ((existing.json && existing.json.contents) || []).find((c) => c.friendly_name === FRIENDLY_NAME);
  if (already) {
    console.log(`  A template named ${FRIENDLY_NAME} already exists: ${already.sid}`);
    console.log('  Delete it first (--delete <sid>) if you meant to replace it.');
    console.log(`  Its approval: npm run twilio:driver-document-template -- --status ${already.sid}\n`);
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

  const { sid } = created.json;
  console.log(`  Created ${sid}\n`);

  if (!has('--submit')) {
    console.log('  NOT submitted to Meta. Until it is approved this template can only be');
    console.log('  sent inside an open 24-hour session.');
    console.log(`  To submit: npm run twilio:driver-document-template -- --submit-sid ${sid}\n`);
    return;
  }

  const submitted = await submit(sid);
  if (!submitted.ok) {
    console.error(`  Created, but the approval request failed: ${submitted.status}`);
    console.error(`  ${submitted.text}`);
    console.error('  The template exists — submit it from the Twilio console.\n');
    process.exit(1);
  }

  console.log(`  Submitted to Meta for approval as ${CATEGORY}. Status: ${(submitted.json && submitted.json.status) || 'received'}`);
  console.log('  Approval usually takes minutes to a few hours.\n');
  console.log(`  Check it:   npm run twilio:driver-document-template -- --status ${sid}`);
  console.log('  When it says "approved", put this in .env and restart the backend:\n');
  console.log(`  ${ENV_KEY}=${sid}\n`);
})().catch((error) => {
  console.error('\n  Failed:', error.message, '\n');
  process.exit(1);
});
