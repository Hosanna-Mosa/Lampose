/* ══════════════════════════════════════════════════════════════════════════
   Waking a phone, through Expo.

   ## Why Expo and not FCM directly

   Both apps are Expo, and Expo's push service is the one thing that talks to
   FCM and APNs from a single call with a single token format. Going direct
   would mean a service-account JSON for Android, a signing key for iOS, two
   payload shapes and two failure modes — for a product that has one kind of
   notification. Expo's endpoint needs no credentials at all for development,
   and in production it needs FCM credentials uploaded to the Expo project
   rather than held here.

   ## Nothing here exits the process, and nothing here throws

   Same rule as the SMS and Twilio modules: a missing integration degrades to a
   named failure on the affected call and leaves everything else serving. A
   push that did not arrive must never look like a database that is down, and
   must never roll back a state transition that already committed — the
   student's request IS accepted whether or not their handset buzzed.

   So every function returns `{ sent, failed, problem }` and none of them
   reject. Callers log; they do not branch on it.

   ## Tokens are not credentials

   An Expo push token identifies a device installation, and anybody holding
   one can send that device a notification through Expo. That is why
   `registerDeviceToken` is behind a session and stores the token against the
   account rather than accepting one on a public route — and why a token is
   dropped the moment Expo reports it invalid, rather than being retried
   forever against a handset that has been wiped.
   ══════════════════════════════════════════════════════════════════════════ */
const config = require('../../config/env');

const EXPO_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

/* Expo accepts up to 100 messages per call. Batched rather than looped
   because the auto-decline sweep can notify a dozen students at once and a
   dozen round trips would be a dozen chances to be rate limited. */
const BATCH = 100;

/** The shape Expo issues. Anything else is a client sending us junk. */
const isExpoToken = (token) => typeof token === 'string'
  && /^Expo(nent)?PushToken\[[^\]]+\]$/.test(token.trim());

/**
 * Which piece is missing, named — or null when there is nothing missing.
 *
 * Expo's send endpoint needs no key for development builds, so "not
 * configured" here means something narrower than it does for SMS: only a
 * disabled flag or a missing access token when one is required for the
 * project. It is a function rather than a constant so a deployment can turn
 * push off without a code change.
 */
const pushConfigProblem = () => {
  if (config.push && config.push.enabled === false) return 'PUSH_ENABLED is false.';
  return null;
};

const pushReady = () => !pushConfigProblem();

/**
 * Send one message to many devices.
 *
 * `tokens` is whatever was stored against an account — expired ones, tokens
 * from an uninstalled app, and junk are all expected, and are reported back
 * in `invalid` so the caller can drop them. That pruning is the only reason
 * this returns anything at all.
 */
async function sendPush(tokens, { title, body, data = {} } = {}) {
  const problem = pushConfigProblem();
  if (problem) return { sent: 0, failed: 0, invalid: [], problem };

  const valid = [...new Set((tokens || []).filter(isExpoToken))];
  if (!valid.length) return { sent: 0, failed: 0, invalid: [], problem: null };

  const messages = valid.map((to) => ({
    to,
    title,
    body,
    /* Everything the app needs to deep-link straight to the screen. With a
       three-minute deadline an extra tap is a meaningful fraction of the
       window, so the payload carries the request id rather than making the
       app go and find it. */
    data,
    sound: 'default',
    /* Android needs a channel to show anything at all on 8+; the apps create
       one with this id. High priority because the whole point is that it
       arrives while somebody can still act on it. */
    channelId: 'stay-requests',
    priority: 'high',
    /* Pointless after the deadline. Expo drops it rather than delivering a
       countdown that finished while the handset was off. */
    ttl: config.booking.expiryMinutes * 60,
  }));

  let sent = 0;
  let failed = 0;
  const invalid = [];

  for (let i = 0; i < messages.length; i += BATCH) {
    const batch = messages.slice(i, i + BATCH);
    try {
      const response = await fetch(EXPO_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          ...(config.push && config.push.accessToken
            ? { Authorization: `Bearer ${config.push.accessToken}` }
            : null),
        },
        body: JSON.stringify(batch),
        /* A phone waiting on a three-minute answer cannot wait ten seconds
           for a push gateway. The transition is already recorded; a slow
           gateway must not hold the HTTP response open behind it. */
        signal: AbortSignal.timeout(config.push ? config.push.timeoutMs : 8000),
      });

      if (!response.ok) {
        failed += batch.length;
        continue;
      }

      const payload = await response.json();
      const tickets = Array.isArray(payload.data) ? payload.data : [];

      tickets.forEach((ticket, index) => {
        if (ticket && ticket.status === 'ok') { sent += 1; return; }
        failed += 1;
        /* The one error worth acting on: the app was uninstalled, or the
           token was reissued. Retrying it forever is how a token list grows
           into a permanent source of failed sends. */
        if (ticket && ticket.details && ticket.details.error === 'DeviceNotRegistered') {
          invalid.push(batch[index].to);
        }
      });
    } catch (error) {
      failed += batch.length;
      /* Logged, not thrown. See the header: a push that did not arrive is not
         a reason to fail the request that caused it. */
      console.error('[push] send failed:', error.message);
    }
  }

  return { sent, failed, invalid, problem: null };
}

module.exports = { sendPush, isExpoToken, pushConfigProblem, pushReady, EXPO_ENDPOINT };
