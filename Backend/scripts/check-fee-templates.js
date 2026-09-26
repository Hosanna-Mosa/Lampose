/* ══════════════════════════════════════════════════════════════════════════
   Are the visit-fee WhatsApp templates approved yet?

   The two templates that carry the fee as a variable were submitted to Meta
   on 26 Sep 2026. Until they are approved, fee messages go out in the
   approved generic notice (see `feeMessage` in infrastructure/twilio). Once
   approved, set the two lines this prints in Backend/.env — on every server —
   and restart; the code prefers them automatically.

   Read-only: it asks Twilio for the approval status and changes nothing.

     node scripts/check-fee-templates.js
   ══════════════════════════════════════════════════════════════════════════ */
require('dotenv').config();

const TEMPLATES = [
  { env: 'TWILIO_ASSISTED_PAY_AMOUNT_CONTENT_SID', sid: 'HXe839d2fbb857dcb819e599e972e07fab', name: 'pay for your visit (+ amount)' },
  { env: 'TWILIO_PAYMENT_RECEIVED_AMOUNT_CONTENT_SID', sid: 'HX79734d3f9a5aa9aa58f7f3900e722160', name: 'payment received (+ amount)' },
];

(async () => {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    console.error('TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN are not set in Backend/.env.');
    process.exit(1);
  }
  const twilio = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

  const ready = [];
  for (const t of TEMPLATES) {
    try {
      const approval = await twilio.content.v1.contents(t.sid).approvalFetch().fetch();
      const { status, rejection_reason: reason } = approval.whatsapp || {};
      console.log(`${t.name.padEnd(32)} ${status}${reason ? ` — ${reason}` : ''}`);
      if (status === 'approved') ready.push(`${t.env}="${t.sid}"`);
    } catch (error) {
      console.log(`${t.name.padEnd(32)} could not be read: ${error.message}`);
    }
  }

  if (ready.length === TEMPLATES.length) {
    console.log('\nAll approved. Add these to Backend/.env (and the live server\'s), then restart:\n');
    ready.forEach((line) => console.log(line));
  } else {
    console.log('\nNot all approved yet — leave .env as it is. Fee messages keep using the generic notice meanwhile.');
  }
})();
