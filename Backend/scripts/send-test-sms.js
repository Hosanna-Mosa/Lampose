/* ══════════════════════════════════════════════════════════════════════════
   Send ONE test SMS on a registered DLT template.

     npm run sms:test -- 9398334115              the partner password text
     npm run sms:test -- 9398334115 --otp        the one-time code text

   What it is for: proving a newly REGISTERED template works before the first
   real restaurant is approved. A DLT body has to match the registered one
   character for character — a changed full stop is a refusal, and the refusal
   arrives as prose in a 200 response — so the gap between "registered" and
   "actually sends" is worth closing with one deliberate message rather than
   with a live approval.

   It sends to a real handset, so it takes the number as an argument and has
   no default. Nothing is written to any database and no account is touched:
   the password below is a fixed string that works nowhere.

   Read the rendered message it prints BEFORE the send — that is exactly what
   the handset will show, assembled by the same code the server uses, with the
   values in the order `sendPartnerPasswordSms` supplies them. If the ID and
   the password look swapped, the registered body has its slots the other way
   round and the fix is in the DLT portal, not here.
   ══════════════════════════════════════════════════════════════════════════ */
require('dotenv').config();

const sms = require('../src/infrastructure/sms/sms');

/* Obviously not a credential, and short enough to leave the message inside one
   GSM-7 segment beside a 12-digit ID. */
const TEST_PASSWORD = 'TEST-NOT-REAL';

const args = process.argv.slice(2);
const otp = args.includes('--otp');
const phone = args.find((a) => !a.startsWith('-'));

const kind = otp ? 'otp' : 'partnerPassword';

const main = async () => {
  if (!phone) {
    console.error('\n  A number is required — this sends a real SMS.\n');
    console.error('    npm run sms:test -- 9398334115\n');
    process.exitCode = 1;
    return;
  }

  const problem = sms.smsConfigProblem(kind);
  if (problem) {
    console.error(`\n  Not configured: ${problem}\n`);
    process.exitCode = 1;
    return;
  }

  /* The registered body, with the values put in the way `sendTemplatedSms`
     does it — one per slot, in order. Printed rather than guessed at. */
  const body = process.env[kind === 'otp' ? 'OTP_SMS_TEMPLATE' : 'PARTNER_PASSWORD_SMS_TEMPLATE'];
  const values = otp ? ['123456'] : [phone, TEST_PASSWORD];
  const SLOT = /\{\{\s*(?:otp|code|password)\s*\}\}|\{#\s*var\d*\s*#\}/gi;
  let i = 0;
  const rendered = body.replace(SLOT, () => values[i++] ?? '');

  console.log(`\n  template  ${kind}`);
  console.log(`  header    ${process.env.SMS_SENDERID}`);
  console.log(`  id        ${process.env[kind === 'otp' ? 'SMS_OTP_TEMPLATE_ID' : 'SMS_PARTNER_PASSWORD_TEMPLATE_ID']}`);
  console.log(`  slots     ${(body.match(SLOT) || []).length}, values ${values.length}`);
  console.log(`  to        ${phone}`);
  console.log(`\n  ── what the handset will show ────────────────────────────────\n`);
  console.log(`  ${rendered}\n`);

  const result = otp
    ? await sms.sendOtpSms(phone, '123456')
    : await sms.sendPartnerPasswordSms(phone, phone, TEST_PASSWORD);

  if (!result.success) {
    console.error(`  ✗ ${result.error} (${result.code || 'SMS_SEND_FAILED'})\n`);
    process.exitCode = 1;
    return;
  }

  console.log(`  ✓ accepted by the gateway — campId ${result.campId || '(none returned)'}\n`);

  if (result.campId) {
    const report = await sms.getDeliveryReport(result.campId);
    console.log(`  delivery  ${JSON.stringify(report)}\n`);
  }
};

main().catch((error) => {
  console.error(`\n  ${error.message}\n`);
  process.exitCode = 1;
});
