# Lampose Main Backend

One Node process serving every Lampose client, on one MongoDB database.

| Client | Domain | Calls |
| --- | --- | --- |
| `lampose-frontend` (public site) | lampose.com | `/api/v2/{listings,visit-requests}`, `/api/health` |
| `leads-frontend` (leads panel) | leads.lampose.com | `/api/v2/{auth,users,scraper}` |
| `onboards-frontend` (onboarding) | onboard.lampose.com | `/api/v1/{properties,permissions}` + `/api/v2/auth` |
| admin console | — | `/api/v1/admin` |
| User App / Stay App | mobile | planned — their APIs will be added to this same process |

There is **one backend**. Do not stand up a second one for a new client; add a
module here instead.

```bash
cp .env.example .env   # fill it in — see Configuration below
npm install
npm run browsers       # Playwright's Chromium, only needed for the lead scraper
npm run dev            # node --watch server.js
npm run verify         # exercises every call all three frontends make
```

The boot banner prints the full route map, which datastore is live, and which
integrations (SMS gateway, Twilio) are configured — read it before debugging
anything else.

---

## Architecture

```
server.js                     boot, banner, graceful shutdown
app.js                        the Express app (split out so scripts/ can boot it)
routes/
  index.js                    the version registry and legacy aliases — the ONE mount point
  health.routes.js            process + database status (shared by v1 and v2)
src/
  config/
    env.js                    all configuration, read once — loads .env
    cors.js                   one policy for every client
  infrastructure/             external systems, one folder each
    database/db.js            connection + retry + the v1 in-memory failover
    twilio/twilio.js          every WhatsApp send (verification + availability) and phone normalisation
    sms/sms.js                DLT SMS gateway (smslogin.co) for one-time codes
  shared/
    middleware/               requestLogger, errorHandler, authMiddleware, requireDb, rateLimit
    utils/text.js             regex escaping
  modules/                    one folder per business domain
    auth/                     leads-panel + onboarding-employee login (v2 identity)
    users/                    leads-panel team management
    admins/                   admin console accounts, stats, activity
    properties/               the properties collection: onboarding CRUD (v1) + panel CRUD (v2)
    listings/                 public read projection: formatter, sharing options, stay rates
    visits/                   "Request a visit": OTP, availability lifecycle
    verification/             owner→verifier onboarding chain + the WhatsApp webhook
    permissions/              employee edit/delete grants
    scraper/                  Google Maps lead scraping, leads store
scripts/                      verify, smoke, inspect, export, migrate
data/                         local JSON fallback store for leads (dev only)
deploy/                       nginx vhost + systemd unit
```

**Filename convention** — every file inside `src/modules/` names its role:

```
<domain>.model.js         Mongoose schema            property.model.js
<domain>.controller.js    request handlers           visitRequest.controller.js
<domain>.routes.js        the Express router         verification.routes.js
<domain>.routes.v1.js     when two API versions      property.routes.v1.js / .v2.js
                          disagree about a path
<name>.util.js            domain helpers             stayIntent.util.js, otp.util.js
<name>.service.js         long-running machinery     playwrightScraper.service.js
<name>.store.js           data-access layers         scraper.store.js, permission.store.js
```

(`scriper.model.js` keeps its historical spelling — the `scriper_*` collections
are named after it.)

Modules may import each other's files directly (the visits controller reads
`properties/property.model`); the folders are organisation, not enforced
boundaries. Mongoose model and collection names live *inside* the files, so
renames here never touch the database.

---

## Why there are two API versions

This backend is the merge of two that had grown apart, and they disagreed
about what `/api/properties` means. Versioning is what makes that
disagreement harmless rather than a silent bug.

**v1 — the onboarding surface.** `POST /api/v1/properties` does *not* write a
property. It stores the submission on a `verificationrequest` and sends the
owner a WhatsApp template through Twilio. The listing only reaches the
`properties` collection once the owner replies YES *and* a member of
`VERIFICATION_TEAM_NUMBERS` confirms. `PUT` and `DELETE` carrying an
`x-employee-email` header are refused unless an administrator has granted that
employee permission for that listing, and a grant is single-use.

**v2 — the public site and the leads panel.** `POST /api/v2/properties` writes
the property immediately, behind a bearer token. No Twilio, no approval chain.

Both behaviours are wanted. Neither is a bug. They just cannot share a path.

## Route map

```
/api/v1/health              process + database status         (shared router)
/api/v1/properties          onboarding CRUD, Cloudinary upload, WhatsApp verification
/api/v1/admin               admin console accounts, stats, activity, system telemetry
/api/v1/verifications       owner/verifier verification requests
/api/v1/whatsapp            Twilio inbound webhook
/api/v1/permissions         employee edit/delete permission requests

/api/v2/health              process + database status         (shared router)
/api/v2/listings            public Explore feed for lampose.com
/api/v2/visit-requests      availability requests: OTP, then the owner is asked
/api/v2/properties          direct property CRUD for the leads panel
/api/v2/auth                leads panel + onboarding employee login
/api/v2/users               leads panel team management
/api/v2/scraper             Google Maps lead scraping, leads, CSV export
```

`GET /api` returns this map as JSON, and the boot banner prints it.

### Unversioned paths still work

Every frontend was written against unversioned paths, so each one resolves to
the version that already answered it:

| Path | Serves |
| --- | --- |
| `/api/properties` `/api/permissions` `/api/verifications` `/api/whatsapp` `/api/admin` | v1 |
| `/api/listings` `/api/visit-requests` `/api/auth` `/api/users` `/api/scraper` | v2 |
| `/api/health` | shared |

`/health`, `/listings`, `/visit-requests`, `/auth`, `/users` and `/scraper`
are also mounted without the `/api` prefix. **`/properties` with no `/api`
prefix is deliberately not mounted** — it is the one path where the two
versions mean different things, and a deployment whose base URL lost its
prefix should get a 404 that says so rather than the wrong semantics silently.

---

## One WhatsApp webhook, two workflows

Twilio allows one inbound URL per number, so `/api/whatsapp/webhook` carries
two unrelated businesses. They are told apart by **the word the owner replies
with**, never by the route:

```
YES / NO        property verification    v1 · verificationRequest.model
                                         owner approves onboarding, then a
                                         verifier confirms; property goes live

AVAILABLE       visit availability       v2 · visitRequest.model
NOT AVAILABLE                            a customer asked to view a room; the
                                         owner says whether it is free
```

`AVAILABLE` is deliberately not `YES`. An owner can have an onboarding
confirmation and a visit request open at the same moment on the same number,
and a bare `YES` would be ambiguous between "list my property" and "yes, come
and see it" — two very different outcomes.

The dispatch lives at the top of the webhook in
`src/modules/verification/verification.routes.js` and is six lines: it asks
`handleAvailabilityReply` (in `src/modules/visits/visitRequest.controller.js`)
whether the message is one of its own, and carries on to the verification
logic untouched when it is not. An availability word with no visit request
open also falls through, so nothing is ever stolen from verification. The
approved availability template's quick-reply buttons carry
`VISIT_YES:<requestId>` / `VISIT_NO:<requestId>` payloads, so a tap identifies
its own request even when an owner has several pending.

### The availability flow end to end

```
customer picks a room, stay type, duration and joining date on lampose.com
        ↓  POST /api/visit-requests            → 6-digit code by SMS (DLT gateway)
        ↓  POST /api/visit-requests/:id/verify → code checked
        ↓                                      ← owner is asked on WhatsApp
owner taps AVAILABLE / NOT AVAILABLE
        ↓  POST /api/whatsapp/webhook
status → confirmed / declined · customer notified · page polling picks it up
```

Three orderings carry the safety here:

- The owner is contacted **only after** the code sent to the customer's phone
  comes back correct — otherwise the button is a way to make a stranger's
  WhatsApp ring under an invented name.
- The owner's number is read from the `properties` document by id, **never**
  from the request body.
- Every price in the request (`sharing`, stay rate, pro-rated first month) is
  re-derived from the property by `stayIntent.util.js` — a posted body cannot
  put a number in front of the owner that the page never showed.

One-time codes are salted+peppered SHA-256, never stored in plaintext,
10-minute TTL (matching the registered DLT template text), 5 attempts, resend
cooldown. The endpoints are rate-limited per IP (`shared/middleware/rateLimit`)
because each send costs real money.

### After AVAILABLE: what a confirmed customer can buy

A confirmed **bachelor or co-live** request (`payment.required`, decided from
the category when the request was made and frozen there) offers the steps
below. They are independent — any can happen without the others, and none
reads another's state.

| | Route | Costs | Gives | Lives in |
| --- | --- | --- | --- | --- |
| Visit token | `POST /:id/payment/order` → `/verify` → `/joining-date` | `VISIT_TOKEN_AMOUNT_PAISE` (₹20) | the street address, and claims a bed | `visitPayment.controller.js` |
| Direct Access | `POST /:id/unlock/order` → `/unlock/verify` | `VISIT_CONTACT_UNLOCK_PAISE` (₹99) | the owner's number and a Maps pin | `contactUnlock.controller.js` |
| Assisted Visit — advance | `POST /:id/assisted/order` → `/assisted/verify` | `VISIT_ASSISTED_ADVANCE_PAISE` (₹100) | books the slot, messages the roster | `contactUnlock.controller.js` |
| Assisted Visit — balance | `POST /:id/assisted/balance/order` → `/balance/verify` | total minus advance (₹99) | settles the visit | `contactUnlock.controller.js` |

The site shows the last three as a two-tab strip: **Assisted Visit** (₹199,
taken as ₹100 now and ₹99 on confirmation) and **Direct Access** (₹99).

**Neither tab includes the other.** Paying for an assisted visit does *not*
release the owner's number — the representative deals with the owner, so the
customer never needs it — and Direct Access books nobody's time. Copy that
implies otherwise is selling something the payment does not deliver.

#### The ₹199 is taken in two parts

Only `VISIT_ASSISTED_ADVANCE_PAISE` is configured; the balance is
`total − advance`, derived in `assistedSplit()` so the halves can never drift
out of step with the total. An advance at or above the total charges
everything up front and owes nothing, which is a coherent setup rather than
an error.

The balance is a debt, so it is treated like one:

- The customer must tick a box agreeing to it. The server refuses the advance
  order with `400 BALANCE_NOT_ACCEPTED` unless `balanceConsent === true`, and
  records `balanceConsentAt` — "they must have ticked it" is not evidence six
  weeks later.
- `balance.status` is `not_due` until the advance verifies. There is nothing
  to owe on a visit nobody booked.
- The balance route deliberately skips the lapsed-confirmation gate: a
  confirmation window closing afterwards does not cancel what is owed, and
  refusing to let somebody settle it would strand them.

#### Four orders, one request — the thing to keep right

A confirmed request can carry the visit token, the contact unlock, the
assisted advance and the assisted balance, and **all four carry the same
`visitRequestId`** in their Razorpay notes. They are told apart by a
`purpose` note:

| `purpose` | Handler |
| --- | --- |
| *absent* | the visit token — what every payment and payment link made before these existed looks like, so old events keep their meaning |
| `contact_unlock` | Direct Access |
| `assisted_visit` | the assisted advance |
| `assisted_balance` | the assisted balance |

`razorpayWebhook.controller.js` dispatches on it, testing the balance *before*
the advance — reading a settled balance as an advance would re-book a visit
that already exists and message the roster a second time. Without the
dispatch at all, any of the three would mark the token paid, release an
address and take a bed out of the pool, none of which anybody bought.

Each also has its **own receipt** — `unlock_<id>`, `assist_<id>`,
`assistbal_<id>`, and the bare `<id>` for the token. Razorpay folds a repeated
receipt into the order it already made, so a shared one hands a checkout the
wrong order and the wrong amount.

#### Where the gated values are assembled

`toPublic()` carries each payment's *status* and never its contents. The
owner's number and the map pin are attached by the **status endpoint** after
it re-reads `contactUnlock.verifiedAt` — the field only an HMAC check writes.
One place decides who may see a phone number.

The roster is messaged only once the advance verifies, never when the slot is
first picked: `pending_payment` is a held slot nobody is told about, or an
abandoned checkout would put an agent's morning aside for somebody who closed
the tab. The message itself is best-effort — Meta only carries free-form
messages inside a 24-hour session — and a failed send leaves the paid booking
standing with `teamNotifiedAt` null, which the page reports plainly.

---

## Two identity systems

They share a process and a database and nothing else. Do not try to make one
verify the other's tokens.

| | v1 admin console | v2 leads panel |
| --- | --- | --- |
| Route | `/api/v1/admin/login` | `/api/v2/auth/login` |
| Collection | `admins` | `scriper_users` |
| Roles | Super Admin / Admin / Editor / Viewer | ADMIN / EMPLOYEE |
| Token verified server-side? | No — the console holds it client-side | Yes, on every guarded route |

The onboarding app authenticates its field agents against the **v2** accounts
(`/api/v2/auth/onboarding-login`), then identifies them on writes with the
`x-employee-email` header, which the v1 permission gate reads.

## Every API call is logged

`shared/middleware/requestLogger.js` is the first middleware in the stack —
before CORS — so preflights, blocked origins and 404s are all visible. The
line is printed when the response finishes, so it carries status and duration.

```
🌐 [10:35:12 PM] 🟢 [v2] GET /api/v2/listings?category=PG → 200 (35ms) | from 127.0.0.1 | query: {"category":"PG"}
🌐 [10:35:13 PM] 🟡 [v2] POST /api/v2/auth/login → 401 (33ms) | from https://leads.lampose.com | body: {"email":"nobody@example.com","password":"***REDACTED***"}
🌐 [10:35:13 PM] 🟡 [—] GET /api/nope → 404 (1ms) | from 127.0.0.1
```

The `[v1]`/`[v2]` tag is the resolved version; `[v1*]`/`[v2*]` marks an
unversioned path. Fields named password, token, secret or adminCode are
redacted; base64 images are collapsed to their size. `REQUEST_LOG_BODY=false`
turns bodies off, `REQUEST_LOGGING=false` the whole thing.

## Failure behaviour

Nothing here exits the process. One backend serves every client, and a fault
affecting one must not take the others down. Every degradation is named at
boot and in the response:

- **MongoDB unreachable** — the server still listens. v2 routes answer
  `503 DB_DISCONNECTED`; v1 falls back to its in-memory store so field agents
  can keep submitting. Retries every `DB_RETRY_MS`. **Anything written during
  that window lives only in the process.**
- **SMS gateway unconfigured** — visit requests answer
  `503 SMS_NOT_CONFIGURED`; everything else is untouched.
- **Twilio unconfigured** — OTP verification still works; the owner-facing
  WhatsApp step is refused with a named error.
- **`JWT_SECRET` missing in production** — `/api/v2/auth` and `/api/v2/users`
  answer `503 AUTH_NOT_CONFIGURED`. No forgeable token is ever issued.
- **Playwright not installed** — only `POST /api/v2/scraper/start` answers
  503\. It is required lazily for exactly this reason.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run verify` | 78 checks. Boots the app and replays every call the three frontends make, checking each response carries the fields the calling component reads. Add `--scrape` for a live Google Maps scrape. Cleans up after itself, in MongoDB *and* Cloudinary. |
| `npm run smoke` | Faster "is it healthy" check, including the CORS preflight from each production origin. `SMOKE_URL=https://api.lampose.com npm run smoke` to test a deployment. |
| `npm run inspect:db` | Collection names, counts and document shapes. Never prints the connection string. |
| `npm run inspect:properties` | Category/stayType/amenity tallies and image coverage across `properties`. |
| `npm run export:listings` | Build-time snapshot of `properties` into the public site's `src/data/listings.js`. `:clean` drops obvious test rows. |
| `npm run migrate:json` | One-way, idempotent import of an old `data/*.json` leads store into MongoDB. |
| `npm run seed:admins` | Creates the first v1 Super Admin. Refuses unless `ADMIN_PASSWORD` is set. |

`verify` deliberately skips a complete `POST /api/v1/properties` (it would
send a real WhatsApp message to a real number — the route is exercised through
its validation paths instead) and live scrapes unless `--scrape` is passed.

## Configuration

Every variable is documented in `.env.example`. **No credential has a fallback
in source** — a missing key degrades loudly (see Failure behaviour), it never
falls back to something committed. The groups:

| Group | Keys | Absent → |
| --- | --- | --- |
| Core | `MONGO_URI` `PORT` `NODE_ENV` `JWT_SECRET` | local-Mongo/JSON fallbacks, 503s on auth |
| CORS | *(none — the allowlist is `ALLOWED_ORIGINS` at the top of `server.js`)* | an unlisted origin is refused in production |
| DLT SMS (visit OTPs) | `SMS_API_URL` `SMS_USERNAME` `SMS_APIKEY` `SMS_SENDERID` `SMS_OTP_TEMPLATE_ID` `OTP_SMS_TEMPLATE` | visit requests answer 503 |
| Twilio / WhatsApp | `TWILIO_ACCOUNT_SID` `TWILIO_AUTH_TOKEN` `TWILIO_WHATSAPP_FROM` `TWILIO_VERIFY_CONTENT_SID` `TWILIO_TEAM_CONTENT_SID` `TWILIO_VISIT_REQUEST_CONTENT_SID` `TWILIO_VISIT_OUTCOME_CONTENT_SID` | WhatsApp sends refused with a named error |
| Cloudinary (v1 images) | `CLOUDINARY_CLOUD_NAME` `CLOUDINARY_API_KEY` `CLOUDINARY_API_SECRET` | upload answers 503 |
| v1 admin | `V1_ADMIN_SECRET_KEY` `ADMIN_PASSWORD` | registration refused / seed refuses |
| Verification | `VERIFICATION_TEAM_NUMBERS` `PRODUCTION_WEBSITE_URL` | **empty team list = owner's YES auto-verifies with no second pair of eyes** |

Three sharp edges, all commented in `.env.example`:

- `OTP_SMS_TEMPLATE` **must stay quoted** — a bare `#` in `{#var#}` starts a
  comment and silently truncates the template, and the body must match the
  DLT registration character for character.
- `BODY_LIMIT` is 25mb, not the 1mb the leads backend used — the onboarding
  app posts base64 images in the JSON body.
- `SEED_DEFAULT_USERS` — keep false whenever `MONGO_URI` points at the real
  cluster; the demo credentials are public knowledge.

## Local development against real WhatsApp

Twilio has to reach your machine, so put a tunnel in front of port 5001 and
point the sender's webhook at it:

```bash
node server.js
cloudflared tunnel --url http://localhost:5001 --protocol http2
# → set the Twilio webhook to https://<tunnel-host>/api/whatsapp/webhook
```

Use `--protocol http2` — the default QUIC transport drops on some networks.
Quick tunnels expire and change hostname on every restart, so re-set the
Twilio webhook each time, and **set it back to the production URL when you
stop** — while it points at your laptop, every real owner reply arrives there
and is lost the moment the tunnel dies.

## Deploy

`deploy/` has an nginx vhost and a systemd unit, both pointing at port 5001.
Two things in there that are easy to get wrong and are commented in place: do
not add `Access-Control-Allow-Origin` in nginx (the app already sets it
per-origin, and two headers make every browser reject the response), and point
your uptime check at `/api/health/live` rather than `/api/health` — the latter
answers 503 when MongoDB is down, which would restart-loop the container over
a fault it cannot fix.
