/* ══════════════════════════════════════════════════════════════════════════
   Refer a customer, not another owner — a second, separate growth loop from
   the one `getReferralInfo`/`withdrawReferral` already run, sharing only the
   wallet the points land in.

   ## Why a code is trustworthy here when a static one would not be

   `createInvite` never mints a code from nothing. It only ever turns an
   ALREADY-PROVEN phone number into a code:

     a fresh guest    the same OTP `GuestVerification` proof the Add Customer
                       form spends on a booking — proof that a real person
                       answered a code sent to that exact number just now.

     an existing one  the `guestPhone` already sitting on a `PartnerBooking`
                       this partner owns, which was proven the same way when
                       that booking was created.

   Either way, the code that comes out is bound to one phone number, and
   `redeemCustomerReferralCode` below checks the customer's own verified
   number against it. A code that leaks — read over someone's shoulder,
   forwarded to the wrong person — is not usable by anyone but the guest it
   was minted for, and it stops being usable at all after `EXPIRY_DAYS`. That
   is the whole difference from the static-per-property code this replaces.

   ## Points, not KYC

   This does not go through the full Add Customer form. It only needs a phone
   proven, not an Aadhar photograph — inviting someone to install an app is a
   much smaller claim than logging a paying guest, and the KYC form's own
   friction (document upload, address, room, dates) has no reason to sit in
   front of it.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const Partner = require('./partner.model');
const Property = require('../properties/property.model');
const GuestVerification = require('./guestVerification.model');
const CustomerReferralCode = require('./customerReferralCode.model');
const { PartnerBooking, PartnerReferral } = require('./partnerDomains.model');
const FoodCoupon = require('../customers/foodCoupon.model');
const { toE164, isIndianMobile } = require('../../infrastructure/twilio/twilio');

const { phoneKey } = Partner;
const digitsOf = (partner) => partner.phoneDigits || phoneKey(partner.phone);

/* No 0/O/1/I — the code is read off a screen and typed back in by hand, on
   the one screen in this app with no autocomplete to save a mistyped
   character. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 7;
const CODE_GEN_ATTEMPTS = 5;

/** Decided with the product: enough time for a guest to actually get around
    to installing the app, short enough that a forgotten or leaked code goes
    stale quickly. */
const EXPIRY_DAYS = 7;

/** What a redeemed invite is worth to the owner — a fifth of an owner↔owner
    referral, reflecting that a customer signup is a smaller win than another
    listing joining the platform. */
const CUSTOMER_REFERRAL_POINTS = 20;

/**
 * The food-order discount a redeemed invite unlocks for the customer.
 *
 * A placeholder figure — nobody has set a real one yet, and this is the one
 * constant in this file worth tuning before this ships to real owners.
 */
const FOOD_COUPON_RUPEES = 100;

const dbDown = (res) => res.status(503).json({
  success: false,
  code: 'DB_DISCONNECTED',
  message: 'The server is running but not connected to the database.',
});

const badInput = (res, message, code = 'BAD_INPUT') => res.status(400).json({
  success: false, code, message,
});

const randomCode = () => {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
};

/** Vanishingly unlikely to collide at this keyspace, but a code that silently
    reused another guest's row would be a serious mixup, so this checks. */
const generateUniqueCode = async () => {
  for (let attempt = 0; attempt < CODE_GEN_ATTEMPTS; attempt += 1) {
    const candidate = randomCode();
    // eslint-disable-next-line no-await-in-loop -- a handful of sequential
    // existence checks against a unique index, not a hot path.
    const exists = await CustomerReferralCode.exists({ code: candidate });
    if (!exists) return candidate;
  }
  return null;
};

// @route   POST /api/v2/partners/invites
// @desc    Mint a one-time, phone-bound invite code for one guest
// @access  Partner session
const createInvite = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);

    const key = digitsOf(req.partner);
    const body = req.body || {};

    let guestName = '';
    let guestPhone = '';
    let propertyId = '';
    let propertyName = '';

    if (body.bookingId) {
      /* Reusing an existing customer — the phone was already proven when this
         booking was created, so no fresh OTP is needed. */
      if (!mongoose.isValidObjectId(body.bookingId)) {
        return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Booking not found.' });
      }
      const booking = await PartnerBooking.findOne({ _id: body.bookingId, partnerPhoneDigits: key });
      if (!booking) {
        return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Booking not found.' });
      }
      guestName = booking.guestName;
      guestPhone = booking.guestPhone;
      propertyId = booking.propertyId;
      propertyName = booking.propertyName;
    } else {
      guestPhone = toE164(body.guestPhone);
      if (!isIndianMobile(guestPhone)) {
        return badInput(res, 'Enter a valid 10-digit Indian mobile number.', 'BAD_PHONE');
      }
      guestName = String(body.guestName || '').trim();

      propertyId = String(body.propertyId || '').trim();
      if (!propertyId) return badInput(res, 'Choose which property this invite is for.');
      if (!mongoose.isValidObjectId(propertyId)) return badInput(res, 'That property could not be found.');

      const property = await Property.findById(propertyId);
      if (!property) return badInput(res, 'That property could not be found.');
      if (phoneKey(property.ownerMobile) !== key) {
        return res.status(403).json({
          success: false, code: 'FORBIDDEN', message: 'That property is not linked to your account.',
        });
      }
      propertyName = property.name;

      /* Looked up, never believed — same rule `createBooking` follows for the
         same reason: this is the row the server wrote when a code IT
         generated came back correct, for THIS owner and THIS number. */
      const proof = await GuestVerification.findOne({
        partnerPhoneDigits: key,
        guestPhone,
        verifiedAt: { $ne: null },
      });
      if (!proof) {
        return res.status(409).json({
          success: false,
          code: 'GUEST_NOT_VERIFIED',
          message: 'Send a code to the guest and have them read it back before generating an invite.',
        });
      }

      /* Spent. Leaving it would let a second invite (or a booking) be minted
         off one verification. */
      await GuestVerification.deleteOne({ _id: proof._id });
    }

    const code = await generateUniqueCode();
    if (!code) {
      return res.status(500).json({
        success: false, code: 'CODE_GEN_FAILED', message: 'Could not generate a code. Please try again.',
      });
    }

    const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    const invite = await CustomerReferralCode.create({
      code,
      partnerPhoneDigits: key,
      propertyId: String(propertyId),
      propertyName,
      guestName,
      guestPhone,
      expiresAt,
    });

    return res.status(201).json({
      success: true,
      data: { ...invite.toObject(), id: String(invite._id) },
    });
  } catch (error) {
    return next(error);
  }
};

// @route   GET /api/v2/partners/invites
// @desc    Every invite this partner has minted, and its live status
// @access  Partner session
const getInvites = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    const key = digitsOf(req.partner);
    const invites = await CustomerReferralCode.find({ partnerPhoneDigits: key }).sort({ createdAt: -1 }).lean();

    const now = new Date();
    const data = invites.map((inv) => ({
      ...inv,
      id: String(inv._id),
      status: inv.usedAt ? 'redeemed' : (inv.expiresAt <= now ? 'expired' : 'pending'),
    }));

    return res.json({ success: true, count: data.length, data });
  } catch (error) {
    return next(error);
  }
};

/**
 * Applies a customer-referral code at signup. Called from
 * `customers/customer.controller.js#verifyAuth`, after the OTP is confirmed —
 * so `customer.phone` here is always a number that has just proven itself.
 *
 * Mutates `customer` in memory (`referredByProperty`, `referredAt`) but does
 * NOT save it — `verifyAuth` saves once, along with whatever else it wrote
 * from the same request, rather than this function taking a second trip.
 *
 * Never throws for an ordinary bad code. A referral is a bonus on top of
 * signing up, not a gate on it: every reason this can fail is reported back
 * as a `status` string so the app can tell the customer what happened,
 * without the account creation itself failing alongside it.
 */
const redeemCustomerReferralCode = async (rawCode, customer) => {
  const code = String(rawCode || '').trim().toUpperCase();
  if (!code) return null;

  if (customer.referredByProperty) return { status: 'already_referred' };

  const invite = await CustomerReferralCode.findOne({ code });
  if (!invite) return { status: 'invalid' };
  if (invite.usedAt) return { status: 'used' };
  if (invite.expiresAt <= new Date()) return { status: 'expired' };

  /* The one check that makes a leaked code harmless: only the exact phone it
     was issued to can redeem it. */
  if (invite.guestPhone !== customer.phone) return { status: 'phone_mismatch' };

  invite.usedAt = new Date();
  invite.usedByCustomerId = customer.customerId;
  await invite.save();

  customer.referredByProperty = invite.propertyId;
  customer.referredAt = new Date();

  /* The wallet is shared with the owner↔owner referral program — one balance,
     one withdraw flow — so this is an $inc/$push onto the same document
     `getReferralInfo` reads, told apart from an owner referral by `type` on
     the history entry. Upserted, because a partner whose first-ever referral
     is a customer invite (rather than a visit to the Refer & Earn screen)
     would otherwise have no PartnerReferral document to credit yet. */
  await PartnerReferral.findOneAndUpdate(
    { partnerPhoneDigits: invite.partnerPhoneDigits },
    {
      $setOnInsert: { code: `PAR-${invite.partnerPhoneDigits.slice(-4)}` },
      $inc: {
        points: CUSTOMER_REFERRAL_POINTS,
        earningsRupees: CUSTOMER_REFERRAL_POINTS,
        invitedCount: 1,
      },
      $push: {
        history: {
          name: customer.name || invite.guestName || 'A new customer',
          date: new Date().toISOString().slice(0, 10),
          status: 'Joined',
          rewardPoints: CUSTOMER_REFERRAL_POINTS,
          type: 'customer',
          propertyName: invite.propertyName,
        },
      },
    },
    { upsert: true },
  );

  /* One coupon per customer — a referral that lands on a customer who already
     has one (edge case: two invites, the first one redeemed already) leaves
     the existing coupon exactly as it is rather than overwriting its value or
     resetting `status` back to `active`. */
  await FoodCoupon.findOneAndUpdate(
    { customerId: customer.customerId },
    {
      $setOnInsert: {
        customerId: customer.customerId,
        amountRupees: FOOD_COUPON_RUPEES,
        source: 'referral',
        propertyId: invite.propertyId,
        propertyName: invite.propertyName,
        status: 'active',
      },
    },
    { upsert: true },
  );

  return { status: 'applied', propertyName: invite.propertyName, discountRupees: FOOD_COUPON_RUPEES };
};

module.exports = {
  createInvite,
  getInvites,
  redeemCustomerReferralCode,
  CUSTOMER_REFERRAL_POINTS,
  FOOD_COUPON_RUPEES,
};
