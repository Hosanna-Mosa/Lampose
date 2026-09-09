/* ══════════════════════════════════════════════════════════════════════════
   HOTEL SETTLEMENT — the RazorpayX payout rail, end to end

   Nineteen scenarios against the real app, the real routes, the real guards
   and the real database. Only the RazorpayX HTTP client is replaced.

   ## Why the client is stubbed and nothing else is

   Every other verify script in here talks to the real dependency. This one
   cannot: `createPayout` moves money out of Lampose's account, and there is no
   test mode in which a green suite is worth an accidental transfer. So the
   four RazorpayX calls are replaced with fakes whose answers this file
   controls — which is also the only way to reach the cases that matter most,
   since a real rail will not fail, reverse, or run out of balance on request.

   Everything above the client is genuine. The routers, `verifyAdminToken`,
   `requireRoles`, the rate limiter, the webhook's signature check, the
   settlement service and its locks, and the Mongo indexes are the shipped
   code, running as it does in production.

   ## What the suite is actually defending

   Four rules the migration must not break:

     · a payout is created only when a person presses Withdraw;
     · `paid_out` is reached only by a `payout.processed` webhook;
     · two presses, two tabs or two redeliveries pay a hotel once;
     · a settlement written under Razorpay Route is still readable.

   Run with: npm run verify:hotel-payout
   ══════════════════════════════════════════════════════════════════════════ */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

/*
 * This suite exercises the AUTOMATIC rail.
 *
 * `PAYOUTS_MANUAL` defaults to true, and while it is on `releaseToOwner`
 * refuses before it reaches RazorpayX — correct for a deployment paying by
 * hand, and the wrong thing to assert here. Set before `config/env` is read,
 * because the flag is resolved once at load.
 *
 * That the dormant rail still passes all 31 checks is the point: it stays
 * proven while it waits for credentials, so switching it on later is a flag
 * change and not a rewrite.
 */
process.env.PAYOUTS_MANUAL = 'false';

require('../src/config/env');

/* ──────────────────────────────────────────────────────────────────────────
   The stub, installed BEFORE anything requires the client.

   `settlement.service` and `payoutOnboarding.controller` capture the module
   object at load time, so the substitution has to happen first — hence the
   cache write up here rather than a helper further down.

   It is a live object closing over `behaviour`, so a scenario can make the
   next call fail without re-requiring anything.
   ────────────────────────────────────────────────────────────────────────── */
const clientPath = require.resolve('../src/infrastructure/razorpay/razorpay');
const realClient = require(clientPath);

/** Every RazorpayX call the run made, in order. The evidence for the asserts. */
const calls = [];
const behaviour = { payoutStatus: 'queued', payoutThrows: null };

require.cache[clientPath].exports = {
  ...realClient,
  /* Configured, whatever this machine's .env says. The suite is testing the
     logic above the rail, not whether the developer has keys. */
  isPayoutConfigured: () => true,

  createContact: async (args) => {
    calls.push({ fn: 'createContact', args });
    return { id: `cont_stub${calls.length}`, type: 'vendor' };
  },

  createFundAccount: async (args) => {
    calls.push({ fn: 'createFundAccount', args });
    return { id: `fa_stub${calls.length}`, account_type: 'bank_account' };
  },

  createPayout: async (args) => {
    calls.push({ fn: 'createPayout', args });
    if (behaviour.payoutThrows) throw behaviour.payoutThrows();
    return {
      id: `pout_stub${calls.length}`,
      status: behaviour.payoutStatus,
      amount: args.amountPaise,
      reference_id: args.referenceId,
    };
  },

  fetchPayout: async (id) => {
    calls.push({ fn: 'fetchPayout', args: { id } });
    return { id, status: behaviour.payoutStatus };
  },
};

const countCalls = (fn) => calls.filter((c) => c.fn === fn).length;
const lastCall = (fn) => [...calls].reverse().find((c) => c.fn === fn);

/* ── Now the app, which picks the stub up ───────────────────────────────── */
const { connectDB, closeConnections, isLamposeUp } = require('../src/infrastructure/database/db');
const createApp = require('../app');

const results = [];
const check = (name, ok, extra = '') => results.push([!!ok, name, extra]);

(async () => {
  await connectDB().catch(() => {});
  await new Promise((r) => setTimeout(r, 1500));

  if (!isLamposeUp()) { console.log('\nMongoDB is not reachable.\n'); process.exit(2); }
  if (!process.env.JWT_SECRET) { console.log('\nJWT_SECRET is not set.\n'); process.exit(2); }

  const webhookSecret = process.env.RAZORPAYX_WEBHOOK_SECRET
    || process.env.RAZORPAY_WEBHOOK_SECRET || '';
  if (!webhookSecret) {
    console.log('\nNo webhook secret is set — the webhook scenarios cannot be signed.\n');
    process.exit(2);
  }

  const app = createApp({});
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;

  const { HotelSettlement } = require('../src/modules/settlements/hotelSettlement.model');
  const { PaymentEvent } = require('../src/modules/settlements/paymentEvent.model');
  const { AdminAuditLog } = require('../src/modules/admins/adminAuditLog.model');
  const { PartnerBooking } = require('../src/modules/partners/partnerDomains.model');
  const Partner = require('../src/modules/partners/partner.model');
  const Property = require('../src/modules/properties/property.model');
  const Admin = require('../src/modules/admins/admin.model');
  const VisitRequest = require('../src/modules/visits/visitRequest.model');
  const settlements = require('../src/modules/settlements/settlement.service');
  const { signPartnerToken } = require('../src/modules/partners/partnerAuth.middleware');

  /* The unique index on `idempotencyKey` was dropped in the migration and one
     on `payoutId` added. A stale index would fail a scenario for the wrong
     reason, so the collection is brought up to the model first. */
  await HotelSettlement.syncIndexes().catch(() => {});

  const call = async (method, path, body, token) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Client': 'hotel-payout-verify',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json = null;
    try { json = await res.json(); } catch { /* an empty body is fine */ }
    return { status: res.status, json };
  };

  /* A webhook as Razorpay sends one: signed over the exact bytes, with the
     delivery id in the header where the replay guard reads it. */
  const webhook = async (payload, { eventId, corrupt = false }) => {
    const raw = JSON.stringify(payload);
    const signature = corrupt
      ? 'f'.repeat(64)
      : crypto.createHmac('sha256', webhookSecret).update(raw).digest('hex');
    const res = await fetch(`${base}/api/v2/payments/razorpay/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-razorpay-signature': signature,
        'x-razorpay-event-id': eventId,
      },
      body: raw,
    });
    return res.status;
  };

  const payoutEvent = (payoutId, status, settlementId, extra = {}) => ({
    event: `payout.${status}`,
    payload: {
      payout: {
        entity: {
          id: payoutId,
          status,
          reference_id: String(settlementId),
          notes: { settlementId: String(settlementId) },
          ...extra,
        },
      },
    },
  });

  const stamp = String(Date.now()).slice(-9);
  const digits = `98${stamp}`.slice(-10);
  const made = { settlements: [], bookings: [], requests: [], events: [] };
  let owner = null; let hotel = null; let superAdmin = null; let plainAdmin = null;

  try {
    /* ── Fixtures ───────────────────────────────────────────────────────── */
    owner = await Partner.create({
      partnerId: `HP-${stamp}`,
      phone: `+91${digits}`,
      name: 'Payout Verify Owner',
      phoneVerifiedAt: new Date(),
    });
    hotel = await Property.create({
      name: `Payout Verify Hotel ${stamp}`,
      place: 'Hyderabad',
      category: 'HOTEL',
      ownerName: 'Payout Verify Owner',
      ownerMobile: `+91${digits}`,
      rent: 4000,
    });
    superAdmin = await Admin.create({
      name: 'Payout Verify SU',
      email: `hp_su_${stamp}@verify.invalid`,
      password: 'verify-only-password',
      role: 'Super Admin',
      status: 'Active',
    });
    plainAdmin = await Admin.create({
      name: 'Payout Verify AD',
      email: `hp_ad_${stamp}@verify.invalid`,
      password: 'verify-only-password',
      role: 'Admin',
      status: 'Active',
    });

    const ownerToken = signPartnerToken(owner);
    /* The real shape: { id, typ: 'admin', ver } — see admins/adminToken.js.
       A hand-rolled { id } token is now refused as LEGACY_TOKEN. */
    const { signAdminToken } = require('../src/modules/admins/adminToken');
    const tokenFor = (admin) => signAdminToken(admin);
    const suToken = tokenFor(superAdmin);
    const adToken = tokenFor(plainAdmin);

    const BANK = {
      beneficiaryName: 'Payout Verify Owner',
      accountNumber: '50100123456789',
      ifsc: 'HDFC0001234',
    };

    /*
     * A paid hotel stay: the visit request, the booking it produced, and the
     * settlement written against it.
     *
     * All three, because the console's hotel queue is driven by REQUESTS and
     * joins the settlement onto them — a settlement with no request behind it
     * is invisible there, so a fixture that skipped the request would assert
     * against a page no administrator sees.
     */
    const paidBooking = async (amountPaise) => {
      const booking = await PartnerBooking.create({
        partnerPhoneDigits: owner.phoneDigits,
        propertyId: String(hotel._id),
        propertyName: hotel.name,
        guestName: 'Verify Guest',
        guestPhone: `+91${digits}`,
        roomNumber: 'V1',
        shareType: 'Double',
        checkInDate: '2026-11-02',
        status: 'upcoming',
        totalAmount: amountPaise / 100,
        paidAmount: amountPaise / 100,
      });
      made.bookings.push(booking._id);

      const request = await VisitRequest.create({
        listingId: String(hotel._id),
        propertyName: hotel.name,
        ownerMobile: `+91${digits}`,
        customer: { name: 'Verify Guest', phone: `+91${digits}` },
        intent: { checkIn: '2026-11-02' },
        payment: {
          status: 'paid',
          amountPaise,
          paymentId: `pay_verify_${stamp}_${made.bookings.length}`,
          verifiedAt: new Date(),
        },
        bookingId: String(booking._id),
        status: 'confirmed',
      });
      made.requests.push(request._id);

      const settlement = await settlements.createForPaidBooking({ booking, request });
      made.settlements.push(settlement._id);
      return { booking, request, settlement };
    };

    /* ══ 1. Owner payout onboarding ════════════════════════════════════════
       The three fields are validated on the SERVER. A form is never the last
       word on what reaches a payment rail. */
    let r = await call('POST', '/api/v2/partners/payout-onboarding', { beneficiaryName: 'X' }, ownerToken);
    check('1. onboarding refuses incomplete bank details',
      r.status === 400 && r.json?.code === 'INCOMPLETE', r.json?.message);

    r = await call('POST', '/api/v2/partners/payout-onboarding', { ...BANK, ifsc: 'NOTANIFSC' }, ownerToken);
    check('1b. onboarding refuses a malformed IFSC',
      r.status === 400 && r.json?.code === 'BAD_IFSC', r.json?.message);

    /* ══ 2. Contact creation ═══════════════════════════════════════════════ */
    r = await call('POST', '/api/v2/partners/payout-onboarding', BANK, ownerToken);
    check('2. a RazorpayX contact is created and stored',
      r.status === 200 && countCalls('createContact') === 1 && !!r.json?.data?.razorpayContactId,
      r.json?.data?.razorpayContactId);

    /* ══ 3. Fund account creation ══════════════════════════════════════════
       `active` is the fund account existing — there is no approval step on
       this rail — and it is exactly what `beneficiaryFor` requires. */
    check('3. a fund account is created and the owner becomes payable',
      countCalls('createFundAccount') === 1
      && !!r.json?.data?.razorpayFundAccountId
      && r.json?.data?.status === 'active',
      r.json?.data?.razorpayFundAccountId);

    const storedOwner = await Partner.findById(owner._id).lean();
    check('3b. only the last four digits of the account are stored',
      storedOwner.payoutOnboarding?.accountLast4 === '6789'
      && !JSON.stringify(storedOwner.payoutOnboarding).includes(BANK.accountNumber),
      `last4=${storedOwner.payoutOnboarding?.accountLast4}`);

    /* ══ 4. Duplicate onboarding ═══════════════════════════════════════════
       RazorpayX de-duplicates neither contacts nor fund accounts, so an
       unchanged re-submit must create nothing — otherwise an owner who presses
       Save twice ends up with two fund accounts and a payout addressed to
       whichever was written last. */
    r = await call('POST', '/api/v2/partners/payout-onboarding', BANK, ownerToken);
    check('4. re-submitting unchanged details creates nothing new',
      r.status === 200 && countCalls('createContact') === 1 && countCalls('createFundAccount') === 1,
      `${countCalls('createContact')} contact, ${countCalls('createFundAccount')} fund account`);

    /* ══ 5. A settlement is held, and nothing is sent to a rail ════════════
       The migration's central change. Under Route this created a held
       transfer at the gateway; under RazorpayX the hold IS the ledger row and
       the rail hears nothing until somebody presses Withdraw. */
    const a = await paidBooking(1000000);
    check('5. a paid hotel booking holds the money with no rail call',
      a.settlement.status === 'held'
      && !a.settlement.payoutId
      && countCalls('createPayout') === 0,
      `gross ₹${a.settlement.grossAmountPaise / 100}, owner ₹${a.settlement.ownerSharePaise / 100}`);

    check('5b. the split is integer paise and sums to the gross',
      a.settlement.commissionPaise + a.settlement.ownerSharePaise === a.settlement.grossAmountPaise
      && Number.isInteger(a.settlement.commissionPaise)
      && Number.isInteger(a.settlement.ownerSharePaise),
      `${a.settlement.commissionPaise} + ${a.settlement.ownerSharePaise} = ${a.settlement.grossAmountPaise}`);

    /* Withdrawing before the guest arrives is the refund window, and it is shut. */
    r = await call('POST', `/api/v1/admin/monitor/settlements/${a.settlement._id}/withdraw`, undefined, suToken);
    check('5c. a held settlement cannot be withdrawn',
      r.status === 409 && r.json?.code === 'NOT_RELEASABLE' && countCalls('createPayout') === 0,
      r.json?.message);

    /* ══ 6. Payout creation ════════════════════════════════════════════════
       Check-in is what releases it, and it still takes a press. */
    await settlements.markReleasable(String(a.booking._id));
    behaviour.payoutStatus = 'queued';
    r = await call('POST', `/api/v1/admin/monitor/settlements/${a.settlement._id}/withdraw`, undefined, suToken);
    const created = lastCall('createPayout');
    check('6. Withdraw creates exactly one payout for the stored owner share',
      r.status === 200
      && countCalls('createPayout') === 1
      && created?.args.amountPaise === a.settlement.ownerSharePaise
      && created?.args.fundAccountId === storedOwner.payoutOnboarding.razorpayFundAccountId,
      created ? `${created.args.amountPaise} paise → ${created.args.fundAccountId}` : 'no payout call');

    /* The hotel's own account number must never be the payout's
       `account_number` — that field is LAMPOSE'S RazorpayX account. The
       client owns it; the caller must not be able to pass one. */
    check('6b. the hotel is identified by fund account only, never account_number',
      created?.args.accountNumber === undefined && created?.args.account_number === undefined);

    /* ══ 7. The API response does not mean paid ════════════════════════════ */
    let row = await HotelSettlement.findById(a.settlement._id);
    check('7. a queued payout leaves the settlement WITHDRAWING, not paid',
      row.status === 'withdrawing' && row.payoutStatus === 'queued' && !!row.payoutId && !row.settledAt,
      `status=${row.status} payoutStatus=${row.payoutStatus}`);

    /* ══ 8. Payout idempotency ═════════════════════════════════════════════
       Derived from the row's own id, so a retried HTTP call reaches the SAME
       payout at RazorpayX rather than making a second. */
    check('8. the idempotency key is deterministic and attempt-scoped',
      created?.args.idempotencyKey === `lam-stl-${a.settlement._id}-0`,
      created?.args.idempotencyKey);

    r = await call('POST', `/api/v1/admin/monitor/settlements/${a.settlement._id}/withdraw`, undefined, suToken);
    check('8b. pressing Withdraw again while in flight is refused',
      r.status === 409 && r.json?.code === 'IN_PROGRESS' && countCalls('createPayout') === 1,
      r.json?.message);

    /* ══ 9. Concurrent withdrawal attempts ═════════════════════════════════
       Two administrators, or one with two tabs. The lock is a single atomic
       findOneAndUpdate, so only one press can claim the row. */
    const b = await paidBooking(500000);
    await settlements.markReleasable(String(b.booking._id));
    const beforeRace = countCalls('createPayout');
    const raced = await Promise.all(Array.from({ length: 6 }, () => call(
      'POST', `/api/v1/admin/monitor/settlements/${b.settlement._id}/withdraw`, undefined, suToken,
    )));
    const won = raced.filter((x) => x.status === 200).length;
    check('9. six simultaneous withdrawals create exactly one payout',
      countCalls('createPayout') - beforeRace === 1 && won === 1,
      `${won} succeeded, ${countCalls('createPayout') - beforeRace} payout(s) created`);

    /* ══ 10. Payout processing ═════════════════════════════════════════════
       An in-flight status from the rail must not finish the settlement. */
    row = await HotelSettlement.findById(b.settlement._id);
    const racedPayoutId = row.payoutId;
    made.events.push(`evt_hp_processing_${stamp}`);
    let status = await webhook(
      payoutEvent(racedPayoutId, 'processing', b.settlement._id),
      { eventId: `evt_hp_processing_${stamp}` },
    );
    row = await HotelSettlement.findById(b.settlement._id);
    check('10. payout.processing keeps the settlement WITHDRAWING',
      status === 200 && row.status === 'withdrawing' && row.payoutStatus === 'processing',
      `status=${row.status}`);

    /* ══ 11. Payout success ════════════════════════════════════════════════
       The only route to `paid_out`. The UTR is what a hotel quotes their bank
       when they ring to ask where the money is. */
    made.events.push(`evt_hp_processed_${stamp}`);
    status = await webhook(
      payoutEvent(racedPayoutId, 'processed', b.settlement._id, { utr: 'HDFCN00123456' }),
      { eventId: `evt_hp_processed_${stamp}` },
    );
    row = await HotelSettlement.findById(b.settlement._id);
    check('11. payout.processed is what marks a settlement PAID OUT',
      status === 200 && row.status === 'paid_out' && row.utr === 'HDFCN00123456' && !!row.settledAt,
      `utr=${row.utr}`);

    /* ══ 12. Duplicate webhook ═════════════════════════════════════════════
       Razorpay redelivers for hours until it gets a 2xx. The event id is
       claimed before anything is read, so a redelivery is acknowledged and
       does nothing. */
    status = await webhook(
      payoutEvent(racedPayoutId, 'processed', b.settlement._id, { utr: 'HDFCN00123456' }),
      { eventId: `evt_hp_processed_${stamp}` },
    );
    const eventRows = await PaymentEvent.countDocuments({ eventId: `evt_hp_processed_${stamp}` });
    check('12. a redelivered webhook is acknowledged and runs once',
      status === 200 && eventRows === 1, `${eventRows} event row`);

    /* ══ 13. Invalid webhook signature ═════════════════════════════════════
       Anyone can POST to a webhook URL; only Razorpay can sign one. Without
       this check a stranger could mark every settlement paid. */
    const forgedId = `evt_hp_forged_${stamp}`;
    made.events.push(forgedId);
    status = await webhook(
      payoutEvent('pout_forged', 'processed', a.settlement._id),
      { eventId: forgedId, corrupt: true },
    );
    const forgedRows = await PaymentEvent.countDocuments({ eventId: forgedId });
    check('13. an unsigned webhook is refused and never reaches a handler',
      status === 400 && forgedRows === 0);

    /* ══ 14. Payout reversal ═══════════════════════════════════════════════
       Money that left and came back. It is the one payout outcome nobody is
       watching for, so it goes to the audit log an accountant reads. */
    made.events.push(`evt_hp_reversed_${stamp}`);
    status = await webhook(
      payoutEvent(racedPayoutId, 'reversed', b.settlement._id, { failure_reason: 'beneficiary account closed' }),
      { eventId: `evt_hp_reversed_${stamp}` },
    );
    row = await HotelSettlement.findById(b.settlement._id);
    const reversals = await AdminAuditLog.countDocuments({
      targetId: String(b.settlement._id), action: 'settlement.reversed',
    });
    check('14. a reversal after payment moves the settlement and is audited',
      status === 200 && row.status === 'reversed' && reversals === 1,
      row.failureReason);

    /* ══ 15. Payout failure and insufficient balance ═══════════════════════
       The refusal that happens when Lampose's own RazorpayX balance is short.
       It must be visible, retryable, and must not leave the row stuck. */
    const c = await paidBooking(300000);
    await settlements.markReleasable(String(c.booking._id));
    behaviour.payoutThrows = () => {
      const e = new Error('Your account does not have enough balance to make this payout.');
      e.code = 'RAZORPAYX_PAYOUT_FAILED';
      e.status = 502;
      return e;
    };
    r = await call('POST', `/api/v1/admin/monitor/settlements/${c.settlement._id}/withdraw`, undefined, suToken);
    row = await HotelSettlement.findById(c.settlement._id);
    check('15. a refused payout fails loudly and is left retryable',
      r.status >= 400 && row.status === 'failed' && !row.payoutId && !!row.failureReason,
      row.failureReason);

    /* A refusal that created nothing gets a FRESH key — the next press is a
       genuinely new payout, and reusing the key would have RazorpayX hand
       back the failed one forever. */
    check('15b. a failure with no payout advances the idempotency key',
      row.payoutAttempt === 1 && row.idempotencyKey === `lam-stl-${c.settlement._id}-1`,
      row.idempotencyKey);

    behaviour.payoutThrows = null;
    behaviour.payoutStatus = 'processing';
    r = await call('POST', `/api/v1/admin/monitor/settlements/${c.settlement._id}/withdraw`, undefined, suToken);
    row = await HotelSettlement.findById(c.settlement._id);
    check('15c. retrying a failed settlement is one press and uses the new key',
      r.status === 200 && row.status === 'withdrawing'
      && lastCall('createPayout')?.args.idempotencyKey === `lam-stl-${c.settlement._id}-1`,
      lastCall('createPayout')?.args.idempotencyKey);

    /* ══ 16. Admin authorization ═══════════════════════════════════════════
       Withdraw is the one endpoint that moves money out. Reading the queue is
       wider; pressing the button is Super Admin alone. */
    const d = await paidBooking(200000);
    await settlements.markReleasable(String(d.booking._id));
    const beforeAuthz = countCalls('createPayout');

    r = await call('POST', `/api/v1/admin/monitor/settlements/${d.settlement._id}/withdraw`, undefined);
    check('16. an unauthenticated withdrawal is refused',
      (r.status === 401 || r.status === 403) && countCalls('createPayout') === beforeAuthz,
      r.json?.message);

    r = await call('POST', `/api/v1/admin/monitor/settlements/${d.settlement._id}/withdraw`, undefined, adToken);
    check('16b. a plain Admin cannot withdraw — Super Admin only',
      r.status === 403 && countCalls('createPayout') === beforeAuthz, r.json?.message);

    r = await call('GET', '/api/v1/admin/monitor/hotel', undefined, adToken);
    check('16c. but a plain Admin can still READ the hotel queue', r.status === 200);

    /* The commission is refused once the row has left an editable state —
       rewriting a split behind a payout that has already gone would make the
       ledger disagree with the bank. */
    r = await call('PATCH', `/api/v1/admin/monitor/settlements/${b.settlement._id}/commission`,
      { percent: 20 }, suToken);
    check('16d. the commission cannot be rewritten behind a completed payout',
      r.status === 409, r.json?.message);

    /* ══ 17. A settlement is never withdrawn twice ═════════════════════════ */
    r = await call('POST', `/api/v1/admin/monitor/settlements/${b.settlement._id}/withdraw`, undefined, suToken);
    check('17. a finished settlement cannot be withdrawn again',
      r.status === 409 && countCalls('createPayout') === beforeAuthz, r.json?.message);

    /* ══ 18. Historical Route rows still read ══════════════════════════════
       No migration was run over production data. A settlement written when
       Route was the rail keeps its transfer id, reports `provider: 'route'`,
       and is still listed and readable — which is the whole reason the two
       historical fields were kept on the schema. */
    const historic = await paidBooking(800000);
    /* Rewritten to look like a row settled before the migration: same booking
       and request, but Route's identifiers and no payout. */
    await HotelSettlement.deleteOne({ _id: historic.settlement._id });
    const legacy = await HotelSettlement.create({
      bookingId: String(historic.booking._id),
      requestId: String(historic.request._id),
      propertyId: String(hotel._id),
      propertyName: hotel.name,
      ownerPhoneDigits: owner.phoneDigits,
      guestName: 'Verify Guest',
      grossAmountPaise: 800000,
      commissionPercent: 5,
      commissionPaise: 40000,
      ownerSharePaise: 760000,
      status: 'paid_out',
      provider: 'route',
      transferId: 'trf_historical_123',
      linkedAccountId: 'acc_historical_456',
      settledAt: new Date('2026-08-01'),
    });
    made.settlements.push(legacy._id);
    const view = legacy.toAdmin();
    check('18. a Route-era settlement is still readable and names its rail',
      view.provider === 'route'
      && view.transferId === 'trf_historical_123'
      && view.ownerShare === 7600
      && view.payoutId === null,
      `₹${view.ownerShare} via ${view.provider}`);

    r = await call('GET', '/api/v1/admin/monitor/hotel', undefined, suToken);
    const listed = r.json?.data || [];
    const legacyRow = listed.find((x) => x.bookingId === String(historic.booking._id));
    const liveRow = listed.find((x) => x.bookingId === String(a.booking._id));
    check('18b. the admin queue lists both rails together',
      r.status === 200
      && legacyRow?.settlement?.provider === 'route'
      && legacyRow?.settlement?.transferId === 'trf_historical_123'
      && liveRow?.settlement?.provider === 'razorpayx',
      `${listed.length} rows · route=${legacyRow?.settlement?.status} razorpayx=${liveRow?.settlement?.status}`);

    /* ══ 19. Nothing leaked a secret ═══════════════════════════════════════
       Every response an app or a browser can see, checked against the keys
       that must never leave the server. */
    const secrets = [
      process.env.RAZORPAY_KEY_SECRET,
      process.env.RAZORPAYX_KEY_SECRET,
      webhookSecret,
    ].filter(Boolean);
    const bodies = JSON.stringify([
      (await call('GET', '/api/v2/partners/payout-onboarding', undefined, ownerToken)).json,
      (await call('GET', '/api/v1/admin/monitor/hotel', undefined, suToken)).json,
      (await call('GET', '/api/v1/admin/monitor', undefined, suToken)).json,
    ]);
    check('19. no API response carries a Razorpay secret',
      secrets.length > 0 && !secrets.some((s) => bodies.includes(s)),
      `${secrets.length} secrets checked`);
  } catch (error) {
    check(`the run itself completed — ${error.message}`, false, error.stack?.split('\n')[1]?.trim());
  } finally {
    try {
      if (made.settlements.length) {
        await AdminAuditLog.deleteMany({ targetId: { $in: made.settlements.map(String) } });
        await HotelSettlement.deleteMany({ _id: { $in: made.settlements } });
      }
      if (made.bookings.length) await PartnerBooking.deleteMany({ _id: { $in: made.bookings } });
      if (made.requests.length) await VisitRequest.deleteMany({ _id: { $in: made.requests } });
      if (made.events.length) await PaymentEvent.deleteMany({ eventId: { $in: made.events } });
      if (owner) await Partner.deleteOne({ _id: owner._id });
      if (hotel) await Property.deleteOne({ _id: hotel._id });
      if (superAdmin) await Admin.deleteOne({ _id: superAdmin._id });
      if (plainAdmin) await Admin.deleteOne({ _id: plainAdmin._id });
    } catch (error) {
      console.error('cleanup failed:', error.message);
    }
    server.close();
    await closeConnections().catch(() => {});
  }

  const line = '='.repeat(78);
  console.log(`\n${line}\n  HOTEL SETTLEMENT — the RazorpayX payout rail\n${line}`);
  let failed = 0;
  for (const [ok, name, extra] of results) {
    if (!ok) failed += 1;
    console.log(`  ${ok ? '✅' : '❌'} ${name}${extra ? `  · ${extra}` : ''}`);
  }
  console.log(`${line}\n  ${results.length - failed}/${results.length} passed\n${line}\n`);

  process.exit(failed ? 1 : 0);
})();
