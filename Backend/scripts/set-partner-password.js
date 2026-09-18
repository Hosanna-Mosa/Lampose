/* ══════════════════════════════════════════════════════════════════════════
   Give a Stay Partner owner an email-and-password sign-in.

     npm run partner:password -- --email you@example.com --password 'secret'
     npm run partner:password -- --email you@example.com --password 'secret' \
                                 --phone +919876543210 --name 'Anjali Rao'
     npm run partner:password -- --email you@example.com --password 'secret'                                  --phone +919876543210 --verified
     npm run partner:password -- --email you@example.com --clear
     npm run partner:password -- --email you@example.com --dry

   ## Why a script and not a route

   There is no public "register an owner with a password" endpoint and there
   should not be one: typing an email address proves nothing, so a route that
   created accounts on first sight would let anybody mint owners. Provisioning
   is therefore a deliberate act somebody performs against a database they
   already have access to — which is what this file is.

   ## What it does

   Finds the partner by email, or by phone if `--phone` is given, and sets
   `passwordHash`. If no account matches AND `--phone` is supplied, it creates
   one, because an owner who has never opened the app has no row yet and a
   reviewer's test account is exactly that case.

   ## `--verified` and why it is a flag rather than a default

   `requirePartner` refuses any session whose account has no `phoneVerifiedAt`,
   because a partner's properties are derived from their phone NUMBER — a
   session on an unproved number would hand somebody a stranger's listings. A
   password cannot establish that fact, so `/auth/login` will not either, and
   an account provisioned without it signs in to a 403 that says so.

   `--verified` sets it, and the person running this script is what makes that
   honest: it is a deliberate assertion, by somebody with database access, that
   this number belongs to this account. It is not inferred from anything.

   Nothing is read from a hard-coded constant: no credential lives in this
   file, the same rule the rest of the process follows.
   ══════════════════════════════════════════════════════════════════════════ */

const crypto = require('crypto');
const { connectDB, closeConnections } = require('../src/infrastructure/database/db');
const Partner = require('../src/modules/partners/partner.model');
const { toE164, isIndianMobile } = require('../src/infrastructure/twilio/twilio');

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
};
const has = (name) => argv.includes(`--${name}`);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/* Short enough to type on a handset, long enough not to be guessed in the ten
   tries per fifteen minutes the route allows. */
const MIN_PASSWORD = 8;

const fail = (message) => {
  console.error(`\n  ✗ ${message}\n`);
  process.exitCode = 1;
};

async function main() {
  const email = String(flag('email') || '').trim().toLowerCase();
  const password = flag('password');
  const phone = flag('phone');
  const name = flag('name');
  const dry = has('dry');

  if (!EMAIL_RE.test(email)) return fail('Pass a valid --email.');

  /*
   * --clear: take the password OFF an account.
   *
   * The counterpart to setting one, and it exists for the case that made it
   * necessary: a password that has been hard-coded into a shipped build must
   * not also open the real account. Clearing the hash makes `verifyPassword`
   * fail closed again, so the account reverts to phone-and-OTP only and the
   * string in the bundle opens nothing.
   */
  if (has('clear')) {
    await connectDB();
    const target = await Partner.findOne({ email }).select('+passwordHash');
    if (!target) return fail(`No partner has the email ${email}.`);
    const had = Boolean(target.passwordHash);
    target.passwordHash = '';
    await target.save();

    const after = await Partner.findOne({ email }).select('+passwordHash');
    const gone = !after.passwordHash;
    console.log('');
    console.log(`  partner          : ${target.partnerId}`);
    console.log(`  had a password   : ${had ? 'yes' : 'no'}`);
    console.log(`  ✓ password ${gone ? 'REMOVED' : 'STILL PRESENT — investigate'}.`);
    console.log(`  ✓ sign-in falls back to phone and OTP for ${email}
`);
    if (!gone) process.exitCode = 1;
    return;
  }
  if (!dry && !password) return fail('Pass --password, or --dry to look without writing.');
  if (password && password.length < MIN_PASSWORD) {
    return fail(`--password must be at least ${MIN_PASSWORD} characters.`);
  }

  await connectDB();

  let partner = await Partner.findOne({ email }).select('+passwordHash');

  if (!partner && phone) {
    const e164 = toE164(phone);
    if (!e164 || !isIndianMobile(e164)) return fail(`--phone ${phone} is not a valid Indian mobile.`);

    const existingByPhone = await Partner.findOne({ phone: e164 }).select('+passwordHash');
    if (existingByPhone) {
      /* The number already belongs to somebody. Attach the email to THAT
         account rather than creating a second one — two rows for one owner is
         how a person ends up unable to see their own properties. */
      partner = existingByPhone;
      partner.email = email;
      console.log(`  · ${e164} already exists — attaching ${email} to it.`);
    } else {
      /* Same shape `startAuth` mints, so an account created here is
         indistinguishable from one created by a first sign-in. */
      partner = new Partner({
        partnerId: `prt_${crypto.randomBytes(9).toString('hex')}`,
        phone: e164,
        email,
      });
      console.log(`  · creating a new partner for ${e164}.`);
    }
  }

  if (!partner) {
    return fail(
      `No partner has the email ${email}. Pass --phone to create one, `
      + 'or sign in on the app once with the number first.',
    );
  }

  if (has('verified') && !partner.phoneVerifiedAt) {
    /* The assertion, made explicitly and only when asked for. */
    partner.phoneVerifiedAt = new Date();
  }

  if (name && !partner.name) {
    partner.name = String(name).slice(0, 80);
    partner.profileCompletedAt = partner.profileCompletedAt || new Date();
  }

  console.log('');
  console.log(`  partner          : ${partner.partnerId || '(new, id on save)'}`);
  console.log(`  phone            : ${partner.phone}`);
  console.log(`  email            : ${partner.email}`);
  console.log(`  name             : ${partner.name || '(none — app shows profile setup)'}`);
  console.log(`  status           : ${partner.status}`);
  console.log(`  phone verified   : ${partner.phoneVerifiedAt ? 'yes' : 'NO — sign-in will 403; pass --verified'}`);
  console.log(`  had a password   : ${partner.passwordHash ? 'yes (being replaced)' : 'no'}`);

  if (dry) {
    console.log('\n  --dry: nothing written.\n');
    return;
  }

  partner.passwordHash = await Partner.hashPassword(password);
  await partner.save();

  /* Proves the stored hash actually verifies, rather than trusting that the
     save did what it was asked. A password that is written but does not match
     fails at the login screen, which is the worst place to find out. */
  const check = await Partner.findOne({ email }).select('+passwordHash');
  const ok = await check.verifyPassword(password);

  console.log('');
  console.log(`  ✓ password set, and it ${ok ? 'VERIFIES' : 'DOES NOT VERIFY — investigate'}.`);
  console.log(`  ✓ sign in at POST /api/v2/partners/auth/login with ${email}\n`);
  if (!ok) process.exitCode = 1;
}

main()
  .catch((error) => fail(error.message))
  .finally(() => closeConnections().catch(() => {}));
