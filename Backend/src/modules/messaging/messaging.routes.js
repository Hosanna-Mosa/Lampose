/* ══════════════════════════════════════════════════════════════════════════
   Admin console → "Messages" page: an admin sends an ad-hoc WhatsApp message
   from the same Twilio number every automated flow in this backend already
   uses. Two things live here:

     GET  /templates   which Content Template SIDs are configured, so the UI
                        can offer them without hardcoding secrets client-side
     POST /send         actually sends, free text or a template

   Free text only reaches a recipient inside an open 24-hour WhatsApp
   session — the recipient must have messaged the Twilio number first, or
   Twilio/Meta reject it. That is reported back as an ordinary failure, not
   a crash.

   A Content Template is deliverable cold, but every template configured
   below was approved for a SPECIFIC automated flow (owner verification,
   visit availability, …) and several carry quick-reply buttons whose
   payload is a document id (VERIFY_YES:<id> etc.) that flow's webhook looks
   up. Sending one here with no matching id, or to a number with no request
   behind it, delivers a message whose buttons resolve to "not found"
   instead of doing anything useful. This route does not pretend otherwise
   and does not enforce a variable schema per template — it is a thin,
   honest wrapper over client.messages.create with informational hints only,
   meant for manual resends/testing by someone who knows the flow, not a
   second business process of its own.

   Guarded by the console's own login (verifyAdminToken) rather than left
   open like most of the v1 admin surface — this spends real money and
   reaches real people, which the read/write CRUD routes elsewhere in v1
   don't.
   ══════════════════════════════════════════════════════════════════════════ */
const express = require('express');

const router = express.Router();
const verifyAdminToken = require('../analytics/verifyAdminToken.middleware');
const { sendAdminMessage, toE164 } = require('../../infrastructure/twilio/twilio');

router.use(verifyAdminToken);

/* [env var, friendly label, one-line hint on the numbered variables]. Hints
   are informational only — see the header above for why nothing here
   enforces them. */
const TEMPLATE_REGISTRY = [
  ['TWILIO_VERIFY_CONTENT_SID', 'Owner verification request',
    '1 owner name · 2 property · 3 address · 4 stay options · 5 mess/food · 6 owner mobile · 7 amenities · 8 verification request ID (Accept/Reject buttons need a real one from Verifications)'],
  ['TWILIO_TEAM_CONTENT_SID', 'Verifier request',
    '1 owner name · 2 owner mobile · 3 property · 4 address · 5 maps link · 6 review link · 7 verification request ID'],
  ['TWILIO_VISIT_REQUEST_V3_CONTENT_SID', 'Visit request (with address)',
    '1 owner name · 2 property · 3 address · 4 customer · 5 selection summary · 6 joining date · 7 visit request ID'],
  ['TWILIO_VISIT_REQUEST_CONTENT_SID', 'Visit request',
    '1 owner name · 2 property · 3 customer · 4 room · 5 when · 6 visit request ID'],
  ['TWILIO_VISIT_OUTCOME_CONTENT_SID', 'Visit outcome to customer',
    '1 customer name · 2 property · 3 "available" or "not available"'],
  ['TWILIO_VISIT_CONFIRM_CUSTOMER_CONTENT_SID', 'Visit confirmed (directions)',
    '1 customer name · 2 property · 3 room/joining date · 4 address + directions · 5 booking reference'],
  ['TWILIO_VISIT_PIN_CUSTOMER_CONTENT_SID', 'Visit confirmed (legacy)',
    '1 customer name · 2 property · 3 address · 4 room · 5 joining date · 6 booking reference'],
  /* The one entry here NOT tied to an automated flow — built for this page.
     No buttons, no request id, safe to send to anyone: "Hello {{1}}, this is
     a message from the Lampose team: {{2}}". Approved as WhatsApp category
     UTILITY, so {{2}} should read as an account/service notice, not a
     promotion — Meta can revoke a template that drifts into marketing use. */
  ['TWILIO_ADMIN_NOTICE_CONTENT_SID', 'Generic notice (safe for any recipient)',
    '1 recipient name · 2 your message'],
];

// @route   GET /api/admin/whatsapp/templates
// @desc    Which Content Templates are configured, for the Messages page's
//          template picker. Never returns the SIDs themselves to the
//          browser — templateKey (the env var name) is what a send names.
router.get('/templates', (req, res) => {
  const templates = TEMPLATE_REGISTRY
    .filter(([envVar]) => !!process.env[envVar])
    .map(([envVar, label, hint]) => ({ key: envVar, label, hint }));

  return res.json({
    success: true,
    configured: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
    from: (process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886').replace(/^whatsapp:/, ''),
    templates,
  });
});

// @route   POST /api/admin/whatsapp/send
// @desc    Send one WhatsApp message, free text or an approved template.
router.post('/send', async (req, res) => {
  try {
    const { to, mode, body, templateKey, variables } = req.body;

    if (!to || !toE164(to)) {
      return res.status(400).json({
        success: false,
        message: 'Enter a valid phone number, with a country code if it is not Indian.',
      });
    }

    let result;
    let logLabel;

    if (mode === 'template') {
      const entry = TEMPLATE_REGISTRY.find(([envVar]) => envVar === templateKey);
      const contentSid = entry && process.env[entry[0]];
      if (!contentSid) {
        return res.status(400).json({ success: false, message: 'That template is not configured on the server.' });
      }

      const contentVariables = {};
      if (variables && typeof variables === 'object') {
        for (const [key, value] of Object.entries(variables)) {
          const trimmedKey = String(key).trim();
          if (trimmedKey && value !== undefined && value !== '') contentVariables[trimmedKey] = String(value);
        }
      }

      result = await sendAdminMessage({
        to,
        contentSid,
        contentVariables: Object.keys(contentVariables).length ? JSON.stringify(contentVariables) : undefined,
      });
      logLabel = `template "${entry[1]}"`;
    } else {
      if (!body || !String(body).trim()) {
        return res.status(400).json({ success: false, message: 'Write a message.' });
      }
      result = await sendAdminMessage({ to, body: String(body).trim() });
      logLabel = 'free text';
    }

    if (!result.success) {
      if (result.error === 'Twilio client not initialized') {
        return res.status(503).json({
          success: false,
          code: 'TWILIO_NOT_CONFIGURED',
          message: 'Twilio is not configured on the server (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN).',
        });
      }
      return res.status(502).json({ success: false, message: result.error || 'Twilio rejected the message.' });
    }

    console.log(`📤 [Admin WhatsApp] ${req.admin?.email || 'admin'} sent ${logLabel} to ${toE164(to)}. SID: ${result.sid}`);
    return res.json({ success: true, data: { sid: result.sid } });
  } catch (error) {
    console.error('❌ [POST /api/admin/whatsapp/send Error]:', error.message);
    return res.status(500).json({ success: false, message: error.message || 'Could not send the message.' });
  }
});

module.exports = router;
