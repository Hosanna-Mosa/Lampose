/* ══════════════════════════════════════════════════════════════════════════
   The team's WhatsApp answer to a stay request the owner never answered.

   A fourth flow on the one webhook (verification.routes.js), told apart the
   same way the others are — by vocabulary and by sender, never by route:

     · a tapped quick reply carries STAY_HELP_YES:<id> / STAY_HELP_NO:<id>;
     · a typed reply is AVAILABLE / UNAVAILABLE (or NOT AVAILABLE), optionally
       followed by the six-character reference the message gave.

   Only a number on STAY_HELP_TEAM_NUMBERS can answer. A typed word from
   anybody else, or from a team member with nothing waiting, returns null and
   the message falls through to the owner availability and verification
   flows with its meaning unchanged — an owner replying AVAILABLE to a
   website visit request is still theirs.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const { getStayHelpTeamNumbers, formatWhatsAppNumber } = require('../../infrastructure/twilio/twilio');
const { teamAnswer, findTeamHelpRequest, teamReference } = require('./stayRequest.service');
const {
  notifyStudentAccepted, notifyStudentDeclined, notifyOwnerOfTeamConfirmation,
} = require('../notifications/stayRequest.notifier');

const PAYLOAD_RE = /^STAY_HELP_(YES|NO):([a-f0-9]{24})$/i;
/* "not available" / "unavailable" first — "available" is inside both. */
const TYPED_RE = /^\s*(not\s*available|unavailable|available)\b[\s:#-]*([a-z0-9]{6})?\s*$/i;

const fireAndForget = (promise) => {
  Promise.resolve(promise).catch((error) => console.error('[stay-help] notification failed:', error.message));
};

/**
 * @returns {Promise<string|null>} the reply to send the team member, or null
 *          when this message is not a stay-help answer.
 */
const handleStayHelpReply = async ({ from, body, buttonPayload }) => {
  if (mongoose.connection.readyState !== 1) return null;

  const sender = formatWhatsAppNumber(from);
  const team = getStayHelpTeamNumbers();
  const payload = PAYLOAD_RE.exec(String(buttonPayload || '').trim());
  const typed = payload ? null : TYPED_RE.exec(String(body || ''));
  if (!payload && !typed) return null;

  const onTeam = Boolean(sender) && team.includes(sender);
  if (!onTeam) {
    /* A stay-help button can only have been sent to the team; anybody else
       pressing one is told so. A typed word is somebody else's flow. */
    return payload ? 'This number is not on the Lampose stay-help team, so the answer was not recorded.' : null;
  }

  let requestId;
  let available;
  if (payload) {
    available = payload[1].toUpperCase() === 'YES';
    requestId = payload[2];
  } else {
    available = !/^(not|un)/i.test(typed[1].trim());
    const { match, waiting } = await findTeamHelpRequest(typed[2]);
    if (!match) {
      /* Nothing waiting at all: not ours — let the owner flows have it. */
      if (!waiting) return null;
      return typed[2]
        ? `No stay-help request is waiting with the reference ${typed[2].toUpperCase()}.`
        : `${waiting} stay-help requests are waiting — please reply with the reference, e.g. AVAILABLE ABC123.`;
    }
    requestId = match._id;
  }

  const outcome = await teamAnswer(requestId, { available, answeredBy: sender });

  if (!outcome.request) {
    const current = outcome.current;
    if (!current) return 'That request no longer exists.';
    const said = current.teamHelp && current.teamHelp.status;
    if (said === 'available' || said === 'unavailable') {
      return `Already answered: ${current.propertyName} was marked ${said.toUpperCase()}`
        + `${current.teamHelp.answeredBy ? ` by ${current.teamHelp.answeredBy.replace('whatsapp:', '')}` : ''}.`;
    }
    return `That request (${teamReference(current)}) is no longer waiting on the team.`;
  }

  const { request, autoDeclined = [] } = outcome;
  if (available) {
    if (request.payment && request.payment.required && request.payment.status !== 'paid') {
      const { ensurePaymentLink } = require('./visitPayment.controller');
      await ensurePaymentLink(request).catch((error) => {
        console.error('[stay-help] payment link failed:', error.message);
      });
    }
    fireAndForget(notifyStudentAccepted(request));
    fireAndForget(notifyOwnerOfTeamConfirmation(request));
    for (const lost of autoDeclined) fireAndForget(notifyStudentDeclined(lost));
  } else {
    fireAndForget(notifyStudentDeclined(request));
  }

  const student = (request.customer && request.customer.name) || 'The student';
  return available
    ? `Recorded: ${request.propertyName} is AVAILABLE. ${student}'s request is confirmed and they have been told.`
    : `Recorded: ${request.propertyName} is UNAVAILABLE. ${student} has been told.`;
};

module.exports = { handleStayHelpReply };
