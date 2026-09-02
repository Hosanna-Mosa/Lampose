/* ══════════════════════════════════════════════════════════════════════════
   Telling a rider what an administrator decided about them.

   Onboarding ends with a person in the admin console reading a licence and
   pressing a button, and `driver/app/onboarding.tsx` says so in as many words:
   "You will be notified the moment you are approved — usually within 24
   hours". Nothing sent that notification. `decideDriver` and `decideDocument`
   saved the verdict and answered the console; the rider found out by opening
   the app and pulling to refresh, which is a thing nobody does to an app they
   have been told to wait for. Somebody approved at 2pm could be on the road at
   2pm and instead waited until the evening.

   ## Why this is beside `dispatch.notifier.js` rather than inside it

   That file wakes "the three people an order concerns" and every function in
   it names an order. These name none: an approval is about an ACCOUNT, it
   happens once, and it is the only message in the product that arrives when a
   rider has no work and no session activity at all. Folding them together
   would put a `driverId`-only payload in a file whose whole shape is
   `orderNumber`.

   ## Both transports, for the same reason as an order alert

   The socket reaches the phone that is already open on the "we are reviewing
   your documents" screen — which is exactly where a rider waiting for this
   sits — and it needs nothing but the session the app holds. The push reaches
   the phone in a pocket, which is where it is during the other twenty-three
   hours. Neither is a duplicate of the other and neither is sufficient.

   ## The channel is the Driver app's, and there are only two of them

   `driver/services/offerAlerts.ts` creates exactly `delivery-offers` and
   `delivery-updates`. On Android 8 and later a notification sent to a channel
   the app never created is not reliably shown, so an account decision goes out
   on `JOB_CHANNEL` — the quieter of the two — rather than on a third id that
   exists only on this side. An offer expires in fifteen seconds and must ring
   through Do Not Disturb; being approved does not.

   ## Failure is logged, never thrown

   The same rule as the two notifiers either side of it, and the sharp reason
   here is the admin console: a decision is COMMITTED before any of this runs,
   and an exception escaping this file would answer an approver an error for a
   thing that already happened, whose only remedy is pressing the button again
   on a rider who is already approved.
   ══════════════════════════════════════════════════════════════════════════ */
const { sendPush, pushReady, pushConfigProblem } = require('../../infrastructure/push/push');
const realtime = require('../../infrastructure/realtime/realtime');
const Driver = require('./driver.model');
const { JOB_CHANNEL } = require('./dispatch.notifier');

const { DOCUMENT_LABELS } = Driver;

const BADGE = '🛵 [drivers/account]';

/**
 * Send to every handset this rider has registered, and never throw.
 *
 * Deliberately a copy of the shape `dispatch.notifier.js` uses rather than an
 * import of it: that one is private to the dispatch flow and the two report
 * different things. What IS imported is the channel id, because a second
 * definition of that string is a silent notification on Android.
 */
const ring = async (driverId, message, label) => {
  const result = { attempted: 0, sent: 0, failed: 0, reason: null };
  try {
    if (!pushReady()) {
      result.reason = pushConfigProblem() || 'push is not configured';
      return result;
    }

    const row = await Driver.findOne({ driverId }).select('devices').lean();
    const tokens = (row?.devices || []).map((device) => device.token).filter(Boolean);
    result.attempted = tokens.length;

    if (!tokens.length) {
      /* Ordinary rather than a fault: a rider who refused notification
         permission, or who signed up on a simulator, has no token and still
         has to be able to be approved. The socket and the next app open are
         the other two ways they find out. */
      result.reason = 'no handset is registered';
      return result;
    }

    const outcome = await sendPush(tokens, message);
    result.sent = outcome?.sent ?? 0;
    result.failed = outcome?.failed ?? 0;
  } catch (error) {
    /* Deliberately swallowed — see the header. */
    result.reason = error.message;
    console.error(`${BADGE} [${label}] push failed: ${error.message}`);
  }
  return result;
};

/**
 * Push the phone in the pocket and wake the screen that is already open.
 *
 * The socket goes first and outside the push's `pushReady()` guard, the same
 * ordering and the same reason as `foodOrder.notifier.js`: a deployment with
 * no Expo credentials still has a working socket, and returning early on a
 * missing push config would tell a waiting rider nothing at all.
 */
const announce = async (driverId, event, payload, message, label) => {
  try {
    realtime.toDriver(driverId, event, payload);
  } catch (error) {
    /* Socket.io absent, or nobody in the room. The push and the next app open
       both still stand. */
    console.warn(`${BADGE} [${label}] live emit failed: ${error.message}`);
  }

  const result = await ring(driverId, message, label);
  console.log(
    `${BADGE} [${label}] ${driverId}`
    + `${result.sent ? ` → ${result.sent}/${result.attempted} handset(s)` : ` · ${result.reason || 'not sent'}`}`,
  );
  return result;
};

/**
 * "You are approved" / "We cannot take you on" / "Your account is on hold".
 *
 * One function for all four verdicts because they are one event to the rider —
 * the answer about their account — and three near-identical functions would be
 * three places for the copy to drift.
 *
 * `previous` is taken because lifting a suspension arrives here as `approved`
 * and "your account has been approved" is the wrong sentence for somebody who
 * was approved a month ago and has spent a week off the road. The reason the
 * administrator typed is carried verbatim; `decideDriver` refuses every
 * non-approval without one precisely so there is something to carry, and this
 * is the delivery that makes that refusal mean anything.
 */
async function notifyDriverOfDecision(driver, { previous = '', reason = '' } = {}) {
  const status = driver.status;
  const said = String(reason || '').trim();

  const copy = (() => {
    if (status === 'approved') {
      return previous === 'suspended'
        ? {
          title: 'You are back on the road ✅',
          body: 'The hold on your account has been lifted. Go online whenever you are ready.',
        }
        : {
          title: 'You are approved 🎉',
          body: 'Your account has been verified. Go online to start taking deliveries.',
        };
    }
    if (status === 'suspended') {
      return {
        title: 'Your account is on hold',
        body: said
          ? `${said} — open Support in the app if you want to discuss it.`
          : 'Open Support in the app to find out more.',
      };
    }
    return {
      title: 'We could not approve your account',
      body: said
        ? `${said} — open Support in the app if you think this is wrong.`
        : 'Open Support in the app if you think this is wrong.',
    };
  })();

  return announce(
    driver.driverId,
    'account_decision',
    {
      status,
      previous: previous || '',
      reason: said,
      /* Whether the duty switch will let them on. The app already derives this
         from the profile it re-reads; sending it means a screen that is open
         does not have to wait for that read to say the right thing. */
      canGoOnline: status === 'approved',
      at: new Date().toISOString(),
    },
    {
      ...copy,
      data: { kind: 'driver_account', status, driverId: driver.driverId },
      sound: 'default',
      channelId: JOB_CHANNEL,
      priority: 'high',
    },
    `decision-${status}`,
  );
}

/**
 * "That photograph will not do, and here is why."
 *
 * The live event goes out for BOTH verdicts, because an open documents screen
 * showing a stale "under review" tick is the thing this whole file exists to
 * stop, and a socket frame costs nothing.
 *
 * The PUSH is sent on a refusal only. Five documents verified one at a time is
 * five buzzes for news the rider cannot act on, and an app that buzzes about
 * nothing is an app whose next notification — the approval — gets swiped away
 * unread. A refusal is different: it is the one message that asks them to do
 * something, and it names which photograph.
 */
async function notifyDriverOfDocumentDecision(driver, kind, { status, reason = '' } = {}) {
  const label = DOCUMENT_LABELS[kind] || 'document';
  const said = String(reason || '').trim();

  const payload = {
    kind,
    label,
    status,
    reason: said,
    at: new Date().toISOString(),
  };

  if (status !== 'rejected') {
    try {
      realtime.toDriver(driver.driverId, 'document_decision', payload);
    } catch (error) {
      console.warn(`${BADGE} [document-${status}] live emit failed: ${error.message}`);
    }
    return { attempted: 0, sent: 0, failed: 0, reason: 'verified documents are not pushed' };
  }

  return announce(
    driver.driverId,
    'document_decision',
    payload,
    {
      title: `${label} needs another photo`,
      /* The approver's own sentence, not a summary of it. `decideDocument`
         refuses a rejection with no reason on the grounds that the rider is
         shown it — this is where they are shown it. */
      body: said || 'Please send a clearer photograph of this document.',
      data: { kind: 'driver_document', document: kind, driverId: driver.driverId },
      sound: 'default',
      channelId: JOB_CHANNEL,
      priority: 'high',
    },
    'document-rejected',
  );
}

module.exports = {
  notifyDriverOfDecision,
  notifyDriverOfDocumentDecision,
};
