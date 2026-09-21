/* ══════════════════════════════════════════════════════════════════════════
   Export a review snapshot: every row a human has to make a call on.

     npm run review:snapshot
     npm run review:snapshot -- --out /tmp/snap.json

   ## Why this exists

   Development and production shared one database for months, so `properties`
   holds real listings the field agents onboarded *and* rows that seed and
   verify scripts left behind. Before the real data can be moved to a clean
   database, somebody has to say which is which — and that somebody is not a
   script. This writes the evidence into one JSON file; the review page reads
   it and records the verdicts.

   ## Read-only by construction

   Nothing here writes. Only `find`, `countDocuments`, `distinct` and
   `listCollections`, all on the raw driver — no mongoose model is required,
   so connecting cannot trigger an `autoIndex` build against production. That
   is the one property worth checking if you ever edit this file.

   ## The verdict is a suggestion, never a decision

   Every row carries `verdict` plus the `reasons` that produced it, so a
   reviewer can disagree with a specific signal rather than with the script.
   Rows are suggested TEST only on positive evidence; anything unrecognised
   stays KEEP, because the cost of wrongly dropping a real listing the client
   onboarded is far higher than the cost of carrying one stale test row over.

   ## Phone numbers are masked

   The snapshot is loaded into a published page. A name, a locality, the
   onboarding agent and a date are ample to judge real from test, so only the
   last four digits of any mobile survive this file.
   ══════════════════════════════════════════════════════════════════════════ */
require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const { MongoClient } = require('mongodb');

const config = require('../src/config/env');

const arg = (name, fallback = null) => {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};

const OUT = path.resolve(arg('out', path.join(__dirname, '../review-snapshot.json')));

/* ── Shared signals ──────────────────────────────────────────────────────
   Each returns a sentence or null. A sentence is evidence; null is silence.
   Kept separate rather than folded into one boolean so the page can show a
   reviewer exactly which signal fired. */

const TEST_WORDS = /\b(test|testing|sample|demo|dummy|verify|seed)\b/i;
const SEED_EMAIL = /@lampose\.(local|invalid)$|^seed@|^sunand-seed@/i;
const RESERVED_TLD = /@[^@]*\.(invalid|test|example|local)$/i;

/* The seed scripts fabricate Bangalore addresses; the client onboards in
   Hyderabad and coastal Andhra. A city alone never condemns a row — it is
   reported beside the others and a reviewer weighs it. */
const SEEDED_CITY = /\b(koramangala|hsr layout|indiranagar|btm layout|electronic city|whitefield|marathahalli)\b/i;

/* `+91 98765 43210` and `+91 99999 xxxxx` are placeholders, not numbers
   anybody answers. `900000xxxx` is the synthetic range seed-food-restaurants
   hands out. */
const PLACEHOLDER_PHONE = /^(9876543210|9999999999|1234567890|900000\d{4})$/;

const digitsOf = (s) => String(s ?? '').replace(/\D/g, '');
const localDigits = (s) => {
  const d = digitsOf(s);
  return d.length === 12 && d.startsWith('91') ? d.slice(2) : d;
};

/** Last four digits only — everything else becomes bullets. */
const maskPhone = (s) => {
  const d = localDigits(s);
  if (!d) return '';
  return d.length <= 4 ? `••${d}` : `•••••• ${d.slice(-4)}`;
};

/** An unusable mobile is a strong signal; a valid one is no signal at all. */
const badMobile = (s) => {
  const d = localDigits(s);
  return !(d.length === 10 && /^[6-9]/.test(d));
};

const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
const str = (v) => (v === undefined || v === null ? '' : String(v));

/** Builds a row the page can render without knowing anything about Mongo. */
const row = (id, cells, reasons, extras = {}) => ({
  id: String(id),
  verdict: reasons.length ? 'test' : 'keep',
  reasons,
  cells,
  ...extras,
});

const main = async () => {
  if (!config.db.uri) {
    console.error('MONGO_URI is missing from Backend/.env');
    process.exit(1);
  }

  const client = await MongoClient.connect(config.db.uri);
  const db = config.db.dbName ? client.db(config.db.dbName) : client.db();

  const all = (name) => db.collection(name).find({}).toArray();
  const countIn = async (name, field, values) => (
    values.length ? db.collection(name).countDocuments({ [field]: { $in: values } }) : 0
  );

  console.log(`\n  reading ${db.databaseName} @ ${new URL(config.db.uri.replace('mongodb+srv', 'https')).host}\n`);

  /* ── Cross-references, read once ───────────────────────────────────────
     A property that went through the v1 WhatsApp approval chain has a
     verificationrequest pointing at it. A property conjured by
     `Property.create()` inside a seed or verify script does not. That single
     fact is the strongest discriminator in the database, so it is loaded
     first and every other signal is reported beside it. */
  const verifiedPropIds = new Set(
    (await db.collection('verificationrequests').distinct('property'))
      .filter(Boolean).map(String),
  );

  const properties = await all('properties');
  const propIds = new Set(properties.map((p) => String(p._id)));

  const shareTypes = await all('partner_share_types');
  const visits = await all('visitrequests');
  const bookings = await all('partner_bookings');
  const editLogs = await all('partner_property_edit_logs');
  const restaurants = await all('food_restaurants');
  const customers = await all('app_customers');
  const partners = await all('app_partners');
  const drivers = await all('app_drivers');
  const admins = await all('admins');
  const scriperUsers = await all('scriper_users');
  const settlements = await all('hotel_settlements');
  const tickets = await all('app_support_tickets');

  /* Counts hanging off each parent, so the page can say what a verdict costs
     before the reviewer commits to it. */
  const tally = (docs, key) => {
    const m = new Map();
    for (const d of docs) {
      const k = String(d[key] ?? '');
      if (k) m.set(k, (m.get(k) || 0) + 1);
    }
    return m;
  };
  const stPerProp = tally(shareTypes, 'propertyId');
  const vrPerProp = tally(visits, 'listingId');
  const elPerProp = tally(editLogs.map((e) => ({ p: String(e.property ?? '') })), 'p');
  const bkPerProp = tally(bookings, 'propertyId');

  const orders = await all('food_orders');
  const products = await all('food_products');
  const ordPerRest = tally(orders, 'restaurantId');
  const prdPerRest = tally(products, 'restaurantId');

  /* ── properties ─────────────────────────────────────────────────────── */
  const propertyRows = properties
    .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
    .map((p) => {
      const id = String(p._id);
      const why = [];
      const onboarded = verifiedPropIds.has(id);

      if (!onboarded) why.push('No verification request — never went through the WhatsApp owner-approval chain');
      if (SEED_EMAIL.test(str(p.employeeEmail))) why.push(`Seed tag in employeeEmail (${p.employeeEmail})`);
      if (!str(p.employeeEmail)) why.push('No onboarding agent recorded');
      if (TEST_WORDS.test(str(p.name))) why.push('Test word in the listing name');
      if (badMobile(p.ownerMobile)) why.push(`Unusable owner mobile "${str(p.ownerMobile) || '(missing)'}"`);
      else if (PLACEHOLDER_PHONE.test(localDigits(p.ownerMobile))) why.push('Placeholder owner mobile');
      if (SEEDED_CITY.test(str(p.place))) why.push('Locality the seed scripts fabricate, not one the agents work');

      /* One signal decides; the rest explain. A row with a verification
         request is real even if its locality looks odd, because the owner
         answered a WhatsApp message a person sent them. */
      const reasons = onboarded ? [] : why;

      return row(id, {
        created: day(p.createdAt),
        onboarded: onboarded ? 'yes' : 'no',
        agent: str(p.employeeEmail),
        name: str(p.name),
        place: str(p.place),
        category: str(p.category),
        owner: str(p.ownerName),
        mobile: maskPhone(p.ownerMobile),
        rent: p.rent ?? null,
        images: (p.images || []).length + (p.imageUrl ? 1 : 0),
        pin: p.location ? 'yes' : 'no',
      }, reasons, {
        refs: {
          partner_share_types: stPerProp.get(id) || 0,
          visitrequests: vrPerProp.get(id) || 0,
          partner_bookings: bkPerProp.get(id) || 0,
          partner_property_edit_logs: elPerProp.get(id) || 0,
        },
      });
    });

  /* ── food_restaurants ───────────────────────────────────────────────── */
  const restaurantRows = restaurants
    .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
    .map((r) => {
      const why = [];
      if (TEST_WORDS.test(str(r.restaurantName))) why.push('Test word in the restaurant name');
      if (TEST_WORDS.test(str(r.ownerName))) why.push('Test word in the owner name');
      if (PLACEHOLDER_PHONE.test(localDigits(r.ownerPhone))) why.push('Synthetic owner phone from the seeded range');
      if (str(r.coverBannerImage?.publicId).includes('_seed-covers')) why.push('Cover image from the seeded Cloudinary folder');
      if (RESERVED_TLD.test(str(r.ownerEmail))) why.push('Reserved-TLD owner email');
      if (badMobile(r.ownerPhone)) why.push(`Unusable owner phone "${str(r.ownerPhone) || '(missing)'}"`);

      return row(r._id, {
        created: day(r.createdAt),
        name: str(r.restaurantName),
        owner: str(r.ownerName),
        phone: maskPhone(r.ownerPhone),
        status: str(r.verificationStatus),
        active: r.isActive ? 'yes' : 'no',
        city: str(r.address?.city),
        pin: r.location ? 'yes' : 'no',
      }, why, {
        refs: {
          food_products: prdPerRest.get(str(r.restaurantId)) || 0,
          food_orders: ordPerRest.get(str(r.restaurantId)) || 0,
        },
      });
    });

  /* ── people ─────────────────────────────────────────────────────────── */
  const personRows = (docs, opts) => docs
    .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
    .map((d) => {
      const why = [];
      const name = str(d[opts.name]);
      const email = str(d[opts.email]);
      const phone = d[opts.phone];
      if (TEST_WORDS.test(name)) why.push('Test word in the name');
      if (RESERVED_TLD.test(email)) why.push(`Reserved-TLD email (${email})`);
      if (SEED_EMAIL.test(email)) why.push('Seed tag in the email');
      if (phone !== undefined && badMobile(phone)) why.push(`Unusable phone "${str(phone) || '(missing)'}"`);
      else if (phone !== undefined && PLACEHOLDER_PHONE.test(localDigits(phone))) why.push('Placeholder phone');

      return row(d._id, {
        created: day(d.createdAt),
        name,
        phone: phone === undefined ? '' : maskPhone(phone),
        email,
        ...Object.fromEntries((opts.extra || []).map((k) => [k, str(d[k])])),
      }, why);
    });

  /* ── the rest, each with the one signal that matters for it ─────────── */
  const bookingRows = bookings.map((b) => {
    const why = [];
    const pid = str(b.propertyId);
    if (pid && !propIds.has(pid)) why.push(`Points at a property that does not exist (${pid})`);
    if (TEST_WORDS.test(str(b.guestName))) why.push('Test word in the guest name');
    if (badMobile(b.guestPhone)) why.push('Unusable guest phone');
    return row(b._id, {
      created: day(b.createdAt),
      property: str(b.propertyName),
      guest: str(b.guestName),
      phone: maskPhone(b.guestPhone),
      status: str(b.status),
      source: str(b.source),
    }, why);
  });

  const settlementRows = settlements.map((s) => {
    const why = [];
    const pid = str(s.propertyId);
    if (pid && !propIds.has(pid)) why.push(`Points at a property that does not exist (${pid})`);
    if (TEST_WORDS.test(str(s.propertyName))) why.push('Test word in the property name');
    if (str(s.paymentId).startsWith('pay_stub_')) why.push('Stubbed payment id — written by verify:hotel-payout');
    return row(s._id, {
      created: day(s.createdAt),
      property: str(s.propertyName),
      guest: str(s.guestName),
      status: str(s.status),
      amount: s.grossAmountPaise ? Math.round(s.grossAmountPaise / 100) : null,
    }, why);
  });

  const ticketRows = tickets.map((t) => row(t._id, {
    created: day(t.createdAt),
    kind: str(t.kind),
    reference: str(t.reference),
    subject: str(t.subject),
    from: str(t.requester?.name || t.customerName),
    status: str(t.status),
  }, TEST_WORDS.test(str(t.subject)) ? ['Test word in the subject'] : []));

  /* ── Assemble ───────────────────────────────────────────────────────── */
  const collections = [
    {
      key: 'properties',
      label: 'Property listings',
      note: 'A listing the agents onboarded has a verification request behind it — the owner '
        + 'replied YES to a WhatsApp message. A listing conjured by a script does not. '
        + 'That is the signal these verdicts lean on.',
      columns: ['created', 'onboarded', 'agent', 'name', 'place', 'category', 'owner', 'mobile', 'rent', 'images', 'pin'],
      rows: propertyRows,
    },
    {
      key: 'food_restaurants',
      label: 'Restaurants',
      note: 'Seeded restaurants carry a cover image from the `_seed-covers` Cloudinary folder '
        + 'and a phone from the synthetic 900000xxxx range.',
      columns: ['created', 'name', 'owner', 'phone', 'status', 'active', 'city', 'pin'],
      rows: restaurantRows,
    },
    {
      key: 'app_drivers',
      label: 'Delivery riders',
      columns: ['created', 'name', 'phone', 'email', 'status'],
      rows: personRows(drivers, { name: 'name', email: 'email', phone: 'phone', extra: ['status'] }),
    },
    {
      key: 'app_customers',
      label: 'Customers',
      columns: ['created', 'name', 'phone', 'email', 'status'],
      rows: personRows(customers, { name: 'name', email: 'email', phone: 'phone', extra: ['status'] }),
    },
    {
      key: 'app_partners',
      label: 'Property owners',
      columns: ['created', 'name', 'phone', 'email', 'businessName', 'status'],
      rows: personRows(partners, { name: 'name', email: 'email', phone: 'phone', extra: ['businessName', 'status'] }),
    },
    {
      key: 'scriper_users',
      label: 'Leads-panel staff',
      columns: ['created', 'name', 'email', 'role'],
      rows: personRows(scriperUsers, { name: 'name', email: 'email', extra: ['role'] }),
    },
    {
      key: 'admins',
      label: 'Admin console accounts',
      columns: ['created', 'name', 'email', 'role', 'status'],
      rows: personRows(admins, { name: 'name', email: 'email', extra: ['role', 'status'] }),
    },
    {
      key: 'partner_bookings',
      label: 'Bookings',
      columns: ['created', 'property', 'guest', 'phone', 'status', 'source'],
      rows: bookingRows,
    },
    {
      key: 'hotel_settlements',
      label: 'Hotel settlements',
      columns: ['created', 'property', 'guest', 'status', 'amount'],
      rows: settlementRows,
    },
    {
      key: 'app_support_tickets',
      label: 'Support tickets',
      columns: ['created', 'kind', 'reference', 'subject', 'from', 'status'],
      rows: ticketRows,
    },
  ];

  /* Collections nobody reviews row by row: they follow whatever their parent
     is judged to be. Counts are carried so the page can show consequences. */
  const derived = [
    { key: 'food_products', parent: 'food_restaurants', link: 'restaurantId', count: products.length },
    { key: 'partner_share_types', parent: 'properties', link: 'propertyId', count: shareTypes.length },
    { key: 'admin_audit_log', parent: null, link: null, count: await db.collection('admin_audit_log').countDocuments() },
    { key: 'partner_notifications', parent: 'app_partners', link: 'partnerPhoneDigits', count: await db.collection('partner_notifications').countDocuments() },
    { key: 'verificationrequests', parent: 'properties', link: 'property', count: await db.collection('verificationrequests').countDocuments() },
    { key: 'food_orders', parent: 'food_restaurants', link: 'restaurantId', count: orders.length },
    { key: 'visitrequests', parent: 'properties', link: 'listingId', count: visits.length },
    { key: 'stay_coupons', parent: 'app_customers', link: 'customerId', count: await db.collection('stay_coupons').countDocuments() },
    { key: 'partner_property_edit_logs', parent: 'properties', link: 'property', count: editLogs.length },
    { key: 'permissionrequests', parent: null, link: null, count: await db.collection('permissionrequests').countDocuments() },
  ];

  const carried = [
    { key: 'scriper_leads', count: await db.collection('scriper_leads').countDocuments(), why: 'The leads business — untouched by the seed and verify scripts.' },
    { key: 'scriper_jobs', count: await db.collection('scriper_jobs').countDocuments(), why: 'Scrape jobs behind the leads above.' },
  ];

  const snapshot = {
    generatedAt: new Date().toISOString(),
    database: db.databaseName,
    totals: {
      reviewRows: collections.reduce((n, c) => n + c.rows.length, 0),
      suggestedTest: collections.reduce((n, c) => n + c.rows.filter((r) => r.verdict === 'test').length, 0),
    },
    collections,
    derived,
    carried,
  };

  fs.writeFileSync(OUT, JSON.stringify(snapshot, null, 2));

  for (const c of collections) {
    const t = c.rows.filter((r) => r.verdict === 'test').length;
    console.log(`  ${c.key.padEnd(24)} ${String(c.rows.length).padStart(4)} rows   ${t ? `${t} suggested TEST` : ''}`);
  }
  console.log(`\n  ${snapshot.totals.reviewRows} rows to review, ${snapshot.totals.suggestedTest} suggested TEST`);
  console.log(`  Wrote ${OUT}\n`);

  await client.close();
};

main().catch(async (error) => {
  console.error('\nSnapshot failed:', error.message, '\n');
  process.exit(1);
});
