/* ══════════════════════════════════════════════════════════════════════════
   One-time codes for the visit-request (availability) flow.

   The code itself is never stored. What goes in the database is a salted
   SHA-256 of it, compared in constant time — a dump of `visitrequests` must
   not hand anyone a working code for a request that is still open.

   The validity window is ten minutes because that is what the DLT-registered
   SMS body promises ("Valid for 10 minutes"). The registered text cannot be
   changed on a whim, so this follows it rather than the other way round.
   ══════════════════════════════════════════════════════════════════════════ */
const crypto = require('crypto');

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_RESENDS = 3;

/* A pepper, so a stolen database alone is not enough to brute-force a
   six-digit code offline. Falls back to secrets the process already holds,
   and finally to a per-boot random value, which simply invalidates
   outstanding codes on restart.

   Resolved on first use rather than at require time: config/env.js loads
   dotenv, and a module required before it would otherwise capture an empty
   environment and silently fall through to the random value. */
const BOOT_FALLBACK = crypto.randomBytes(32).toString('hex');
let pepper = null;

const getPepper = () => {
  if (pepper === null) {
    pepper = process.env.OTP_PEPPER
      || process.env.TWILIO_AUTH_TOKEN
      || process.env.JWT_SECRET
      || BOOT_FALLBACK;
  }
  return pepper;
};

/** Six digits, uniformly distributed, from a cryptographic source. */
const generateOtp = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');

const newSalt = () => crypto.randomBytes(16).toString('hex');

const hashOtp = (otp, salt) => crypto
  .createHash('sha256')
  .update(`${salt}:${otp}:${getPepper()}`)
  .digest('hex');

/** Constant-time compare, so timing cannot leak how much of a code was right. */
const verifyOtp = (otp, salt, expectedHash) => {
  if (!otp || !salt || !expectedHash) return false;
  const actual = Buffer.from(hashOtp(otp, salt));
  const expected = Buffer.from(expectedHash);
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
};

/**
 * The entry PIN, issued when a request is confirmed.
 *
 * Not a credential. It proves nothing to the server and is stored in readable
 * form on purpose — it is a token the student and the owner COMPARE at the
 * door, so both sides hold the same value and the owner must be able to be
 * shown it again if they lose the message. Hashing it would only make it
 * impossible to do the one thing it exists for.
 *
 * `LV-` prefixed and six digits, matching what the website's flow has issued
 * since it was written; an owner with both flows running sees one format.
 */
const generateEntryPin = () => `LV-${String(crypto.randomInt(0, 1000000)).padStart(6, '0')}`;

module.exports = {
  generateEntryPin,
  OTP_TTL_MS,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_MS,
  OTP_MAX_RESENDS,
  generateOtp,
  newSalt,
  hashOtp,
  verifyOtp,
};
