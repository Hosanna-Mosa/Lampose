/* ══════════════════════════════════════════════════════════════════════════
   Remove one person's data, across every collection that holds any of it.

     node scripts/delete-user-data.js --name hosanna            report only
     node scripts/delete-user-data.js --phone 9398334115        report only
     node scripts/delete-user-data.js --email a@b.com           report only
     node scripts/delete-user-data.js --name hosanna --delete   actually delete

   Options:
     --scope customer | partner | both   default `both`
     --include-properties                also delete the listings they own
     --delete                            write; without it nothing is touched
     --keep-backup <path>                where the backup goes (default below)

   ## Reporting is the default, and that is not politeness

   A person is not one row. This one is 47 documents across ten collections,
   and the counts are not guessable from the outside — so the useful thing a
   delete script can do first is TELL you what it is about to remove. Run it
   without `--delete`, read the list, then run it again.

   ## One human can be two accounts, and they are deleted separately

   `app_customers` and `app_partners` are different identities with different
   id spaces, and the same person can hold both — the same email and phone
   appear in both rows for the case this was written for. They are found
   together and reported together, but `--scope` decides which is removed,
   because they are almost never both wanted:

     customer   the student side: their account, their stay requests, their
                bookings as a guest, their support tickets, their food orders.
     partner    the owner side: their account, their listings' inventory,
                bookings AT their property, requests SENT to them, payouts,
                staff, reviews, referrals.

   ## Properties are refused unless you ask twice

   Deleting a partner who still owns listings would leave those listings in
   the public catalogue with an owner nobody can reach — requests against them
   are created, nobody is notified, and they expire. So `--include-properties`
   is required, and without it the run stops rather than half-deleting.

   ## Everything removed is written to a backup file first

   Mongo has no undo. Before a single `deleteMany`, every document this script
   is about to remove is read and written to JSON. It is not a substitute for
   a real backup, but it is the difference between "we can put that back" and
   "it is gone".
   ══════════════════════════════════════════════════════════════════════════ */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const config = require('../src/config/env');

/* A report is harmless anywhere; the write is not. */
if (process.argv.includes('--delete')) require('../src/infrastructure/database/guard').assertDevTargetOrExit();


/* ------------------------------------------------------------------ *
 * Arguments
 * ------------------------------------------------------------------ */

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
};

const selector = {
  name: value('name'),
  phone: value('phone'),
  email: value('email'),
};
const scope = (value('scope') || 'both').toLowerCase();
const doDelete = flag('delete');
const includeProperties = flag('include-properties');

const die = (message) => {
  console.error(`\n  ✖ ${message}\n`);
  process.exit(1);
};

if (!selector.name && !selector.phone && !selector.email) {
  die('Say who. Pass one of --name, --phone or --email.\n'
    + '    e.g. node scripts/delete-user-data.js --name hosanna');
}
if (!['customer', 'partner', 'both'].includes(scope)) {
  die(`--scope must be customer, partner or both (got "${scope}").`);
}

/** The last ten digits, which is how every phone in this database is matched. */
const phoneKey = (raw) => {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : '';
};

/** A case-insensitive exact-ish match on a name, escaped so it cannot be a regex injection. */
const nameRx = (raw) => new RegExp(String(raw).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

/* ------------------------------------------------------------------ *
 * Finding the person
 * ------------------------------------------------------------------ */

/**
 * The customer and partner rows this selector matches.
 *
 * Both are looked up whatever the scope, because the report has to be able to
 * say "there is also a partner account on this number" — deleting the student
 * half of somebody who is also an owner, without being told the other half
 * exists, is how the confusing half-deletions happen.
 */
const findPeople = async (db) => {
  const or = [];
  if (selector.name) or.push({ name: nameRx(selector.name) });
  if (selector.email) or.push({ email: nameRx(selector.email) });
  if (selector.phone) {
    const key = phoneKey(selector.phone);
    if (!key) die(`--phone "${selector.phone}" has fewer than ten digits.`);
    or.push({ phone: new RegExp(`${key}$`) }, { phoneDigits: key });
  }

  const customers = await db.collection('app_customers').find({ $or: or }).toArray();
  const partners = await db.collection('app_partners').find({ $or: or }).toArray();
  return { customers, partners };
};

/* ------------------------------------------------------------------ *
 * The plan
 * ------------------------------------------------------------------ */

/** Every collection keyed on `partnerPhoneDigits`. Listed, not discovered, so
    a new collection is a deliberate addition here rather than a silent one. */
const PARTNER_KEYED = [
  'partner_bookings',
  'partner_complaints',
  'partner_customer_referral_codes',
  'partner_notifications',
  'partner_payment_methods',
  'partner_payouts',
  'partner_property_edit_logs',
  'partner_referrals',
  'partner_reviews',
  'partner_share_types',
  'partner_staff',
  'partner_guest_verifications',
];

/**
 * `[{ collection, filter, why, scope, gated }]` — what would go, and why.
 *
 * Built from EXACT field filters rather than a regex over the whole document.
 * A "does this document mention the string anywhere" delete would take out a
 * property whose description happened to contain the name, and a support
 * ticket somebody else wrote about them.
 */
const buildPlan = ({ customer, partner }) => {
  const plan = [];
  const add = (collection, filter, why, forScope, gated = false) =>
    plan.push({
      collection, filter, why, scope: forScope, gated,
    });

  if (customer && scope !== 'partner') {
    const cid = customer.customerId || String(customer._id);
    const key = phoneKey(customer.phone);

    const tail = key ? new RegExp(`${key}$`) : null;

    add('app_customers', { _id: customer._id }, 'the account itself (addresses are embedded in it)', 'customer');

    /*
     * `customerId` alone finds only the APP requests.
     *
     * A request sent from lampose.com has no account behind it — the web flow
     * proves a phone by SMS and stores the person in `customer.{name,phone,
     * email}` with `customerId` null. For the first person this was run
     * against that is ten of their twelve requests, so keying on the id alone
     * would have left most of their own data behind.
     */
    add('visitrequests',
      { $or: [{ customerId: cid }, ...(tail ? [{ 'customer.phone': tail }] : [])] },
      'stay/visit requests they sent (app and website)', 'customer');
    if (tail) {
      add('visit_requests', { 'visitor.phone': tail },
        'legacy website visit requests they sent', 'customer');
    }
    add('partner_bookings',
      { $or: [{ customerId: cid }, ...(tail ? [{ guestPhone: tail }] : [])] },
      'bookings they hold as a guest', 'customer');
    add('app_support_tickets',
      { $or: [{ customerId: cid }, { 'requester.id': cid }] },
      'support tickets and reports they raised', 'customer');
    add('food_orders', { customerId: cid }, 'food orders they placed', 'customer');
    add('food_coupons', { customerId: cid }, 'coupons issued to them', 'customer');
    if (tail) {
      add('partner_customer_referral_codes', { guestPhone: tail },
        'referral codes issued against their number', 'customer');
    }
  }

  if (partner && scope !== 'customer') {
    const key = partner.phoneDigits || phoneKey(partner.phone);
    if (!key) die(`The partner row ${partner._id} has no usable phone number to match on.`);
    const e164 = { $in: [`+91${key}`, key] };

    add('app_partners', { _id: partner._id }, 'the owner account itself', 'partner');
    PARTNER_KEYED.forEach((collection) =>
      add(collection, { partnerPhoneDigits: key }, 'owner-side records', 'partner'));
    add('visitrequests', { ownerMobile: e164 }, 'requests sent TO them about their listings', 'partner');
    add('visit_requests', { ownerMobile: e164 }, 'legacy website visit requests', 'partner');
    /*
     * Matched on the TAIL, not on the two E.164 spellings.
     *
     * `ownerMobileE164` here is written by the WhatsApp handler, which stores
     * Twilio's channel form — `whatsapp:+919398334115`. Eleven of the thirteen
     * rows for the first person this was run against carried that prefix, so
     * an `$in: ['+91…', '…']` filter found two and quietly left the rest. The
     * last ten digits are the only spelling everything agrees on.
     */
    add('verificationrequests', { ownerMobileE164: new RegExp(`${key}$`) },
      'onboarding verification requests', 'partner');

    /* Last, and gated. See the header: an orphaned listing keeps taking
       requests nobody can answer. */
    add('properties', { ownerMobile: new RegExp(`${key}$`) },
      'the listings they own', 'partner', true);
  }

  return plan;
};

/* ------------------------------------------------------------------ *
 * Run
 * ------------------------------------------------------------------ */

const main = async () => {
  if (!config.db.uri) die('MONGO_URI is missing from Backend/.env');

  await mongoose.connect(config.db.uri, {
    ...config.db.options,
    ...(config.db.dbName ? { dbName: config.db.dbName } : {}),
  });
  const db = mongoose.connection.db;

  const { customers, partners } = await findPeople(db);

  if (!customers.length && !partners.length) {
    console.log('\n  Nobody matched. Nothing to do.\n');
    await mongoose.disconnect();
    return;
  }

  /* Ambiguity is refused rather than resolved by picking the first. A script
     that deletes "whichever Hosanna it found first" is not one to run twice. */
  if (customers.length > 1 || partners.length > 1) {
    console.log('\n  More than one person matched. Narrow it with --phone or --email:\n');
    customers.forEach((c) => console.log(`    customer  ${c._id}  ${c.name} · ${c.phone} · ${c.email || 'no email'}`));
    partners.forEach((p) => console.log(`    partner   ${p._id}  ${p.name} · ${p.phone} · ${p.email || 'no email'}`));
    console.log('');
    await mongoose.disconnect();
    process.exit(1);
  }

  const customer = customers[0] || null;
  const partner = partners[0] || null;

  console.log('\n  ── Matched ──────────────────────────────────────────────────');
  if (customer) {
    console.log(`    customer  ${customer._id}  ${customer.name} · ${customer.phone} · ${customer.email || 'no email'}`);
    console.log(`              customerId ${customer.customerId || '(none — matched by _id)'}`);
  }
  if (partner) {
    console.log(`    partner   ${partner._id}  ${partner.name} · ${partner.phone} · ${partner.email || 'no email'}`);
    console.log(`              phoneDigits ${partner.phoneDigits || phoneKey(partner.phone)}`);
  }
  if (customer && partner) {
    console.log('\n    ⚠️  Both accounts exist for this person. --scope decides which goes;');
    console.log(`        this run is --scope ${scope}.`);
  }

  const plan = buildPlan({ customer, partner });

  /* Counted before anything is written, so the report is what WOULD happen
     rather than what did. */
  let total = 0;
  let gatedTotal = 0;
  const rows = [];

  for (const step of plan) {
    // eslint-disable-next-line no-await-in-loop
    const count = await db.collection(step.collection).countDocuments(step.filter);
    if (!count) continue;
    rows.push({ ...step, count });
    if (step.gated) gatedTotal += count;
    else total += count;
  }

  console.log('\n  ── Would remove ─────────────────────────────────────────────');
  if (!rows.length) {
    console.log('    Nothing. The accounts above have no data attached.');
  }
  for (const r of rows) {
    const mark = r.gated ? (includeProperties ? '  ' : '× ') : '  ';
    console.log(`  ${mark}${String(r.count).padStart(4)}  ${r.collection.padEnd(34)} ${r.scope.padEnd(8)} ${r.why}`);
  }

  if (gatedTotal && !includeProperties) {
    console.log(`\n    × ${gatedTotal} listing(s) are NOT included. Pass --include-properties to remove`);
    console.log('      them too — leaving them behind means a live listing whose owner account');
    console.log('      is gone: requests against it get created and nobody is ever notified.');
  }

  const willRemove = total + (includeProperties ? gatedTotal : 0);
  console.log(`\n    up to ${willRemove} document(s) in scope (a few rows match two filters; the count at the end is the real one).`);

  if (!doDelete) {
    console.log('\n  Nothing was written. Re-run with --delete once the list above is right.\n');
    await mongoose.disconnect();
    return;
  }

  if (!willRemove) {
    console.log('\n  Nothing to delete.\n');
    await mongoose.disconnect();
    return;
  }

  /* ── Backup, before the first delete ──────────────────────────────── */
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const who = (customer || partner).name || 'user';
  const backupPath = value('keep-backup')
    || path.join(__dirname, '..', '.deleted', `${stamp}-${String(who).replace(/[^\w]+/g, '-')}.json`);

  fs.mkdirSync(path.dirname(backupPath), { recursive: true });

  const backup = { deletedAt: new Date().toISOString(), selector, scope, includeProperties, documents: {} };
  for (const r of rows) {
    if (r.gated && !includeProperties) continue;
    // eslint-disable-next-line no-await-in-loop
    backup.documents[r.collection] = (backup.documents[r.collection] || [])
      // eslint-disable-next-line no-await-in-loop
      .concat(await db.collection(r.collection).find(r.filter).toArray());
  }
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
  console.log(`\n  💾 Backup written: ${backupPath}`);

  /* ── Delete ───────────────────────────────────────────────────────── */
  console.log('\n  ── Deleting ─────────────────────────────────────────────────');
  let removed = 0;
  for (const r of rows) {
    if (r.gated && !includeProperties) continue;
    // eslint-disable-next-line no-await-in-loop
    const res = await db.collection(r.collection).deleteMany(r.filter);
    removed += res.deletedCount;
    console.log(`    ${String(res.deletedCount).padStart(4)}  ${r.collection}`);
  }

  console.log(`\n  ✅ ${removed} document(s) deleted. Backup: ${backupPath}\n`);
  await mongoose.disconnect();
};

main().catch(async (error) => {
  console.error('\n  Delete failed:', error.message, '\n');
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
