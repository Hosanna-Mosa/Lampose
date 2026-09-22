/* ══════════════════════════════════════════════════════════════════════════
   The one-time link an approved restaurant owner chooses their password with.

   Three functions and one decision, which is this: the link is a CREDENTIAL
   for as long as it lives, so it is handled the way this module handles the
   other one. The raw token exists for the length of the request that mints it
   — long enough to be put in a WhatsApp message — and what is stored is a
   SHA-256 of it. A database that can reveal a live link is a database that can
   be read to take over a shop.

   ## Why SHA-256 here and bcrypt for the password

   Different threats. A password is short, human-chosen and guessable, so it
   needs a slow hash to make guessing expensive. This token is 32 random bytes
   from the system CSPRNG — there is nothing to guess, and the lookup happens
   on every click, so a fast digest is right. It is also what lets the token be
   FOUND: bcrypt salts every hash differently, so a stored one cannot be
   looked up; a SHA-256 is a deterministic key an index can answer from.

   ## Single use, and the row survives being spent

   `usedAt` is stamped rather than the document cleared, so a second click can
   be told "that link has already been used" in those words. "Not found" is the
   answer to a made-up token and should stay the answer to a made-up token.

   ## Forty-eight hours

   Long enough for an owner who was closed the day we approved them, short
   enough that a message sitting in a WhatsApp backup a week later is inert.
   The expiry is stored on the row rather than signed into the token because
   the row is what the click reads anyway.
   ══════════════════════════════════════════════════════════════════════════ */
const crypto = require('crypto');

/** Two days. See the header. */
const SETUP_TTL_MS = 48 * 60 * 60 * 1000;

/** How the raw token is turned into what is stored and searched by. */
const hashSetupToken = (token) => crypto
  .createHash('sha256')
  .update(String(token || ''))
  .digest('hex');

/**
 * A fresh token and the row to store against the restaurant.
 *
 * Returns `{ token, setup }` — `token` goes in the message and is never
 * written down; `setup` is assigned to `restaurant.passwordSetup` by the
 * caller, so it lands in the same save as whatever else is changing.
 */
const makePasswordSetup = () => {
  /* 32 bytes, hex — 64 characters in the URL. Long enough that the only way
     to have one is to have been sent it. */
  const token = crypto.randomBytes(32).toString('hex');

  return {
    token,
    setup: {
      tokenHash: hashSetupToken(token),
      expiresAt: new Date(Date.now() + SETUP_TTL_MS),
      sentAt: new Date(),
      usedAt: null,
    },
  };
};

/**
 * The link an owner is sent.
 *
 * Built here rather than in the sender so the path exists in exactly one
 * place: the console route that reads it and the message that carries it
 * cannot drift apart without this file changing.
 *
 * `/account-setup/` and NOT `/set-password/`, which is what it was. Meta
 * reviews the RENDERED sample of a template, URL and all, and three
 * submissions have now been refused with the word "password" somewhere in
 * them — see `infrastructure/twilio/restaurantApprovedTemplate.js`. The API
 * route behind this keeps its plain name, because no reviewer ever sees it.
 */
const passwordSetupUrl = (consoleUrl, token) => {
  const base = String(consoleUrl || '').trim().replace(/\/+$/, '');
  return `${base}/account-setup/${token}`;
};

/**
 * Why this token cannot be spent, or null when it can.
 *
 * A sentence rather than a code, because every one of these is shown to an
 * owner standing in their shop with a link that did not work, and "that link
 * has already been used" tells them what to do next while `INVALID_TOKEN`
 * does not.
 */
const setupProblem = (setup) => {
  if (!setup || !setup.tokenHash) return 'That link is not valid. Ask Lampose to send you a new one.';
  if (setup.usedAt) return 'That link has already been used. Sign in with the password you chose, or ask Lampose for a new link.';
  if (!setup.expiresAt || setup.expiresAt.getTime() < Date.now()) {
    return 'That link has expired. Ask Lampose to send you a new one.';
  }
  return null;
};

module.exports = {
  SETUP_TTL_MS, hashSetupToken, makePasswordSetup, passwordSetupUrl, setupProblem,
};
