/* ══════════════════════════════════════════════════════════════════════════
   Rider onboarding: sign-up → documents → the console's verdict → the road.

   `verify-food-dispatch.js` walks what a rider does once they are approved.
   This one walks how they get approved, which is the half that spans the
   Driver app and the admin console and which nothing tested before.

     Driver app      POST  /v2/drivers/auth/start     a number in
                     POST  /v2/drivers/auth/verify    a code back, a session
                     PATCH /v2/drivers/me             each step of the form
                     POST  /v2/drivers/me/documents   one document at a time
     Admin console   GET   /v1/admin/drivers          the queue
                     PATCH /v1/admin/drivers/:id/documents/:kind
                     PATCH /v1/admin/drivers/:id/decision
     Driver app      GET   /v2/drivers/me             sees the verdict
                     POST  /v2/drivers/me/duty        may now go online

   The assertions that matter are the refusals, because every one of them is a
   thing that used to be possible:

     · a rider CANNOT mark their own onboarding complete with an empty form
     · a rider CANNOT set their own `status`, or any document's
     · a document rejection needs a reason, and the rider is shown it
     · resubmitting a rejected document returns it to the queue as `pending`
     · an unapproved rider is refused the duty switch, in the server's words
     · the payout account number never appears in any response
     · approving over incomplete paperwork is allowed and WARNS

   NOTHING IS TEXTED. The rider row and its code are seeded exactly as
   `startAuth` and `issueOtp` produce them, because `sendOtpSms` reaches the
   live gateway in development too — see the note at step 1. Cloudinary is not
   called either: the document handler stores URL strings and does not care
   where they came from, so the scans here are `https://example.invalid/...`
   placeholders.

   Cleans up after itself: the rider and the throwaway administrator it creates
   are both removed.

   Run with: npm run verify:driver-onboarding
   ══════════════════════════════════════════════════════════════════════════ */
const jwt = require('jsonwebtoken');

require('../src/config/env');
const { connectDB, closeConnections, isLamposeUp } = require('../src/infrastructure/database/db');
const createApp = require('../app');

/* Refuse to run against production. See src/infrastructure/database/guard.js */
require('../src/infrastructure/database/guard').assertDevTargetOrExit();


const results = [];
const check = (name, ok, extra = '') => results.push([!!ok, name, extra]);

const scan = (kind, side) => `https://example.invalid/verify/${kind}-${side}.jpg`;

(async () => {
  await connectDB().catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 1500));

  if (!isLamposeUp()) {
    console.log('\nMongoDB is not reachable. Start it and re-run.\n');
    process.exit(2);
  }
  if (!process.env.JWT_SECRET) {
    console.log('\nJWT_SECRET is not set. Both identity systems need it.\n');
    process.exit(2);
  }

  const app = createApp({});
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;

  const call = async (method, path, body, token) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Client': 'driver-onboarding',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json = null;
    try { json = await res.json(); } catch { /* an empty body is fine */ }
    return { status: res.status, json };
  };

  const Driver = require('../src/modules/drivers/driver.model');
  const Admin = require('../src/modules/admins/admin.model');
  const { generateOtp, newSalt, hashOtp } = require('../src/modules/visits/otp.util');
  const { makeDriverId } = Driver;

  const stamp = String(Date.now()).slice(-6);
  /* Ten digits starting 6-9, which is what `isIndianMobile` accepts. */
  const phone = `9${stamp}000`;

  let rider = null;
  let admin = null;
  let driverToken = null;
  let adminToken = null;
  let driverId = null;

  try {
    /* ── 0. An administrator to decide with ─────────────────────────────── */
    admin = await Admin.create({
      name: 'Verify Approver',
      email: `verify-driver-${stamp}@lampose.test`,
      password: `Verify!${stamp}aA`,
      role: 'Admin',
      status: 'Active',
    });
    /* The real shape: { id, typ: 'admin', ver } — a hand-rolled { id } token
       is now refused as LEGACY_TOKEN. See admins/adminToken.js. */
    const { signAdminToken } = require('../src/modules/admins/adminToken');
    adminToken = signAdminToken(admin, { expiresIn: '1h' });

    /* ── 1. Sign up ─────────────────────────────────────────────────────── */
    /*
     * `POST /auth/start` is deliberately NOT called.
     *
     * `sendOtpSms` talks to the live gateway in development as well as in
     * production — the README's claim that it prints the code outside
     * production is not what `infrastructure/sms/sms.js` does. So calling it
     * here would text a real six-digit code to an INVENTED ten-digit Indian
     * mobile number on every run, and every one of those numbers plausibly
     * belongs to somebody. A verification script must not do that.
     *
     * The row is therefore created the way `startAuth` creates it, and the
     * code is seeded the way `issueOtp` seeds it, so everything downstream —
     * which is what this script is actually about — runs against exactly the
     * state the real route would have produced.
     */
    rider = await Driver.create({ driverId: makeDriverId(), phone: `+91${phone}` });
    driverId = rider.driverId;
    check('a new number creates a rider row', !!driverId);

    const salt = newSalt();
    const otp = generateOtp();
    rider.otp.salt = salt;
    rider.otp.hash = hashOtp(otp, salt);
    rider.otp.expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    rider.otp.attempts = 0;
    rider.otp.lockedUntil = null;
    await rider.save();

    const verified = await call('POST', '/api/v2/drivers/auth/verify', { phone, code: otp });
    driverToken = verified.json?.data?.token || null;
    check('the code returns a session', verified.status === 200 && !!driverToken);
    check(
      'a brand new rider is pending and cannot work',
      verified.json?.data?.driver?.status === 'pending'
        && verified.json?.data?.driver?.canGoOnline === false,
    );
    check(
      'the checklist arrives with all five documents, none of them sent',
      verified.json?.data?.driver?.documents?.length === 5
        && verified.json.data.driver.documents.every((d) => d.status === 'missing'),
    );

    /* ── 2. The form cannot be skipped ──────────────────────────────────── */
    const skipped = await call('PATCH', '/api/v2/drivers/me', { hasCompletedOnboarding: true }, driverToken);
    check(
      'an empty form cannot be marked finished',
      skipped.status === 409 && skipped.json?.code === 'ONBOARDING_INCOMPLETE',
      skipped.json?.message,
    );
    check(
      'and the refusal names what is missing',
      Array.isArray(skipped.json?.missing) && skipped.json.missing.length > 0,
      (skipped.json?.missing || []).slice(0, 3).join(', '),
    );

    const stillPending = await Driver.findOne({ driverId }).lean();
    check('the refusal did not set the flag anyway', stillPending.hasCompletedOnboarding === false);

    /* ── 3. What a rider may never set ──────────────────────────────────── */
    await call('PATCH', '/api/v2/drivers/me', { status: 'approved' }, driverToken);
    const afterSelfApprove = await Driver.findOne({ driverId }).lean();
    check('a rider cannot approve themselves', afterSelfApprove.status === 'pending');

    /* ── 4. Each step, saved ────────────────────────────────────────────── */
    const personal = await call('PATCH', '/api/v2/drivers/me', {
      name: 'Verify Rider',
      dateOfBirth: '1996-06-14',
      city: 'Rajahmundry',
      onboardingStep: 'vehicle',
    }, driverToken);
    check('the personal step saves', personal.status === 200 && personal.json?.data?.name === 'Verify Rider');
    check('and the server remembers where they got to', personal.json?.data?.onboarding?.step === 'vehicle');

    const tooYoung = await call('PATCH', '/api/v2/drivers/me', { dateOfBirth: '2020-01-01' }, driverToken);
    check('somebody under 18 is refused', tooYoung.status === 400 && tooYoung.json?.code === 'TOO_YOUNG');

    const vehicle = await call('PATCH', '/api/v2/drivers/me', {
      vehicle: { type: 'bike', plate: 'ap 05 cj 4471', model: 'Honda Activa 6G' },
      onboardingStep: 'documents',
    }, driverToken);
    check(
      'the plate is normalised to one spelling',
      vehicle.json?.data?.vehicle?.plate === 'AP05CJ4471',
      vehicle.json?.data?.vehicle?.plate,
    );

    /* ── 5. Documents ───────────────────────────────────────────────────── */
    const noImage = await call('POST', '/api/v2/drivers/me/documents', {
      kind: 'licence', number: 'AP0320190004471',
    }, driverToken);
    check('a document with no photograph is refused', noImage.status === 400 && noImage.json?.code === 'NO_IMAGE');

    const unknownKind = await call('POST', '/api/v2/drivers/me/documents', {
      kind: 'passport', frontUrl: scan('passport', 'front'),
    }, driverToken);
    check('an unknown document kind is refused', unknownKind.status === 400);

    for (const kind of ['licence', 'rc', 'aadhaar']) {
      await call('POST', '/api/v2/drivers/me/documents', {
        kind,
        number: `${kind.toUpperCase()}-${stamp}`,
        frontUrl: scan(kind, 'front'),
        backUrl: scan(kind, 'back'),
      }, driverToken);
    }
    const withDocs = await call('GET', '/api/v2/drivers/me', undefined, driverToken);
    check(
      'the three required documents are on file and awaiting review',
      withDocs.json?.data?.documents
        ?.filter((d) => d.required)
        .every((d) => d.status === 'pending'),
    );
    check(
      'a rider cannot verify their own document',
      withDocs.json?.data?.documents?.every((d) => d.status !== 'verified'),
    );

    /* ── 6. Payout, and the number that must not come back ──────────────── */
    const badIfsc = await call('PATCH', '/api/v2/drivers/me', {
      payout: { ifscCode: 'NOTANIFSC' },
    }, driverToken);
    check('a malformed IFSC is refused', badIfsc.status === 400 && badIfsc.json?.code === 'BAD_IFSC');

    const bank = await call('PATCH', '/api/v2/drivers/me', {
      payout: {
        accountHolderName: 'Verify Rider',
        bankAccountNumber: '50100123458841',
        ifscCode: 'HDFC0001432',
        bankName: 'HDFC Bank',
      },
      onboardingStep: 'bank',
    }, driverToken);
    check('the payout account saves', bank.status === 200);
    check(
      'only the last four digits come back',
      bank.json?.data?.payout?.accountLast4 === '8841'
        && !JSON.stringify(bank.json).includes('50100123458841'),
    );

    /* ── 7. Now it may be finished ──────────────────────────────────────── */
    const finished = await call('PATCH', '/api/v2/drivers/me', {
      hasCompletedOnboarding: true,
    }, driverToken);
    check(
      'a complete form CAN be marked finished',
      finished.status === 200 && finished.json?.data?.hasCompletedOnboarding === true,
      finished.json?.message,
    );
    check('and the server says there is nothing left', finished.json?.data?.onboarding?.complete === true);

    const beforeApproval = await call('POST', '/api/v2/drivers/me/duty', { online: true }, driverToken);
    check(
      'a finished but unapproved rider still cannot go online',
      /* Refused by `requireApprovedDriver` at the MOUNT, one tier before
         `setDuty`'s own check ever runs — which is the arrangement that makes
         "approved" mean something. Either code is the right refusal; the
         mount guard is the one that actually fires. */
      beforeApproval.status === 403
        && ['APPROVAL_PENDING', 'NOT_APPROVED'].includes(beforeApproval.json?.code),
      beforeApproval.json?.code,
    );

    /* ── 8. The console ─────────────────────────────────────────────────── */
    const queue = await call('GET', '/api/v1/admin/drivers?status=pending', undefined, adminToken);
    const row = (queue.json?.data || []).find((d) => d.driverId === driverId);
    check('the rider is in the console queue', queue.status === 200 && !!row);
    check('with the full five-row checklist', row?.documents?.length === 5);
    check('and the console never sees the account number', !JSON.stringify(queue.json).includes('50100123458841'));

    const noAdminToken = await call('GET', '/api/v1/admin/drivers');
    check('the queue refuses an unauthenticated reader', noAdminToken.status === 401);

    const detail = await call('GET', `/api/v1/admin/drivers/${driverId}`, undefined, adminToken);
    check(
      'the detail carries the lifetime tally and the recent orders',
      detail.status === 200
        && typeof detail.json?.data?.lifetime?.delivered === 'number'
        && Array.isArray(detail.json?.data?.recentDeliveries),
    );

    /* ── 9. Per-document verdicts ───────────────────────────────────────── */
    const noReason = await call(
      'PATCH', `/api/v1/admin/drivers/${driverId}/documents/pan`,
      { status: 'rejected' }, adminToken,
    );
    check(
      'rejecting a document with no reason is refused',
      /* PAN was never sent, so NOT_SUBMITTED is the correct earlier refusal;
         either one proves the guard, and the reason check is asserted on a
         document that exists, below. */
      noReason.status === 400 || noReason.status === 409,
      noReason.json?.code,
    );

    const noReasonOnReal = await call(
      'PATCH', `/api/v1/admin/drivers/${driverId}/documents/licence`,
      { status: 'rejected' }, adminToken,
    );
    check(
      'rejecting a SENT document with no reason is refused',
      noReasonOnReal.status === 400 && noReasonOnReal.json?.code === 'REASON_REQUIRED',
    );

    await call('PATCH', `/api/v1/admin/drivers/${driverId}/documents/licence`, {
      status: 'verified',
    }, adminToken);
    const rejectedDoc = await call('PATCH', `/api/v1/admin/drivers/${driverId}/documents/rc`, {
      status: 'rejected',
      reason: 'The RC photo is too blurred to read the chassis number.',
    }, adminToken);
    check('one document can be verified and another refused', rejectedDoc.status === 200);

    const riderSees = await call('GET', '/api/v2/drivers/me', undefined, driverToken);
    const rc = riderSees.json?.data?.documents?.find((d) => d.kind === 'rc');
    check(
      "the rider is shown the approver's own sentence",
      rc?.status === 'rejected' && rc?.reason === 'The RC photo is too blurred to read the chassis number.',
    );
    check(
      'and the account itself is untouched by a document refusal',
      riderSees.json?.data?.status === 'pending',
    );
    check(
      'the rider is told which document to send again',
      String(riderSees.json?.data?.blockedReason || '').includes('Vehicle registration'),
      riderSees.json?.data?.blockedReason,
    );

    /* ── 10. Resubmitting ───────────────────────────────────────────────── */
    await call('POST', '/api/v2/drivers/me/documents', {
      kind: 'rc',
      number: `RC-${stamp}`,
      frontUrl: scan('rc', 'front-v2'),
      backUrl: scan('rc', 'back-v2'),
    }, driverToken);
    const resubmitted = await call('GET', '/api/v2/drivers/me', undefined, driverToken);
    const rc2 = resubmitted.json?.data?.documents?.find((d) => d.kind === 'rc');
    check('resubmitting returns it to the queue', rc2?.status === 'pending');
    check('and clears the old refusal with it', rc2?.reason === '');
    check('the verified licence is not disturbed',
      resubmitted.json?.data?.documents?.find((d) => d.kind === 'licence')?.status === 'verified');

    /* ── 11. The account verdict ────────────────────────────────────────── */
    const backToPending = await call('PATCH', `/api/v1/admin/drivers/${driverId}/decision`, {
      status: 'pending',
    }, adminToken);
    check(
      'a rider cannot be sent back to pending',
      backToPending.status === 409 && backToPending.json?.code === 'NOT_A_DECISION',
    );

    /* Approving over a REFUSED required document is allowed — the operator on
       that screen is the authority on who may ride — and it warns. Set that
       state up deliberately rather than hoping for it. */
    await call('PATCH', `/api/v1/admin/drivers/${driverId}/documents/aadhaar`, {
      status: 'rejected', reason: 'Verification run — the ID scan is unreadable.',
    }, adminToken);

    const approvedEarly = await call('PATCH', `/api/v1/admin/drivers/${driverId}/decision`, {
      status: 'approved',
    }, adminToken);
    check(
      'the console can approve',
      approvedEarly.status === 200 && approvedEarly.json?.data?.status === 'approved',
    );
    check(
      'and warns when it was done over incomplete paperwork',
      typeof approvedEarly.json?.warning === 'string' && approvedEarly.json.warning.length > 0,
      approvedEarly.json?.warning?.slice(0, 70),
    );

    /* Put it back, so the duty check below is not passing for the wrong
       reason. */
    await call('POST', '/api/v2/drivers/me/documents', {
      kind: 'aadhaar', number: `AADHAAR-${stamp}`, frontUrl: scan('aadhaar', 'front-v2'),
    }, driverToken);

    const onDuty = await call('POST', '/api/v2/drivers/me/duty', { online: true }, driverToken);
    check(
      'an approved rider can finally go online',
      onDuty.status === 200 && onDuty.json?.data?.isOnline === true,
      onDuty.json?.data?.note || '',
    );

    /* ── 12. Suspension takes them off the road now ─────────────────────── */
    const suspended = await call('PATCH', `/api/v1/admin/drivers/${driverId}/decision`, {
      status: 'suspended',
      reason: 'Verification run — not a real suspension.',
    }, adminToken);
    check('the console can suspend', suspended.status === 200);
    const offRoad = await Driver.findOne({ driverId }).lean();
    check('and it clears duty immediately', offRoad.isOnline === false);

    /* Suspension bites at `requireDriver`, so even `GET /me` is refused — the
       rider is told on every route, not only the ones they might not open.
       The reason travels on that refusal. */
    const suspendedSees = await call('GET', '/api/v2/drivers/me', undefined, driverToken);
    check(
      'a suspended rider is stopped on every route',
      suspendedSees.status === 403 && suspendedSees.json?.code === 'ACCOUNT_SUSPENDED',
    );
    check(
      "and is shown the operator's own reason",
      String(suspendedSees.json?.message || '').includes('Verification run'),
      suspendedSees.json?.message,
    );
  } catch (error) {
    check('the run completed', false, error.message);
  } finally {
    try {
      if (driverId) await Driver.deleteOne({ driverId });
      if (admin) await Admin.deleteOne({ _id: admin._id });
    } catch (error) {
      console.error('cleanup failed:', error.message);
    }
    server.close();
    await closeConnections().catch(() => {});
  }

  const line = '='.repeat(78);
  console.log(`\n${line}\n  RIDER ONBOARDING AND APPROVAL\n${line}`);
  let failed = 0;
  for (const [ok, name, extra] of results) {
    if (!ok) failed += 1;
    console.log(`  ${ok ? '✅' : '❌'} ${name}${extra ? `  · ${extra}` : ''}`);
  }
  console.log(`${line}\n  ${results.length - failed}/${results.length} passed\n${line}\n`);

  process.exit(failed ? 1 : 0);
})();
