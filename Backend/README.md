# Lampose Main Backend

One Node process serving every Lampose client, on one MongoDB database.

| Client | Domain | Calls |
| --- | --- | --- |
| `lampose-frontend` (public site) | lampose.com | `/api/v2/{listings,visit-requests}`, `/api/health` |
| `leads-frontend` (leads panel) | leads.lampose.com | `/api/v2/{auth,users,scraper}` |
| `onboards-frontend` (onboarding) | onboard.lampose.com | `/api/v1/{properties,permissions}` + `/api/v2/{auth,scraper/leads}` |
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
    push/push.js              Expo push, for the three mobile apps
    razorpay/razorpay.js      order + signature verification. The one trust boundary for money
    realtime/realtime.js      socket.io on the same port. ONLY the delivery flow needs it
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
    foodpartners/             restaurants, menus, orders, and paying for one
    drivers/                  riders: accounts, duty, live position, and the dispatcher
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

`POST /api/v1/properties/:id/resend-verification` sends that owner template
again, and always **stage one**: a listing stuck in the console as "Awaiting
verification" may be waiting on the owner or on the team, and in both cases the
answer is to ask the owner, because the team stage is built on the owner's YES.
A request that already reached `owner_approved` goes back to `sent`. The `:id`
is the PROPERTY id the console holds — the snapshot's, resolved the same way
`PUT` and `DELETE` resolve it — and the owner's number is re-read from that
snapshot, so correcting a wrong number with Edit and then resending actually
reaches the new one. The button payload keeps the same request id, so an older
message still on the owner's phone cannot approve a second listing. Admin only
(`verifications.manage`), one message a minute, and the 48-hour window restarts
on each send.

It also clears `assignedVerifierMobileE164`, which is correctness rather than
tidiness: a request waiting on the owner has never had a verifier, and leaving
one on a request just put back to `sent` would hand a team member a live Accept
button for stage one. Their tap passes the webhook's "is this yours" check,
fails the verifier branch (which needs `owner_approved`) and falls into the
OWNER branch, where a tagged tap is read as the owner's YES — a verifier
approving on the owner's behalf. Cleared, the old button matches neither role
and is refused.

**v2 — the public site and the leads panel.** `POST /api/v2/properties` writes
the property immediately, behind a bearer token. No Twilio, no approval chain.

Both behaviours are wanted. Neither is a bug. They just cannot share a path.

### Where a property is: one box on the form, three fields in the row

A listing has always carried a `place` (an area) and an `address` (words).
Neither opens a map, and an address typed at a doorway is only as good as the
typing.

The onboarding form still asks for the address in **one** field — a second box
asking for the same place in a different notation is a box most agents leave
blank — but that field now accepts a pasted map link as well as words, and
carries a crosshair that takes one browser fix. `Onboard/src/services/mapLink.js`
splits what was typed on the way out, so a row can carry, all optional:

- **`address`** — the words alone, with any pasted link lifted out of them.
- **`mapLink`** — the link the agent's phone produced, stored exactly as
  pasted. A short `maps.app.goo.gl` link keeps its coordinates behind a
  redirect the browser may not follow, so it carries no readable pin — and it
  is still worth storing, because it opens on the right building for whoever
  taps it.
- **`location`** — a GeoJSON point, `[longitude, latitude]` like every other
  point here, taken by the browser's own geolocation (the platform's, with no
  key and no billing — the same thing the mobile apps reach through
  `expo-location`). **Absent**, never null, when nobody took a fix: a
  half-written point would break the sparse 2dsphere index the model declares.

Any combination of the three is a real answer — words with no link, a link
with no words, a pin with neither. That is why they are separate fields in the
row even though they are one box on the screen: a URL left sitting in
`address` is printed to a student where the door number belongs, and words are
no use to somebody trying to open a map. Both write paths accept them and both
normalise through
`src/modules/properties/property.util.js`, which does the `{lat, lng}` → `[lng,
lat]` flip once, on the way in. `PUT /api/v1/properties/:id` hands its body to
`findByIdAndUpdate` whole, so it normalises the pin before that rather than
failing a whole edit on a field nobody was editing.

The verifier is the first reader: both the WhatsApp template and the
token-gated review page link to the pin when there is one, then the pasted
link, then a search for the typed address — best answer first, because that
link is what somebody taps before driving there.

### Adding a lead by hand

`POST /api/v2/scraper/leads`, behind the leads panel's own sign-in (`protect`),
is how the onboarding site's **Add Lead** form files a business somebody met.
A manual create already existed at `POST /api/v1/admin/scriper-leads`, but
behind Super Admin — the console's identity, which the onboarding site does not
hold. This is the same operation behind the guard its caller actually has.

Three things about it are deliberate:

- **`source: 'Manual'`**, a value on the `scriper_leads` enum rather than a
  lead filed under `Web`. The difference matters to whoever works the row: a
  scraped listing has never heard of us, a manual one was usually met. Kept in
  step with the leads panel's source filter — a value the server accepts and
  the panel omits is a lead nobody can filter to. It is **not** on
  `scrapeJobSchema.source`: you cannot scrape Manual.
- **Created UNASSIGNED**, with `addedBy` recording who typed it. Sales adds the
  lead, an admin then hands it to a calling agent, so those are two different
  people and the row has to say so. It also means the agent who added it cannot
  see it in their own queue until it is assigned — an EMPLOYEE is scoped to
  their assignments — which is why the form says so before they fill it in.
  `addedBy` is separate from `lastActivityBy`, which the first rep to touch the
  row overwrites.
- **A duplicate is a 409, not a silent skip.** `dedupeKey` exists so a rep does
  not call a business a colleague already called, and a person typing hits that
  more easily than a re-scrape does. Somebody is standing there waiting to hear
  what happened to what they typed, so the answer names the business.

A lead's pin is `latitude`/`longitude` as two plain numbers plus a `mapsUrl`
string — **not** the GeoJSON `[longitude, latitude]` that `properties.location`
uses. Both are correct for their own collection and readers; converting one to
the other is the conversion to get right, and getting it wrong does not throw.

## Route map

```
/api/v1/health              process + database status         (shared router)
/api/v1/properties          onboarding CRUD, Cloudinary upload, WhatsApp verification
/api/v1/admin               admin console accounts, stats, activity, system telemetry
/api/v1/verifications       owner/verifier verification requests
/api/v1/whatsapp            Twilio inbound webhook
/api/v1/permissions         employee edit/delete permission requests
/api/v1/admin/food-restaurants  the restaurant approval queue and its decisions
/api/v1/admin/drivers       the rider queue: per-DOCUMENT verdicts, approvals, suspensions
/api/v1/admin/support       the support queue: every thread from all three apps

/api/v2/health              process + database status         (shared router)
/api/v2/listings            public Explore feed for lampose.com
/api/v2/visit-requests      availability requests: OTP, then the owner is asked
/api/v2/properties          direct property CRUD for the leads panel
/api/v2/auth                leads panel + onboarding employee login
/api/v2/users               leads panel team management
/api/v2/scraper             Google Maps lead scraping, leads, CSV export,
                            POST /leads — adding one by hand
/api/v2/customers           mobile app accounts: phone + one-time code, profile
/api/v2/support             the DINER's support tickets and safety reports
/api/v2/partners            Stay Partner app: owner accounts, properties, visit requests
/api/v2/food-partners/support  the KITCHEN's support tickets  (mounted before /food-partners)
/api/v2/food-partners       Food-Partner app: onboarding, menu, orders, payment, discovery
/api/v2/drivers/support     the RIDER's support tickets  (mounted before /drivers)
/api/v2/drivers             Driver app: rider accounts, duty, live position, delivery offers
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

### After AVAILABLE: the ₹199 assisted visit

A confirmed **bachelor or co-live** request (`payment.required`, decided from
the category when the request was made and frozen there) has exactly ONE
charge: a **₹199 assisted visit** — a Lampose representative accompanies the
customer to the property. Explained everywhere as ₹100 for the representative
plus ₹99 Lampose fee (`VISIT_ASSISTED_REPRESENTATIVE_PAISE` is display-only;
the whole `VISIT_ASSISTED_AMOUNT_PAISE` is charged in one shot).

> The ₹20 visit token, the ₹99 Direct Access contact unlock and the
> advance/balance split this section used to describe are **retired**. Their
> env vars do nothing, their routes are gone, and the webhook acknowledges
> their `purpose` notes as legacy without acting on them.

The flow, in order — the ordering IS the product:

1. Owner replies AVAILABLE → the pay window (`payment.dueBy`) starts and the
   customer gets the WhatsApp pay message (template T1: breakdown, Razorpay
   payment link, listing link). No address, no PIN — there is no PIN on paid
   categories at all, because the representative is at the door.
2. The customer pays — WhatsApp link, website checkout, or the app's WebView
   checkout. All three settle the same `payment` subdocument through
   `markVisitPaid` (`visitPayment.controller.js`), which flips the visit to
   `slot_pending` and sends "payment received" (T2, with a **Pick my slot**
   quick-reply button) — or a push on the app channel.
3. The customer picks a slot. **Web channel: inside WhatsApp** — the button
   tap opens the session, then a day list and a time list
   (`assistedSlot.controller.js → handleSlotReply`, dispatched from the shared
   webhook by the `pick_slot` payload and `day_*` / `t_*` list ids). **App
   channel: an in-app picker** posting `POST /:id/assisted/slot`. The website
   never takes the slot — it tells the customer to pick it on WhatsApp, so a
   link-payer and a site-payer have the same next step.
4. `confirmSchedule` is the single commitment point: it stamps the visit
   `scheduled`, **releases the address**, and tells everybody at once — the
   customer (M1 with address + maps link, or a push), the owner (template T3,
   or a push), and the roster (`VERIFICATION_TEAM_NUMBERS`, plain WhatsApp).
5. "Another day" / "A different time" marks the visit `manual`: the team is
   told to call, the customer is told the team will, and nothing is lost.

A paid visit with no slot after `VISIT_SLOT_REMINDER_HOURS` (default 2) gets
exactly one reminder (T4 / push) plus a roster alert, sent by
`slotReminder.worker.js` — same design as the expiry worker, guarded update
so two instances send once.

#### The webhook and legacy money

`payment_link.paid` / `payment.captured` land on
`razorpayWebhook.controller.js`. Purpose `assisted_visit` — or **no purpose**,
which is what old payment links look like, including retired ₹20 token links
still sitting in WhatsApp histories — routes to `markVisitPaid`, behind an
**amount guard**: a payment short of `payment.amountPaise` is logged, the
roster is told to arrange a refund, and nothing is marked paid. Purposes
`contact_unlock` / `assisted_balance` are acknowledged and ignored.

The six Twilio content templates (T1–T4 Meta-approved, two session list
pickers) are documented in `.env.example` — the flow degrades to plain text
without them, which works only inside an open 24-hour session.

---

## The food-delivery loop

The one flow that spans three apps and two collections. It is worth reading
end to end before touching any part of it.

```
User App        POST /api/v2/food-partners/orders
                  every price re-derived from food_products — the request says
                  WHAT, never how much

  cash ─────────► the kitchen is rung, and the dispatcher starts
  online ───────► the order is HELD: paymentStatus 'pending', nobody is told,
                  no rider is sent
                POST .../payment           mints a Razorpay order for OUR figure
                GET  /food-partners/checkout?t=…   the page the app WebViews
                POST .../checkout/callback  signature verified → confirmPayment

backend         foodDispatch.service.js
                  · driverMatch: 2km → 5km → 10km, first ring that finds anyone
                  · ONE offer at a time, nearest first, 15s each
                  · a decline moves to the next rider immediately
                  · nobody left → dispatch.state 'unassigned', retried when the
                    kitchen marks the order ready

Driver app      delivery_offer over socket.io  AND  GET /drivers/me/offer
                POST /drivers/orders/:n/accept    ← one atomic claim, no race
                PATCH .../status picked_up        ← the KITCHEN's 4-digit code
                PATCH .../status delivered        ← the DINER's 4-digit PIN

Food-Partner    PATCH /me/orders/:n/status accepted → preparing → ready
User App        GET /food-partners/orders/:n every 8s while the order is live
```

Two things are load-bearing and easy to undo by accident:

- **`status` is the kitchen's track; `dispatch.state` is the rider's, and they
  run in parallel.** An order is being cooked and looked for at the same time.
  Folding the search into `status` makes that state unrepresentable.
- **`paymentStatus: 'paid'` has exactly one cause: a verified Razorpay
  signature.** The in-app verify, the checkout callback and the webhook all
  funnel through `confirmPayment` for that reason. Nothing else may set it.

`npm run verify:food-dispatch` walks the whole loop, including the parts that
would fail silently: a rider who was not offered an order cannot accept it, two
riders cannot both get one, the hand-over codes are actually checked, an unpaid
online order sends nobody and is invisible to the kitchen, and the rider's
position reaches the diner as `[lng, lat]` rather than swapped.

### Getting a rider onto the road

Before any of the loop above can reach somebody, a person has to be approved,
and that span crosses the Driver app and the admin console:

```
Driver app      PATCH /v2/drivers/me            each step of the form
                POST  /v2/drivers/me/uploads/images   a scan → Cloudinary
                POST  /v2/drivers/me/documents  one document at a time
Admin console   PATCH /v1/admin/drivers/:id/documents/:kind   verify / send back
                PATCH /v1/admin/drivers/:id/decision          approve / suspend
Driver app      GET   /v2/drivers/me            the verdict, in our words
                POST  /v2/drivers/me/duty       now allowed
```

Three rules hold it together, and each one exists because the alternative was a
bug we had:

- **Two levels of verdict.** `documents[].status` is one document, one reason —
  "photograph this again", which leaves the account exactly where it is.
  `status` is the account. Collapsing them means one blurred PAN card rejects a
  rider who sent four perfect documents.
- **`hasCompletedOnboarding` is DERIVED, never accepted.** The app says "I am
  done"; `PATCH /me` runs `onboardingProgress` and only agrees if the name, the
  date of birth, the city, the vehicle, the three required documents and a
  payout destination are all really there. That flag gates the duty switch, so
  a client that could set it could put an unidentified rider in front of a
  diner by sending one boolean.
- **Nothing on the driver router writes either verdict.** Approval and every
  document decision live behind `verifyAdminToken`, in a different identity
  system. A module that can approve its own accounts is one where "approved"
  means nothing.

`documents` was an object of three scalars before it was a list, and riders
created then still hold one — `readDocuments` reads the old shape (a licence
number and its scan become the `licence` row) and a `pre('validate')` hook
sweeps the empty husk out on the next write. Without both, one legacy rider
500s the entire approval queue and can never edit their own profile again.

`npm run verify:driver-onboarding` walks all of it.

### Telling somebody an order arrived

Both partner apps are told the same way, and the design point is that neither
depends on a push:

| Who | Live event | Fallback |
| --- | --- | --- |
| Rider | `delivery_offer` | `GET /drivers/me/offer`, every 4s while online |
| Kitchen | `order_placed` | `GET /food-partners/me/orders`, every 20s |

`order_placed` is emitted by `foodOrder.notifier.js` into `restaurant:<id>`,
**before** the push and outside its `pushReady()` guard. That ordering is the
whole fix: a push needs a registered device token, `getPushToken` returns null
on a simulator and on a refused permission, and the first restaurant in
production had ZERO registered handsets — so the notifier logged "no handset is
registered", returned, and the kitchen learned about each order silently on the
next poll. The socket needs nothing but the session the app already holds.

`emit` returns `false` rather than throwing when no socket server is attached,
so the notifier reads its RETURN VALUE for the `live` flag; assuming success
would have the log line claim a live event on exactly the deployments that
never sent one.

Both apps then play a tone **themselves** rather than relying on the
notification to make the noise — a foregrounded app shows no notification, and
a counter tablet face-up across the room is foregrounded. The two tones are
deliberately different (the rider's is urgent and staccato, the kitchen's a
warm two-note chime): a rider collecting at a counter is standing next to the
tablet, and one tone across both apps is two people reaching for one phone.

### Following the rider

`PATCH /api/v2/drivers/me/location` is the hot path — four writes a minute per
online rider, and a single `updateOne` for that reason. It feeds two readers:


**Four writes a minute means a heartbeat, not a GPS callback.** The app's
position watch is silent below five metres of movement, so a rider waiting at a
junction produces no updates at all — and a fix over five minutes old is treated
as no fix, which drops them out of every search silently. `driver/` therefore
re-sends the last position on a 15-second timer whether or not it changed
(`LOCATION_HEARTBEAT_MS`), which is twenty consecutive misses before the window
closes and is where that window's five minutes comes from. This README claimed
the fifteen seconds long before anything implemented it; a stationary rider sat
online all shift receiving nothing.

- the **dispatcher**, which skips any rider whose last fix is over 5 minutes old
  (`driver.model.js`), because offering to a stale position burns a full
  16-second timeout on somebody who is asleep;
- the **diner's map**, joined onto the single-order read only. That one drops a
  fix over 2 minutes old — deliberately a *shorter* patience than the
  dispatcher's, because a marker left sitting still reads as a rider who has
  stopped, which is more alarming than "we cannot see your rider right now".

The list endpoint carries no positions at all: fifty orders would be fifty
driver lookups to draw markers nobody is looking at.

Both apps draw the same three points — kitchen, rider, door — with the same
projection, at one uniform scale, with a scale bar and a real haversine
distance. There are no street tiles: that means a native module and a Google
Maps key, and `User App/components/food/DeliveryMap.tsx` is the seam where they
would go. The geometry is duplicated in `driver/components/ui/MapPanel.tsx`
because this monorepo has no workspace tooling — if you change one, change the
other, or the rider and the diner are reading two different pictures of one
journey.

### Realtime is an optimisation, never a dependency

`socket.io` rides on the same HTTP server and the same port. A rider's offer
expires in fifteen seconds, which is shorter than any polling interval a phone
can afford all day — so the offer is pushed.

Everything it carries is also readable over HTTP: `GET /drivers/me/offer` for
the rider, an 8-second poll for the diner, a 20-second poll for the kitchen.
`require('socket.io')` is in a try/catch and every emit is a no-op without it,
so a deployment that has not run `npm install` since this landed degrades to
polling and says so in the boot banner. Behind nginx the delivery flow needs
the `Upgrade`/`Connection` headers proxied; without them it falls back to
long-polling on its own.

## Six identity systems

They share a process, a database and one signing secret, and nothing else. Do
not try to make one verify another's tokens — what keeps them apart is the
`typ` claim, asserted by each guard.

| | Collection | Login | `typ` |
| --- | --- | --- | --- |
| v1 admin console | `admins` | `/api/v1/admin/login` | `admin` (verified on every request — see below) |
| v2 leads panel | `scriper_users` | `/api/v2/auth/login` | — (looked up by `userId`) |
| User App | `app_customers` | `/api/v2/customers/auth/…` | `customer` |
| Stay Partner | `app_partners` | `/api/v2/partners/auth/…` | `partner` |
| Food-Partner | `food_restaurants` | `/api/v2/food-partners/auth/…` | `foodpartner` |
| Driver | `app_drivers` | `/api/v2/drivers/auth/…` | `driver` |

The four app systems all use a phone number and a one-time code. None of them
has a password, for the reason `customer.model.js` sets out.

The onboarding app authenticates its field agents against the **v2 leads**
accounts (`/api/v2/auth/onboarding-login`), then identifies them on writes with
the `x-employee-email` header, which the v1 permission gate reads — and which
is now **bound** to the token: it must equal the signed-in employee's own
address, and a request with neither an employee token nor an admin token is
refused (`src/modules/iam/iam.middleware.js`).

### Access control (IAM)

**One permission table.** `src/modules/iam/iam.roles.js` says which console
role holds which capability (`money.release`, `support.answer`,
`admins.manage`, …). Every admin router guards by capability through
`can('…')` / `requireAdminWith('…')`, never by a role name, and the login and
`GET /api/v1/admin/me` responses hand the console the same table's answer as
`capabilities[]`, which is what the console shows and hides by. Add a power in
one place.

**The console's token is `{ id, typ: 'admin', ver }`** (`admins/adminToken.js`),
default 12 hours (`ADMIN_SESSION_TTL`). `verifyAdminToken` checks, on every
request, that the account exists, is Active, and that `ver` equals the
account's `sessionVersion` — so a password change, a role or status change made
by a Super Admin, or `POST /me/sign-out-everywhere` ends every open session on
its next request. Tokens from before `typ` existed are refused with
`LEGACY_TOKEN`; one sign-in is the whole migration.

**Bootstrap, then the console.** `POST /api/v1/admin/register` creates the
FIRST administrator only (a Super Admin, guarded by `V1_ADMIN_SECRET_KEY`) and
answers `403 BOOTSTRAP_DONE` afterwards; `GET /bootstrap` tells the login page
whether to offer it. Every later account is created from Administrators by a
Super Admin, who can never change their own role or status, and can never
demote, deactivate or delete the last active Super Admin. Logins are
rate-limited per IP and per email.

**The two stay-side app identities revoke the same way.** `app_customers` and
`app_partners` carry `sessionVersion`, their tokens carry it as `ver`, the
guards and the socket handshake compare the two, and `POST …/auth/logout
{ everywhere: true }` bumps it (`iam/session.controller.js`).

**The WhatsApp webhook proves its sender.** `POST /api/whatsapp/webhook`
refuses any request without a valid `X-Twilio-Signature`
(`shared/middleware/twilioSignature.js`); `ALLOW_UNSIGNED_WEBHOOKS=true` skips
it for a laptop with no tunnel and is refused in production.

`npm run verify:access` asserts all of it — every unauthenticated call is
refused, every role is refused what the table denies, and a bumped session
version kills a live token for all three identities.

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

**Which database a script touches** is the first thing to know about it, so it
is the first column. `guarded` means the script calls
`src/infrastructure/database/guard.js` and will refuse outright unless the
resolved database looks like a development one — see
[Development versus production](#development-versus-production).

| Target | Command | What it does |
| --- | --- | --- |
| guarded | `npm run verify` | 78 checks. Boots the app and replays every call the three frontends make, checking each response carries the fields the calling component reads. Add `--scrape` for a live Google Maps scrape. Cleans up after itself, in MongoDB *and* Cloudinary — but it **creates ten real property listings** while it runs, which is why it refuses to run against the live database. `SMOKE_URL=` still reaches a deployment over HTTP. |
| `npm run smoke` | Faster "is it healthy" check, including the CORS preflight from each production origin. `SMOKE_URL=https://api.lampose.com npm run smoke` to test a deployment. |
| `npm run inspect:db` | Collection names, counts and document shapes. Never prints the connection string. |
| `npm run inspect:properties` | Category/stayType/amenity tallies and image coverage across `properties`. |
| `npm run export:listings` | Build-time snapshot of `properties` into the public site's `src/data/listings.js`. `:clean` drops obvious test rows. |
| `npm run migrate:json` | One-way, idempotent import of an old `data/*.json` leads store into MongoDB. |
| `npm run seed:admins` | Creates the first v1 Super Admin. Refuses unless `ADMIN_PASSWORD` is set. |
| `npm run verify:food-order` | The order loop: a diner orders, the kitchen accepts, cooks and marks ready, the diner tracks it. |
| `npm run verify:food-dispatch` | The delivery loop: two riders, a real dispatch cascade, both hand-over codes, and the races. Needs an approved restaurant **with a map pin** — `npm run seed:food-menu` first. |
| `npm run verify:addresses` | Addresses for all three identities that have one: the diner's book (one default always, including after the default is deleted; a partial edit that does not clear the other fields), and the rider's and owner's single address. Asserts the pin stays `[lng, lat]`, that a pin can be cleared with `null`, and that adding a rider address does NOT change whether an approved rider can go online. |
| `npm run verify:driver-onboarding` | Rider sign-up through approval: the form the server re-derives rather than trusts, one document at a time, the console's per-document and per-account verdicts, and the duty switch that only opens at the end. Needs nothing seeded, and texts nobody — the code is seeded the way `issueOtp` seeds it, because `sendOtpSms` reaches the live gateway in development too. |

`verify` deliberately skips a complete `POST /api/v1/properties` (it would
send a real WhatsApp message to a real number — the route is exercised through
its validation paths instead) and live scrapes unless `--scrape` is passed.

## Development versus production

**The invariant: a developer's credential cannot write the live database.**
The guard below is a seatbelt. The Atlas user is the wall, and it is the half
that actually holds — it survives a hardcoded URI, a typo, a pasted
`mongosh` command and a script nobody reviewed.

| Atlas user | Roles | Lives in |
| --- | --- | --- |
| `lampose_api_prod` | `readWrite` on the live database | `/srv/lampose-api/.env`, `chmod 600` |
| `lampose_dev` | `readWrite` on `lamp_booking_dev`, at most `read` on live | every developer's `Backend/.env` |

Developers set **both** `DB_NAME` and the URI's path to the development
database. `DB_NAME` wins at connect time (`db.js`); the path covers anything
that reads the URI directly.

### The guard

`src/infrastructure/database/guard.js` resolves the database a connection
would actually reach — in mongoose's own precedence, `dbName` → `DB_NAME` →
the URI path — and classifies it. Every script that writes calls it before
its first write, and **`tests/guard.test.js` fails if a new one does not.**
That test, not this paragraph, is what keeps the property true.

Three things worth knowing about how it judges:

- **It fails closed on "unknown".** A denylist answers "is this one of the
  databases we thought of?", and the database that eats a client's listings
  is the one nobody thought of. A scratch database just needs a name ending
  `_dev`, `_test`, `_local`, `_scratch`, `_staging` or `_sandbox`.
- **Loopback is always development**, whatever the database is called, so
  `mongodb-memory-server` and a local restore both work without ceremony.
- **`NODE_ENV` can only add suspicion, never remove it.** A laptop set to
  `development` while pointed at the live cluster is the exact bug this
  exists for.

The deliberate override names the database rather than passing a flag:

```
LAMPOSE_ALLOW_WRITES_TO=lampose_prod npm run migrate:categories -- --apply
```

A boolean `--force` copied out of a chat log unlocks whatever database
happens to be configured; a name only unlocks the one somebody typed out.

The **server never refuses** — `db.js` prints a loud banner beside the
connect line and carries on, because a server that exits over a
misconfiguration turns it into "nothing is listening", which a browser cannot
tell apart from a network fault. Refusal belongs in scripts, which have
nobody waiting on them.

### Moving the real data to a clean database

```
npm run review:snapshot                              read-only; writes review-snapshot.json
# review the rows, record verdicts, save them to review-decisions.json
npm run migrate:clean-db -- --to lampose_prod        report only
npm run migrate:clean-db -- --to lampose_prod --confirm-database lampose_prod
```

The verdicts are a **deny-list**: anything unmentioned is copied. The live
database grows while the review happens, so an allow-list would silently drop
every listing onboarded in between. `unsure` counts as keep, and is reported.

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
