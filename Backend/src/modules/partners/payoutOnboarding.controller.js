/* ══════════════════════════════════════════════════════════════════════════
   Payout onboarding — the bank account Lampose sends a hotel's money to.

   ## The hotel is a PAYEE, not a merchant

   This used to create a Razorpay Route linked account: the hotel became a
   sub-merchant of ours, Razorpay onboarded them, and it wanted a legal
   business name, a business type, a PAN, a stakeholder and a registered
   address before it would settle anything.

   RazorpayX Payouts is a different arrangement and a much lighter one. Lampose
   pays out of its OWN RazorpayX account to a bank account we name. The hotel
   owner needs no Razorpay account, no KYC with Razorpay and no activation —
   they are a beneficiary. So the form asks for what a bank transfer actually
   needs: who they are, how to reach them, and where the money goes.

   Two RazorpayX objects, in order:

     CONTACT       who is being paid. One per owner.
     FUND ACCOUNT  where their money goes — a bank account under that contact.

   `payoutOnboarding.razorpayFundAccountId` is what `settlement.service.js`
   pays to, and its presence IS the "this owner can be paid" test. There is no
   activation step to wait for, which is why `status` reaches `active` as soon
   as RazorpayX has accepted both objects.

   ## Idempotent by reuse, not by luck

   RazorpayX de-duplicates neither contacts nor fund accounts. Submitting the
   same bank details twice would make a second fund account, and an owner would
   accumulate one per visit to the form.

   So a contact is created ONCE and reused for ever, and a fund account is
   created only when the account number or IFSC has actually changed — compared
   against the last four digits and the IFSC we stored. Re-submitting identical
   details is a no-op that returns the same ids.

   ## What is stored, and what is not

   Identifiers, the IFSC, and the last four digits of the account number.
   Never the full account number, and never a Razorpay credential. The full
   number goes to RazorpayX in one request and is not kept.
   ══════════════════════════════════════════════════════════════════════════ */
const config = require('../../config/env');
const razorpay = require('../../infrastructure/razorpay/razorpay');
const Partner = require('./partner.model');
const Property = require('../properties/property.model');
const { HotelSettlement } = require('../settlements/hotelSettlement.model');
const { categoryQuery } = require('../../shared/constants/categories');

const fail = (res, status, code, message) =>
  res.status(status).json({ success: false, code, message, error: message });

/** Digits only, last ten — the same key `Property.ownerMobile` is matched on. */
const phoneKey = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : '';
};

/**
 * Does this owner have a HOTEL on the platform?
 *
 * Read from the properties collection, never from the request. An app that
 * could assert this could either escape the gate or force somebody through an
 * onboarding they do not need.
 *
 * `categoryQuery` because `properties.category` was never migrated — HOTEL and
 * Dormitory are both live spellings of one category, and comparing the stored
 * string would miss half of them.
 */
const ownsHotel = async (key) => {
  if (!key) return false;
  const rows = await Property.find({ category: categoryQuery('HOTEL') })
    .select('ownerMobile').lean();
  return rows.some((row) => phoneKey(row.ownerMobile) === key);
};

/** What the app needs to decide whether to gate, and what to say. */
const describe = async (partner) => {
  const key = partner.phoneDigits;
  const onboarding = partner.payoutOnboarding || {};
  const hotel = await ownsHotel(key);

  /*
   * Money already waiting on this owner.
   *
   * The difference between "you will need this eventually" and "we are holding
   * your money right now" — which is the difference between a banner and a
   * blocked app. Counted from settlements rather than bookings: a settlement
   * exists only when a guest has actually paid.
   */
  const waiting = hotel
    ? await HotelSettlement.countDocuments({
      ownerPhoneDigits: key,
      status: { $in: ['held', 'releasable', 'failed'] },
    })
    : 0;

  return {
    /* Is any of this their concern at all? */
    ownsHotel: hotel,
    status: onboarding.status || 'none',
    /* The one question the gate asks. */
    required: hotel && onboarding.status !== 'active',
    /* Somebody's money is stuck until they finish. The app makes this a hard
       stop where a plain `required` is only a prompt. */
    settlementsWaiting: waiting,

    /* The live rail's identifiers. `razorpayFundAccountId` being set is what
       makes an owner payable — see `beneficiaryFor`. */
    razorpayContactId: onboarding.razorpayContactId || null,
    razorpayFundAccountId: onboarding.razorpayFundAccountId || null,
    /* Historical only: owners onboarded under Route before the migration. */
    linkedAccountId: onboarding.linkedAccountId || null,

    legalBusinessName: onboarding.legalBusinessName || '',
    beneficiaryName: onboarding.beneficiaryName || '',
    accountLast4: onboarding.accountLast4 || '',
    ifsc: onboarding.ifsc || '',
    rejectionReason: onboarding.rejectionReason || '',
    submittedAt: onboarding.submittedAt || null,
    activatedAt: onboarding.activatedAt || null,

    /* DEVELOPMENT ONLY — whether this server allows the bypass below. A server
       flag, so the app cannot infer it, and a button that might 404 is worse
       than no button. Always false in production. */
    devActivateAllowed: Boolean(config.razorpay.devAllowForceCheckIn),
  };
};

// @route  GET /api/v2/partners/payout-onboarding
// @desc   Whether this owner needs payout details, and how far they have got
// @access Partner session
const getOnboarding = async (req, res, next) => {
  try {
    return res.json({ success: true, data: await describe(req.partner) });
  } catch (error) {
    return next(error);
  }
};

/**
 * What a RazorpayX contact and fund account actually need.
 *
 * Four fields. The Route version asked for ten — a legal business name, a
 * business type, a PAN, a full registered address — because Razorpay was
 * onboarding the hotel as a merchant. It is not any more: it is paying a bank
 * account. Asking for the rest would be collecting documents nothing reads.
 */
const REQUIRED_FIELDS = [
  ['beneficiaryName', 'the account holder’s name'],
  ['accountNumber', 'the account number'],
  ['ifsc', 'the IFSC'],
];

// @route  POST /api/v2/partners/payout-onboarding
// @desc   Store the owner's bank details and register them with RazorpayX
// @access Partner session
const submitOnboarding = async (req, res, next) => {
  try {
    const partner = req.partner;
    const body = req.body || {};

    /* Validated here as well as in the form. A client is never the last word
       on what reaches a payment rail. */
    const missing = REQUIRED_FIELDS
      .filter(([field]) => !String(body[field] || '').trim())
      .map(([, label]) => label);
    if (missing.length) {
      return fail(res, 400, 'INCOMPLETE', `We still need ${missing.join(', ')}.`);
    }

    const ifsc = String(body.ifsc).trim().toUpperCase();
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
      return fail(res, 400, 'BAD_IFSC', 'That does not look like an IFSC — it should be like HDFC0001234.');
    }
    const accountNumber = String(body.accountNumber).replace(/\s/g, '');
    if (!/^\d{6,20}$/.test(accountNumber)) {
      return fail(res, 400, 'BAD_ACCOUNT', 'That does not look like an account number.');
    }
    const beneficiaryName = String(body.beneficiaryName).trim();
    const email = String(body.email || '').trim().toLowerCase();

    const existing = partner.payoutOnboarding?.toObject?.() ?? partner.payoutOnboarding ?? {};
    const last4 = accountNumber.slice(-4);

    /*
     * Has anything actually changed?
     *
     * RazorpayX de-duplicates neither contacts nor fund accounts, so a form
     * re-submitted unchanged would mint a second fund account and quietly
     * leave the owner with two. Compared on the pair that identifies a bank
     * account — the IFSC and the last four digits — because that is all we
     * keep of it.
     *
     * A full account number that differs only in its leading digits is a
     * genuinely different account and would slip past this. That is a real
     * limitation of not storing the whole number, and it is the right trade:
     * the cost is a duplicate fund account on a rare edit, and the cost of the
     * alternative is holding thousands of bank account numbers.
     */
    const unchanged = existing.razorpayFundAccountId
      && existing.ifsc === ifsc
      && existing.accountLast4 === last4
      && existing.beneficiaryName === beneficiaryName;

    if (unchanged) {
      /* Idempotent: nothing to create, nothing to change. */
      return res.json({ success: true, data: await describe(partner) });
    }

    /*
     * Stored FIRST, then sent to RazorpayX.
     *
     * If the order were reversed, a rail that was slow, unreachable or not yet
     * enabled would lose everything the owner typed. This way the worst case
     * is a row marked `submitted` that a re-submit carries forward.
     *
     * The full account number is NOT kept — RazorpayX holds it. We keep the
     * last four so a person can recognise which account they gave us, which is
     * all any screen needs to show.
     */
    partner.payoutOnboarding = {
      ...existing,
      status: 'submitted',
      beneficiaryName,
      legalBusinessName: String(body.legalBusinessName || '').trim() || beneficiaryName,
      accountLast4: last4,
      ifsc,
      submittedAt: new Date(),
      rejectionReason: '',
      /* A changed bank account needs a NEW fund account. Cleared so the
         create below cannot be skipped by a stale id. */
      razorpayFundAccountId: null,
    };
    await partner.save();

    try {
      /*
       * The CONTACT — who is being paid. Created once and reused for ever:
       * an owner is one person however many times they change bank.
       */
      let contactId = existing.razorpayContactId || null;
      if (!contactId) {
        const contact = await razorpay.createContact({
          name: beneficiaryName,
          phone: partner.phone,
          referenceId: partner.partnerId,
        });
        contactId = contact.id;
        partner.payoutOnboarding.razorpayContactId = contactId;
      }

      /* The FUND ACCOUNT — where their money goes. */
      const fundAccount = await razorpay.createFundAccount({
        contactId,
        method: 'bank_account',
        bankAccount: { name: beneficiaryName, ifsc, accountNumber },
      });

      partner.payoutOnboarding.razorpayFundAccountId = fundAccount.id;
      /*
       * `active` immediately, and that is correct for this rail.
       *
       * Route had an activation step — Razorpay had to approve a sub-merchant
       * before anything could settle — so `submitted` was genuinely not
       * payable. A fund account has no such step: RazorpayX has accepted the
       * beneficiary, and a payout to it will be attempted. Whether the BANK
       * accepts it is answered by the payout, not by onboarding.
       */
      partner.payoutOnboarding.status = 'active';
      partner.payoutOnboarding.activatedAt = new Date();
      partner.payoutOnboarding.lastCheckedAt = new Date();
      await partner.save();

      return res.json({ success: true, data: await describe(partner) });
    } catch (error) {
      console.error('[payout-onboarding] RazorpayX refused:', error.code, error.message);

      /*
       * A refusal RazorpayX authored is the owner's to see and act on — a
       * mistyped IFSC comes back as a real sentence. Anything else (an
       * unconfigured server, a network failure) is ours, and the owner is told
       * we have their details and will carry on.
       */
      const theirFault = error.code === 'RAZORPAYX_CONTACT_FAILED'
        || error.code === 'RAZORPAYX_FUND_ACCOUNT_FAILED';

      if (theirFault) {
        partner.payoutOnboarding.status = 'rejected';
        partner.payoutOnboarding.rejectionReason = String(error.message || '').slice(0, 300);
        await partner.save();
        return fail(res, 400, error.code, error.message);
      }

      return res.status(202).json({
        success: true,
        code: error.code || 'PAYOUTS_UNAVAILABLE',
        message: 'We have your details. Setting up your payout account is taking a moment — '
          + 'we will let you know as soon as it is ready.',
        data: await describe(partner),
      });
    }
  } catch (error) {
    return next(error);
  }
};

// @route  POST /api/v2/partners/payout-onboarding/refresh
// @desc   Retry registering a submitted-but-unregistered owner with RazorpayX
// @access Partner session
const syncStatus = async (req, res, next) => {
  try {
    const partner = req.partner;
    const onboarding = partner.payoutOnboarding;

    /*
     * There is nothing to ASK RazorpayX.
     *
     * Under Route this polled an activation status, because a linked account
     * sat in review. A fund account has no lifecycle: it exists or it does
     * not. So the only useful thing this can do is finish a submission that
     * never reached RazorpayX — the 202 path above — and it says so rather
     * than pretending to check something.
     */
    if (onboarding?.razorpayFundAccountId) {
      if (onboarding.status !== 'active') {
        partner.payoutOnboarding.status = 'active';
        partner.payoutOnboarding.activatedAt = onboarding.activatedAt || new Date();
        await partner.save();
      }
      return res.json({ success: true, data: await describe(partner) });
    }

    if (!onboarding || onboarding.status === 'none') {
      return fail(res, 409, 'NOT_SUBMITTED', 'There are no payout details to check yet.');
    }

    /* Submitted, but RazorpayX never accepted it. The owner has to send the
       details again — we did not keep the account number to retry with. */
    return res.status(202).json({
      success: true,
      code: 'RESUBMIT_REQUIRED',
      message: 'We could not register your account with our payments partner. '
        + 'Please enter your bank details again.',
      data: await describe(partner),
    });
  } catch (error) {
    return next(error);
  }
};

/* ══════════════════════════════════════════════════════════════════════════
   DEVELOPMENT ONLY — mark this owner payable without Razorpay.

   Route is not enabled on the test account yet, so `submitOnboarding` cannot
   produce a real linked account and nothing downstream of it — the Stay
   Partner gate, the held transfer, the admin Withdraw — can be walked through.

   This stamps `active` with an obviously fake account id. It is refused unless
   the SERVER allows it, and the id it writes (`acc_dev_…`) is deliberately
   recognisable so a real payout attempt against it fails loudly at Razorpay
   rather than looking like a genuine account.

   Delete this, its route and the button that calls it once Route is live.
   ══════════════════════════════════════════════════════════════════════════ */
const devActivate = async (req, res, next) => {
  try {
    if (!config.razorpay.devAllowForceCheckIn) {
      return fail(res, 404, 'NOT_FOUND', 'That route does not exist on this server.');
    }

    const partner = req.partner;
    partner.payoutOnboarding = {
      ...(partner.payoutOnboarding ? partner.payoutOnboarding.toObject?.() ?? partner.payoutOnboarding : {}),
      status: 'active',
      /* Fake, and it says so. A payout addressed to it will be refused by
         RazorpayX, which is the correct outcome — this bypasses our gate, not
         their rail. */
      razorpayContactId: partner.payoutOnboarding?.razorpayContactId || `cont_dev_${partner.partnerId}`,
      razorpayFundAccountId: partner.payoutOnboarding?.razorpayFundAccountId || `fa_dev_${partner.partnerId}`,
      legalBusinessName: partner.payoutOnboarding?.legalBusinessName || 'DEV — not a real account',
      beneficiaryName: partner.payoutOnboarding?.beneficiaryName || 'DEV',
      accountLast4: partner.payoutOnboarding?.accountLast4 || '0000',
      activatedAt: new Date(),
      rejectionReason: '',
    };
    await partner.save();

    console.warn(
      `🛠️  [DEV BYPASS] partner ${partner.partnerId} marked payout-active WITHOUT RazorpayX `
      + '(DEV_ALLOW_FORCE_CHECKIN is on). No real fund account exists.',
    );

    return res.json({ success: true, data: await describe(partner) });
  } catch (error) {
    return next(error);
  }
};

module.exports = { getOnboarding, submitOnboarding, syncStatus, devActivate };
