/* ══════════════════════════════════════════════════════════════════════════
   /api/v2/interest — the public site's "Notify me when it is launched".

   The form on /food-partner used to show "You're on the list!" and store
   nothing, so every restaurant that asked to hear from us was lost. It now
   writes a lead into `scriper_leads` — the collection the leads panel already
   works — with `source: 'Website'` and `leadStatus: 'NEW'`, so a sign-up
   reaches the people who follow leads up without a new screen anywhere.

   Public and unauthenticated by nature, so:
     · rate-limited per IP;
     · an email already signed up answers exactly like a new one and writes
       nothing, so the endpoint cannot be used to test who is on the list and
       a double submit is not a second row;
     · only an email, and which page it came from, are accepted.
   ══════════════════════════════════════════════════════════════════════════ */
const express = require('express');

const { ScrapedLead } = require('./scriper.model');
const { requireLamposeDb } = require('../../shared/middleware/requireDb');
const { rateLimit } = require('../../shared/middleware/rateLimit');

const router = express.Router();

const signupLimit = rateLimit({ name: 'website-interest-ip', windowMs: 60 * 60 * 1000, max: 5 });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* Where the form was shown, as a label a sales rep can read. Anything else
   is stored as the generic one rather than echoed back from the body. */
const PAGES = {
  'food-partner': 'Restaurant partner (website)',
  'food-partner-onboarding': 'Restaurant partner (website)',
};

router.post('/', requireLamposeDb, signupLimit, async (req, res, next) => {
  try {
    const email = String((req.body || {}).email || '').trim().toLowerCase().slice(0, 200);
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({
        success: false, code: 'BAD_EMAIL', error: 'Please enter a valid email address.',
      });
    }
    const category = PAGES[String((req.body || {}).page || '')] || 'Website sign-up';
    const dedupeKey = `website:${email}`;

    /* Upsert on the key, inserting only: a repeat sign-up leaves the lead —
       and whatever a rep has already done with it — exactly as it was. */
    await ScrapedLead.updateOne(
      { dedupeKey },
      {
        $setOnInsert: {
          jobId: 'website',
          source: 'Website',
          businessName: `Website sign-up · ${email}`,
          email,
          category,
          scrapedAt: new Date(),
          leadStatus: 'NEW',
          dedupeKey,
        },
      },
      { upsert: true },
    );

    return res.status(201).json({ success: true, message: "You're on the list." });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
