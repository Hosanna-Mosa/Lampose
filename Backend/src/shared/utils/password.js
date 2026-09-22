/* ══════════════════════════════════════════════════════════════════════════
   A password nobody chose, for an account somebody else opened.

   Used where Lampose creates a credential on a person's behalf: a restaurant
   onboarded by a field agent, and the one sent to an owner the moment their
   application is approved. It is not used anywhere a person picks their own.

   ## The alphabet is missing eight characters, and that is the point

   No 0 or O, no 1, l or I. This password is READ OFF A PHONE SCREEN, out of a
   WhatsApp message, and typed into a browser by somebody who did not choose
   it and cannot guess at what they misread. Every one of those pairs is a
   support call, and a support call about a password is one where the only
   remedy is to send another one.

   Punctuation is left out for the same reason — a shop owner typing `#` on an
   Android keyboard is two taps into a symbol page — and because a password
   that travels through a chat message gains nothing from a character class it
   might lose to an autocorrect.

   ## Ten characters of that alphabet

   56 symbols, ten of them: about 58 bits. It is a credential the owner is
   told to replace at their first sign-in, guarded by a login route that is
   rate-limited per IP, and it is stored as bcrypt like every other. The
   length is the knob if that judgement ever changes.

   ## `crypto.randomInt`, not `Math.random`

   Unbiased and drawn from the system CSPRNG. `Math.random()` is neither, and
   a password generator seeded from the clock is the kind of thing nobody
   looks at again for three years.
   ══════════════════════════════════════════════════════════════════════════ */
const crypto = require('crypto');

/* Deliberately without 0/O, 1/l/I — see the header. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

const DEFAULT_LENGTH = 10;

/**
 * A fresh password.
 *
 * @param {number} [length] characters, default 10.
 * @returns {string}
 */
const generatePassword = (length = DEFAULT_LENGTH) => {
  const size = Math.max(6, Math.floor(Number(length) || DEFAULT_LENGTH));
  let out = '';
  for (let i = 0; i < size; i += 1) {
    out += ALPHABET[crypto.randomInt(0, ALPHABET.length)];
  }
  return out;
};

module.exports = { generatePassword, ALPHABET, DEFAULT_LENGTH };
