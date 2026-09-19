const { PartnerReferral } = require('./partnerDomains.model');

/**
 * Generates a unique, name-based referral code for a property owner.
 * Example: Name "Anjali Sharma" + Phone ending in "4821" -> "ANJALI4821"
 * If "ANJALI4821" is already taken, appends random digits e.g. "ANJALI9634".
 * If name is empty/missing, uses "PAR" + phone digits e.g. "PAR4821".
 */
const generateUniquePartnerCode = async (name, partnerPhoneDigits) => {
  let prefix = 'PAR';
  if (name && typeof name === 'string' && name.trim()) {
    const firstName = name.trim().split(/\s+/)[0].replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (firstName.length >= 2) {
      prefix = firstName.slice(0, 10);
    }
  }

  const phoneDigits = partnerPhoneDigits ? String(partnerPhoneDigits).replace(/\D/g, '') : '';
  const phoneSuffix = phoneDigits.length >= 4 ? phoneDigits.slice(-4) : '';
  let candidate = phoneSuffix ? `${prefix}${phoneSuffix}` : `${prefix}${Math.floor(1000 + Math.random() * 9000)}`;

  // Check if candidate code is already in use by ANOTHER partner
  const existing = await PartnerReferral.findOne({ code: candidate }).lean();
  if (!existing || existing.partnerPhoneDigits === phoneDigits) {
    return candidate;
  }

  // Loop with random 4-digit numbers until a unique candidate is found
  for (let attempt = 0; attempt < 15; attempt += 1) {
    const randomSuffix = Math.floor(1000 + Math.random() * 9000).toString();
    candidate = `${prefix}${randomSuffix}`;
    // eslint-disable-next-line no-await-in-loop
    const check = await PartnerReferral.findOne({ code: candidate }).lean();
    if (!check || check.partnerPhoneDigits === phoneDigits) {
      return candidate;
    }
  }

  return `${prefix}${Date.now().toString().slice(-4)}`;
};

/**
 * Redeems an owner-to-owner referral code during partner signup / profile setup.
 * Credits the referring owner with +100 Points (₹100).
 */
const redeemOwnerReferralCode = async (rawCode, newPartner) => {
  const code = String(rawCode || '').trim().toUpperCase();
  if (!code) return { status: 'none' };

  if (newPartner.referredByPartner) {
    return { status: 'already_referred' };
  }

  const referringRef = await PartnerReferral.findOne({ code });
  if (!referringRef) {
    return { status: 'invalid' };
  }

  const newPartnerPhoneDigits = newPartner.phoneDigits || String(newPartner.phone || '').replace(/\D/g, '').slice(-10);

  // An owner cannot refer themselves
  if (referringRef.partnerPhoneDigits === newPartnerPhoneDigits) {
    return { status: 'self_referral' };
  }

  const OWNER_REFERRAL_POINTS = 100;
  const today = new Date().toISOString().slice(0, 10);

  // Credit referring partner's wallet
  await PartnerReferral.findOneAndUpdate(
    { partnerPhoneDigits: referringRef.partnerPhoneDigits },
    {
      $inc: {
        points: OWNER_REFERRAL_POINTS,
        earningsRupees: OWNER_REFERRAL_POINTS,
        invitedCount: 1,
      },
      $push: {
        history: {
          name: newPartner.name || 'Property Owner',
          date: today,
          status: 'Joined',
          rewardPoints: OWNER_REFERRAL_POINTS,
          type: 'owner',
          propertyName: newPartner.businessName || 'Hostel/PG',
        },
      },
    },
  );

  newPartner.referredByPartner = referringRef.partnerPhoneDigits;
  await newPartner.save();

  return { status: 'applied', rewardPoints: OWNER_REFERRAL_POINTS };
};

module.exports = {
  generateUniquePartnerCode,
  redeemOwnerReferralCode,
};
