/* ══════════════════════════════════════════════════════════════════════════
   The "restaurant approved" WhatsApp template — the definition, in one place.

   Sent once, to the owner's mobile, when an administrator approves a
   restaurant in the console: the account is live, and here is how to sign in
   to it. Read by the script that creates it in Twilio
   (`scripts/create-restaurant-approved-template.js`) and, once it is
   approved, by the sender that fills it. It lives here rather than inside the
   script so both can `require` it without the script running — that file
   talks to a live Twilio account the moment it is loaded.

   ## The body IS the contract

   Four variables, in this order — the sender fills exactly these:

     {{1}} owner name            Ravi Kumar
     {{2}} restaurant name       Paradise Biryani House
     {{3}} the address           Opposite the RTC complex, Visakhapatnam
     {{4}} the console URL       https://admin.lampose.com

   No credential is among them, and nothing about signing in — see the record
   below, which is the whole reason this message is shaped the way it is.

   The URL is a VARIABLE rather than words in the body on purpose: the console
   moves host far more easily than a template passes review.

   ## Modelled on a template this account already got approved

   `lampose_property_live_owner` is the same message for the stays side — an
   owner told their property has been checked and is now listed — and it is
   approved as MARKETING. This body is written to its shape deliberately:
   congratulate, name the thing, say what happens next, and say NOTHING about
   signing in. That last part is what seven refusals were about.

   ## The credential is in a TEXT MESSAGE, not here

   Approval generates a password and sends it over the DLT SMS route — one
   registered template carrying the owner's ID and their password, which is the
   channel every one-time code in this product already travels on. This message
   is the half that explains it: that they are approved, that the details are in
   an SMS, and where the console is.

   Splitting them is not a preference. Meta refused four WhatsApp templates on
   this account — two carrying a credential, two carrying none — and SMS in
   India is bound to DLT-registered text, which cannot carry a name, a link and
   an instruction. Each channel takes the half it is allowed to.

   And this message does not mention it at all — not the password, not the SMS
   that carries it, not signing in, not a console to sign in to. v5, v6 and v7
   each said only that sign-in details had been sent by SMS, and that sentence
   alone was enough to have them classified as authentication content. The SMS
   explains itself when it arrives: it names the ID and the password.

   ## Six rejections, and what they actually taught

   Read this before rewriting a word of the body, because five people's worth
   of rewriting has already been spent on the wrong thing.

   Submitted on 2026-09-21, in order, each refused within minutes:

     v1  HX71a5d980…  "User ID: {{3}} / Password: {{4}}" in a labelled block
     v2  HX2c45c755…  the block became a sentence, "password" became
                      "temporary sign-in key", and the canonical OTP line
                      "do not share these details with anyone" was dropped
     v3  HX0ce5990a…  no credential at all — a one-time LINK instead
     v4  HX6cd04374…  no credential WORDS at all, and the console path renamed
                      out of the sample URL so even that carried none
     v5  HX92f26d6a…  the credential moved to SMS; this message only says it
                      was sent and where the console is

   Every one answered `rejection_reason: "Unknown rejection reason"`. Two
   theories were built on that silence and both were wrong: that a
   machine-generated secret was the problem (v3 carried none and was refused),
   and that the account was in a resubmission cooldown (`lampose_delivery_request_v2`
   was approved on the same account at 07:55 that morning).

   v6 (HXcdc210ad…) settled it. It was v5's body CHARACTER FOR CHARACTER,
   submitted a day later — and Meta refused it with a reason at last:

       INCORRECT_CATEGORY

   The category was the one thing nobody had varied. All six went in as UTILITY.

   v7 (HX808ea71c…) resubmitted the same body as MARKETING, and was refused
   with `INCORRECT_CATEGORY` again — in the other direction. That pair of
   refusals is what identified the real problem, because the account gets both
   categories approved routinely (20 utility, 4 marketing at the time). Neither
   fits because Meta reads a message about SIGN-IN DETAILS as authentication
   content, and an AUTHENTICATION template may carry no name, no link and no
   sentence — so this message cannot be one either.

   v8 is therefore the first version that says nothing about signing in at all.
   See `CATEGORY` below for what MARKETING costs.

   ## Two lessons, and the second one is the useful one

   When a refusal gives no reason, vary what the SUBMISSION says about itself —
   the category, the language, the type — before rewriting the message. Five
   rewrites were aimed at a classifier that had not objected to a sentence.

   And when it does give a reason, read it as being about the WHOLE message
   rather than about the field it names. `INCORRECT_CATEGORY` in both
   directions did not mean "pick the other one"; it meant "this is a third
   thing". The fastest way to find that out was to look at what this account
   has already had APPROVED — which is where the shape of this body came from.

   ## Meta's rules this body is written to

   · A variable may not be the first or last thing in the body, and a trailing
     full stop does NOT rescue one: v8 ended "…at {{4}}." and Meta refused it
     at CREATION — "Variables can't be at the start or end of the template",
     subCode 2388299 — which is a different failure from the seven category
     refusals before it. The link sits mid-sentence now, with a clause after.
   · No two variables are adjacent; each is introduced by its own words.
   · Variables are numbered from 1 with no gaps.
   · A value may not contain a newline or a tab, or be empty.
   · MARKETING, not UTILITY. Both were refused with INCORRECT_CATEGORY while
     the body mentioned signing in; once it did not, MARKETING is what the
     equivalent stays template (`lampose_property_live_owner`) is approved as.

   ## v9 and v10 were approved

   Submitted 2026-09-22, each approved within minutes:

       HX0be43669f25f7c45ee8ce2c72585bc57   _v9    no mention of the SMS
       HX619aedc5da5fa45fadc430bb796cb4fa   _v10   the body below — IN USE

   v10 is v9 plus "Please check your text messages for what you need to get
   started", and it settles what the seven refusals were about: NOT the fact of
   a text message, which this one names and which passed in two minutes, but the
   WORDS. v5's "we have sent your sign-in details by SMS" was refused three
   times; the same fact, said without *sign-in*, *password* or *details*, was
   not. Both carry the same four variables, so moving between them is one env
   var and no code.

   Put the sid in `TWILIO_RESTAURANT_APPROVED_CONTENT_SID`. Ten submissions
   ended here, so before editing a word of the body: a changed body is a NEW
   template and a fresh review, and what this account has learnt is that the
   review reacts to vocabulary rather than to meaning.
   ══════════════════════════════════════════════════════════════════════════ */

/* `_v10`: v1 through v8 were all rejected, and a rejected name is not one to
   build on — the account's other templates are versioned the same way. v9 is
   approved and still in the account: it is this body without the sentence
   pointing at the text message, and it is what to fall back to if this one is
   ever paused. */
const FRIENDLY_NAME = 'lampose_restaurant_approved_v10';
const LANGUAGE = 'en';

/*
 * MARKETING, and it took six refusals to learn it — see the record above.
 *
 * What it costs, and it is worth knowing before this is sent at scale:
 *
 *   · Billed at the marketing rate, which is higher than utility. One message
 *     per approved restaurant makes that immaterial here.
 *   · Subject to per-user marketing limits and to a recipient's marketing
 *     opt-out. An owner who has opted out will not receive it and nothing here
 *     will know — which is survivable precisely because this message carries
 *     no credential: the SMS does (`sms.js`, the `partnerPassword` template),
 *     and that is the half that decides whether they can sign in.
 *   · Marketing templates are paused first when an account's quality drops.
 */
const CATEGORY = 'MARKETING';

const BODY = [
  '✅ *Your restaurant is now live — Lampose*',
  '',
  'Congratulations {{1}}! Our team has checked "{{2}}" and it is now listed on Lampose.',
  '',
  '🍽️ *Restaurant:* {{2}}',
  '📍 *Address:* {{3}}',
  '',
  'Please check your text messages for what you need to get started. Manage your menu and timings at {{4}} whenever you need to — diners can now find you, and we will message you here each time an order comes in.',
].join('\n');

/*
 * A sample for every variable — Meta reviews the RENDERED message, not the
 * placeholders, so these are what a reviewer reads. Shaped like the real
 * values, because a sample that looks nothing like what will be sent is how a
 * template is approved and then behaves differently.
 *
 * The password sample is a made-up string of the shape the generator produces.
 * It is not, and must never be, a password that works anywhere.
 */
const SAMPLES = {
  1: 'Ravi Kumar',
  2: 'Paradise Biryani House',
  3: 'Opposite the RTC complex, Visakhapatnam',
  4: 'https://admin.lampose.com',
};

/** The variable numbers the body uses, as strings, in order — what the sender must supply. */
const variableKeys = (body = BODY) => [...new Set(
  [...body.matchAll(/\{\{(\d+)\}\}/g)].map((match) => match[1]),
)];

/** The body with the samples filled in — what a reviewer, and the owner, will read. */
const render = (values = SAMPLES) => Object.entries(values)
  .reduce((text, [key, value]) => text.split(`{{${key}}}`).join(value), BODY);

module.exports = {
  FRIENDLY_NAME, LANGUAGE, CATEGORY, BODY, SAMPLES, variableKeys, render,
};
