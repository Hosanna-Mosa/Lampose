/* ══════════════════════════════════════════════════════════════════════════
   Support: three apps, one queue, one console.

     Diner        /v2/support/tickets
     Rider        /v2/drivers/support/tickets
     Kitchen      /v2/food-partners/support/tickets
     Console      /v1/admin/support/tickets           the queue
                  …/:reference/messages               answer somebody
                  PATCH …/:reference                  status, outcome, priority
                  …/:reference/assign                 claim or hand over

   The assertions that matter are the ones that would otherwise fail SILENTLY,
   because every one of them looks fine from the app that caused it:

     · a rider cannot read a diner's thread by guessing its reference — the
       reference is six characters and gets read down a phone line, so it was
       never a secret and must not be an authorisation
     · each audience's category list is enforced per audience, not globally: a
       rider filing under `deposit` is refused even though `deposit` is a valid
       category for somebody
     · only the diner may file a SAFETY REPORT; the other two get a sentence,
       not a 404 and not a silent success into the wrong queue
     · a ticket written BEFORE support had three audiences — `customerId` and
       no `requester` — is still listed, still readable and still repliable.
       This is the one that would take the longest to notice and hurt the most
       people: every existing deposit dispute in production is in that shape
     · a Viewer can read the queue and cannot answer it
     · replying is what moves a status, and only from `open`; a resolved
       thread that gets a note stays resolved
     · a closed thread refuses a reply rather than swallowing it

   Cleans up after itself: every ticket, account and administrator it makes is
   removed, including the deliberately legacy-shaped row.

   Run with: npm run verify:support
   ══════════════════════════════════════════════════════════════════════════ */
const jwt = require('jsonwebtoken');

require('../src/config/env');
const { connectDB, closeConnections, isLamposeUp } = require('../src/infrastructure/database/db');
const createApp = require('../app');

/* Refuse to run against production. See src/infrastructure/database/guard.js */
require('../src/infrastructure/database/guard').assertDevTargetOrExit();


const results = [];
const check = (name, ok, extra = '') => results.push([!!ok, name, extra]);

(async () => {
  await connectDB().catch(() => {});
  await new Promise((r) => setTimeout(r, 1500));

  if (!isLamposeUp()) { console.log('\nMongoDB is not reachable.\n'); process.exit(2); }
  if (!process.env.JWT_SECRET) { console.log('\nJWT_SECRET is not set.\n'); process.exit(2); }

  const app = createApp({});
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;

  const call = async (method, path, body, token) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Client': 'support-verify',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json = null;
    try { json = await res.json(); } catch { /* empty body is fine */ }
    return { status: res.status, json };
  };

  const Ticket = require('../src/modules/support/ticket.model');
  const Admin = require('../src/modules/admins/admin.model');
  const Customer = require('../src/modules/customers/customer.model');
  const Driver = require('../src/modules/drivers/driver.model');
  const FoodRestaurant = require('../src/modules/foodpartners/foodRestaurant.model');

  const { signCustomerToken } = require('../src/modules/customers/customerAuth.middleware');
  const { signDriverToken } = require('../src/modules/drivers/driverAuth.middleware');
  const { signFoodPartnerToken } = require('../src/modules/foodpartners/foodPartnerAuth.middleware');

  const stamp = String(Date.now()).slice(-6);
  const made = { tickets: [], admins: [] };
  let diner = null; let rider = null; let kitchen = null;

  try {
    /* ── Fixtures: one of each audience, plus two administrators ─────── */
    diner = await Customer.create({
      customerId: `SUP-C${stamp}`, phone: `+9197${stamp}`, name: 'Support Diner',
    });
    const dinerToken = signCustomerToken(diner);

    rider = await Driver.create({
      driverId: `SUP-D${stamp}`, phone: `+9196${stamp}`, name: 'Support Rider',
      status: 'pending', vehicle: { type: 'bike', plate: `TS09SUP${stamp.slice(-2)}` },
    });
    const riderToken = signDriverToken(rider);

    kitchen = await FoodRestaurant.create({
      restaurantId: `SUP-R${stamp}`,
      restaurantName: `Support Kitchen ${stamp}`,
      ownerName: 'Support Owner',
      ownerPhone: `+9195${stamp}`,
      ownerEmail: `support-${stamp}@lampose.test`,
      passwordHash: 'not-a-real-hash',
      fssaiLicenseNumber: `1234567890${stamp}`,
    });
    const kitchenToken = signFoodPartnerToken(kitchen);

    const agent = await Admin.create({
      name: 'Asha Support', email: `sup-a-${stamp}@lampose.test`,
      password: `Supp!${stamp}aA`, role: 'Support', status: 'Active',
    });
    made.admins.push(agent._id);
    /* The real shape: { id, typ: 'admin', ver } — a hand-rolled { id } token
       is now refused as LEGACY_TOKEN. See admins/adminToken.js. */
    const { signAdminToken } = require('../src/modules/admins/adminToken');
    const agentToken = signAdminToken(agent, { expiresIn: '1h' });

    const viewer = await Admin.create({
      name: 'Support Viewer', email: `sup-v-${stamp}@lampose.test`,
      password: `Supp!${stamp}aA`, role: 'Viewer', status: 'Active',
    });
    made.admins.push(viewer._id);
    const viewerToken = signAdminToken(viewer, { expiresIn: '1h' });

    const remember = (res) => {
      const ref = res.json?.data?.reference;
      if (ref) made.tickets.push(ref);
      return ref;
    };

    /* ── 1. Each audience can file, on its own path ──────────────────── */
    const dinerTicket = await call('POST', '/api/v2/support/tickets', {
      category: 'deposit',
      body: 'My owner is refusing to return the deposit after I moved out on the 4th.',
    }, dinerToken);
    check('a diner can open a ticket', dinerTicket.status === 201, dinerTicket.json?.message);
    const dinerRef = remember(dinerTicket);

    const riderTicket = await call('POST', '/api/v2/drivers/support/tickets', {
      category: 'payout',
      body: 'My payout for last week has not arrived.',
      orderNumber: 'ORD-42',
    }, riderToken);
    check('a rider can open a ticket', riderTicket.status === 201, riderTicket.json?.message);
    const riderRef = remember(riderTicket);

    const kitchenTicket = await call('POST', '/api/v2/food-partners/support/tickets', {
      category: 'settlement',
      body: 'Our settlement is short by 600 rupees this week.',
    }, kitchenToken);
    check('a kitchen can open a ticket', kitchenTicket.status === 201, kitchenTicket.json?.message);
    const kitchenRef = remember(kitchenTicket);

    check(
      'the requester is recorded from the SESSION, not the body',
      riderTicket.json?.data?.reference?.startsWith('TKT-'),
      riderTicket.json?.data?.reference,
    );

    /* ── 2. Categories are enforced PER AUDIENCE ─────────────────────── */
    const riderDeposit = await call('POST', '/api/v2/drivers/support/tickets', {
      category: 'deposit', body: 'Trying a category that belongs to the stay side.',
    }, riderToken);
    check('a rider cannot file under a diner-only category', riderDeposit.status === 400, riderDeposit.json?.code);

    const dinerPayout = await call('POST', '/api/v2/support/tickets', {
      category: 'payout', body: 'Trying a category that belongs to riders.',
    }, dinerToken);
    check('a diner cannot file under a rider-only category', dinerPayout.status === 400, dinerPayout.json?.code);

    const cats = await call('GET', '/api/v2/drivers/support/categories', undefined, riderToken);
    check(
      'each app is served its OWN category list',
      cats.status === 200 && cats.json?.data?.audience === 'driver'
        && cats.json.data.categories.includes('payout')
        && !cats.json.data.categories.includes('deposit'),
      (cats.json?.data?.categories || []).join(','),
    );
    check('and is told whether it may file a safety report', cats.json?.data?.reports === false);

    /* ── 3. Safety reports are the diner's alone ─────────────────────── */
    const dinerReport = await call('POST', '/api/v2/support/reports', {
      reason: 'deposit-threat',
      body: 'The owner said on 12 March that he will keep the whole deposit unless I pay another month of rent, and repeated it on the phone.',
    }, dinerToken);
    check('a diner can file a safety report', dinerReport.status === 201, dinerReport.json?.message);
    const reportRef = remember(dinerReport);

    const riderReport = await call('POST', '/api/v2/drivers/support/reports', {
      reason: 'safety',
      body: 'A long enough body to clear the fifty character floor that reports are held to here.',
    }, riderToken);
    check(
      'a rider is REFUSED a safety report, with a sentence',
      riderReport.status === 403 && riderReport.json?.code === 'REPORTS_NOT_AVAILABLE',
      riderReport.json?.code,
    );

    /* ── 4. The reference is not an authorisation ────────────────────── */
    const stolen = await call('GET', `/api/v2/drivers/support/tickets/${dinerRef}`, undefined, riderToken);
    check(
      "a rider cannot read a diner's thread by its reference",
      stolen.status === 404,
      `${stolen.status}`,
    );

    const stolenBack = await call('GET', `/api/v2/support/tickets/${riderRef}`, undefined, dinerToken);
    check("a diner cannot read a rider's thread either", stolenBack.status === 404);

    const crossReply = await call('POST', `/api/v2/support/tickets/${riderRef}/messages`, {
      body: 'Writing into somebody else’s thread.',
    }, dinerToken);
    check('nor write into one', crossReply.status === 404);

    /* ── 5. Each list holds only its own ─────────────────────────────── */
    const riderList = await call('GET', '/api/v2/drivers/support/tickets', undefined, riderToken);
    const riderRefs = (riderList.json?.data || []).map((t) => t.reference);
    check(
      "a rider's list holds only the rider's threads",
      riderList.status === 200 && riderRefs.includes(riderRef) && !riderRefs.includes(dinerRef),
      `${riderRefs.length} rows`,
    );

    /* ── 6. A wrong-audience token is refused by the guard, not the handler */
    const wrongDoor = await call('GET', '/api/v2/drivers/support/tickets', undefined, dinerToken);
    check(
      "a diner's token is refused at the rider's support door",
      wrongDoor.status === 401 || wrongDoor.status === 403,
      `${wrongDoor.status}`,
    );

    /* ── 7. The console sees all three ───────────────────────────────── */
    const queue = await call('GET', '/api/v1/admin/support/tickets?limit=100', undefined, agentToken);
    const queueRefs = (queue.json?.data || []).map((t) => t.reference);
    check(
      'the console queue holds all three audiences',
      queue.status === 200
        && queueRefs.includes(dinerRef) && queueRefs.includes(riderRef)
        && queueRefs.includes(kitchenRef),
      `${queue.json?.total} total`,
    );

    const row = (queue.json?.data || []).find((t) => t.reference === riderRef);
    check(
      'and every row names who filed it, and how to reach them',
      row?.requester?.kind === 'driver' && row.requester.name === 'Support Rider'
        && !!row.requester.phone,
      `${row?.requester?.kind} / ${row?.requester?.name}`,
    );
    check('the order number rides along for the queue to open beside it',
      row?.orderNumber === 'ORD-42', row?.orderNumber);

    const filtered = await call('GET', '/api/v1/admin/support/tickets?audience=restaurant&limit=100', undefined, agentToken);
    const filteredKinds = new Set((filtered.json?.data || []).map((t) => t.requester?.kind));
    check(
      'the queue filters by audience',
      filtered.status === 200 && filteredKinds.size === 1 && filteredKinds.has('restaurant'),
      [...filteredKinds].join(','),
    );

    const searched = await call('GET', `/api/v1/admin/support/tickets?q=${riderRef}`, undefined, agentToken);
    check(
      'and searches by reference',
      (searched.json?.data || []).some((t) => t.reference === riderRef),
    );

    const reportRow = await call('GET', `/api/v1/admin/support/tickets/${reportRef}`, undefined, agentToken);
    check(
      'a safety report arrives at HIGH priority without anybody noticing it first',
      reportRow.status === 200 && reportRow.json?.data?.priority === 'high'
        && reportRow.json.data.kind === 'report',
      `${reportRow.json?.data?.kind} / ${reportRow.json?.data?.priority}`,
    );

    const stats = await call('GET', '/api/v1/admin/support/stats', undefined, agentToken);
    check(
      'the queue reports its own shape',
      stats.status === 200 && typeof stats.json?.data?.audiences?.driver === 'number'
        && typeof stats.json.data.openReports === 'number',
      `reports open: ${stats.json?.data?.openReports}`,
    );

    /* ── 8. Only a support role may answer ───────────────────────────── */
    const viewerRead = await call('GET', '/api/v1/admin/support/tickets', undefined, viewerToken);
    check('a Viewer may READ the queue', viewerRead.status === 200);

    const viewerReply = await call('POST', `/api/v1/admin/support/tickets/${riderRef}/messages`, {
      body: 'A Viewer trying to answer.',
    }, viewerToken);
    check('a Viewer may NOT answer it', viewerReply.status === 403, viewerReply.json?.code);

    const noToken = await call('GET', '/api/v1/admin/support/tickets');
    check('and the queue is not readable with no token at all', noToken.status === 401);

    /* ── 9. A reply, and what it moves ───────────────────────────────── */
    const answered = await call('POST', `/api/v1/admin/support/tickets/${riderRef}/messages`, {
      body: 'Checked with payouts — it went out this morning, reference 88213.',
    }, agentToken);
    check('support can answer', answered.status === 201, answered.json?.message);
    check(
      'the reply is signed with a REAL name from the session',
      answered.json?.data?.messages?.slice(-1)[0]?.authorName === 'Asha Support',
      answered.json?.data?.messages?.slice(-1)[0]?.authorName,
    );
    check(
      'answering an open ticket puts the ball back with the requester',
      answered.json?.data?.status === 'awaiting_customer',
      answered.json?.data?.status,
    );
    check(
      'and claims an unassigned ticket for whoever answered',
      answered.json?.data?.assignedToName === 'Asha Support',
      answered.json?.data?.assignedToName,
    );

    const riderSees = await call('GET', `/api/v2/drivers/support/tickets/${riderRef}`, undefined, riderToken);
    check(
      'the rider sees the answer, and it is marked unread',
      riderSees.status === 200 && riderSees.json?.data?.unread === true
        && riderSees.json.data.messages.length === 2,
      `${riderSees.json?.data?.messages?.length} messages`,
    );

    await call('POST', `/api/v2/drivers/support/tickets/${riderRef}/read`, {}, riderToken);
    const afterRead = await call('GET', `/api/v2/drivers/support/tickets/${riderRef}`, undefined, riderToken);
    check('and stops being unread once opened', afterRead.json?.data?.unread === false);

    const riderReplies = await call('POST', `/api/v2/drivers/support/tickets/${riderRef}/messages`, {
      body: 'Still not showing in my account.',
    }, riderToken);
    check(
      'a reply from the requester reopens it',
      riderReplies.status === 201 && riderReplies.json?.data?.status === 'open',
      riderReplies.json?.data?.status,
    );

    /* ── 10. Status, outcome, and the system line ────────────────────── */
    const resolved = await call('PATCH', `/api/v1/admin/support/tickets/${riderRef}`, {
      status: 'resolved', outcome: 'Paid — arrived 12 Sep',
    }, agentToken);
    check('support can resolve with an outcome in its own words',
      resolved.status === 200 && resolved.json?.data?.status === 'resolved',
      resolved.json?.data?.outcome);

    const lastMessage = resolved.json?.data?.messages?.slice(-1)[0];
    check(
      'resolving writes a SYSTEM line, not a support message',
      lastMessage?.author === 'system' && lastMessage.body.includes('Paid'),
      `${lastMessage?.author}: ${lastMessage?.body}`,
    );

    const noteOnResolved = await call('POST', `/api/v1/admin/support/tickets/${riderRef}/messages`, {
      body: 'One more note for the record.',
    }, agentToken);
    check(
      'a note on a resolved thread does NOT reopen it',
      noteOnResolved.json?.data?.status === 'resolved',
      noteOnResolved.json?.data?.status,
    );

    const badStatus = await call('PATCH', `/api/v1/admin/support/tickets/${riderRef}`, {
      status: 'DEFINITELY_NOT_A_STATUS',
    }, agentToken);
    check('an unknown status is refused', badStatus.status === 400, badStatus.json?.code);

    /* ── 11. A closed thread refuses a reply rather than swallowing it ─ */
    await call('PATCH', `/api/v1/admin/support/tickets/${kitchenRef}`, { status: 'closed' }, agentToken);
    const intoClosed = await call('POST', `/api/v2/food-partners/support/tickets/${kitchenRef}/messages`, {
      body: 'Trying to write into a closed thread.',
    }, kitchenToken);
    check(
      'a closed thread refuses a reply, and says so',
      intoClosed.status === 409 && intoClosed.json?.code === 'TICKET_CLOSED',
      intoClosed.json?.code,
    );

    /* ── 12. Assignment ─────────────────────────────────────────────── */
    const unassigned = await call('POST', `/api/v1/admin/support/tickets/${riderRef}/assign`, {
      adminId: null,
    }, agentToken);
    check('a ticket can be put back in the pile',
      unassigned.json?.data?.assignedToId === null, `${unassigned.json?.data?.assignedToId}`);

    const claimed = await call('POST', `/api/v1/admin/support/tickets/${riderRef}/assign`, {}, agentToken);
    check('and claimed again with no body at all',
      claimed.json?.data?.assignedToName === 'Asha Support', claimed.json?.data?.assignedToName);

    const mine = await call('GET', '/api/v1/admin/support/tickets?assigned=me&limit=100', undefined, agentToken);
    check(
      'the queue can show just my own',
      (mine.json?.data || []).every((t) => t.assignedToName === 'Asha Support'),
      `${mine.json?.data?.length} rows`,
    );

    /* ── 13. THE LEGACY ROW ──────────────────────────────────────────── *
     * A ticket in the shape every existing production row has: a
     * `customerId`, no `requester` at all. Written straight through the
     * driver so no hook can quietly fix it on the way in — the point is to
     * prove the READ path copes, not that the write path is tidy.
     */
    const legacyRef = `TKT-LEG${stamp.slice(-3)}`;
    await Ticket.collection.insertOne({
      reference: legacyRef,
      kind: 'ticket',
      customerId: diner.customerId,
      customerName: 'Support Diner',
      customerPhone: diner.phone,
      category: 'payment',
      subject: 'An older ticket from before requesters existed',
      status: 'open',
      messages: [{
        author: 'customer',
        body: 'This row predates the requester field entirely.',
        at: new Date(),
      }],
      lastActivityAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    made.tickets.push(legacyRef);

    const legacyList = await call('GET', '/api/v2/support/tickets', undefined, dinerToken);
    check(
      'a pre-requester ticket is still in its owner’s list',
      (legacyList.json?.data || []).some((t) => t.reference === legacyRef),
      `${legacyList.json?.data?.length} rows`,
    );

    const legacyRead = await call('GET', `/api/v2/support/tickets/${legacyRef}`, undefined, dinerToken);
    check('and still readable', legacyRead.status === 200, legacyRead.json?.message);

    const legacyReply = await call('POST', `/api/v1/admin/support/tickets/${legacyRef}/messages`, {
      body: 'Answering a thread that has no requester field.',
    }, agentToken);
    check(
      'and still ANSWERABLE — the save does not fail its own validators',
      legacyReply.status === 201,
      legacyReply.json?.message,
    );
    check(
      'answering it back-fills the requester rather than leaving it blank',
      legacyReply.json?.data?.requester?.kind === 'customer'
        && legacyReply.json.data.requester.id === diner.customerId,
      `${legacyReply.json?.data?.requester?.kind}/${legacyReply.json?.data?.requester?.id}`,
    );

    const legacyStolen = await call('GET', `/api/v2/drivers/support/tickets/${legacyRef}`, undefined, riderToken);
    check('and is still not readable by anybody else', legacyStolen.status === 404);
  } catch (error) {
    check('the run completed', false, error.message);
  } finally {
    try {
      if (made.tickets.length) await Ticket.deleteMany({ reference: { $in: made.tickets } });
      if (diner) await Customer.deleteOne({ _id: diner._id });
      if (rider) await Driver.deleteOne({ _id: rider._id });
      if (kitchen) await FoodRestaurant.deleteOne({ _id: kitchen._id });
      if (made.admins.length) await Admin.deleteMany({ _id: { $in: made.admins } });
    } catch (error) {
      console.error('cleanup failed:', error.message);
    }
    server.close();
    await closeConnections().catch(() => {});
  }

  const line = '='.repeat(78);
  console.log(`\n${line}\n  SUPPORT — three apps, one queue\n${line}`);
  let failed = 0;
  for (const [ok, name, extra] of results) {
    if (!ok) failed += 1;
    console.log(`  ${ok ? '✅' : '❌'} ${name}${extra ? `  · ${extra}` : ''}`);
  }
  console.log(`${line}\n  ${results.length - failed}/${results.length} passed\n${line}\n`);

  process.exit(failed ? 1 : 0);
})();
