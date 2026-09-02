# Driver

Partner app for delivery riders, ride drivers and helper-task workers. Built with
Expo (SDK 54), Expo Router and React Native.

## Getting started

```bash
npm install
cp .env.example .env      # then fill in the values
npm run dev
```

| Script              | What it does                          |
| ------------------- | ------------------------------------- |
| `npm run dev`       | Start the Metro dev server            |
| `npm run android`   | Build and run the Android dev client  |
| `npm run ios`       | Build and run the iOS dev client      |
| `npm run typecheck` | `tsc --noEmit` over the whole project |
| `npm run doctor`    | `expo-doctor` dependency audit        |

## Project layout

```
app/                    Routes (expo-router, file-based)
  _layout.tsx           Root stack + auth gate + splash handling
  auth.tsx              Sign in / sign up: a number, then a six-digit code
  onboarding.tsx        Partner setup — four steps, each one a real form that
                        PATCHes before it advances, ending in the verdict.
                        Personal details, vehicle, the five documents (a photo
                        plus a number each, uploaded and submitted one at a
                        time), and where to be paid. Nothing here can mark the
                        form finished: `PATCH /me` re-derives completeness and
                        refuses, naming what is left.
  (tabs)/               Home (duty + offers), Orders, Earnings, Profile
  request.tsx           A live offer: 15s, two numbers, accept or decline
  active.tsx            The job in hand: map, stages, both hand-over codes
                        The map is components/ui/MapPanel.tsx — a relative map
                        on react-native-svg, drawing the rider's own GPS
                        against the pickup and the drop at one uniform scale.
                        No tiles: react-native-maps IS a dependency here, so
                        upgrading is possible, but it needs a Google Maps key
                        and a dev build. The customer app draws the same three
                        points from the other side in
                        `User App/components/food/DeliveryMap.tsx` — if you
                        change the geometry in one, change the other.
  complete.tsx          What the delivery paid

theme/                  Design tokens — colours, spacing, radii, type, shadows
components/ui/          Shared primitives (Button, Card, Input, Banner, …)
components/order/       Active-job pieces (OrderMap, TripStats, ContactBar, …)
store/driverStore.ts    Session, duty, the live offer, the job in hand
store/flowStore.ts      Screen state only — sheets, toasts, tab selection
utils/                  api client, socket service, formatters, polyline
hooks/                  useDriverLocation (GPS + compass)
```

### Design system

The app renders in the same visual language as the customer app's Food module.
The tokens in [`theme/index.ts`](theme/index.ts) are a direct port of
`User App/constants/tokens.ts`: grey ground, white cards, one saturated green,
near-black labels on the green, and hairline borders instead of shadows.

Rules that are load-bearing rather than stylistic:

- **Type comes from a scale, never from a size.** Screens render text through
  [`components/ui/Text.tsx`](components/ui/Text.tsx) and name a `variant`
  (`title1`, `body`, `priceLg`, `eyebrow`, …). There is no `fontSize` prop.
  Archivo carries headings, Instrument Sans carries reading text, and Martian
  Mono carries every figure — money, distance, ETA, order id, hand-off code —
  so digits stay column-aligned and a counting-down ETA never reflows its row.
- **Status names a tone, never a colour.** `success` / `warning` / `danger` /
  `info` / `muted` / `brand` resolve through `tone()` to a `{base, ink, tint,
  border, on}` set. A screen that picks a hex for a status chip is a bug.
- **Status is never carried by colour alone.** Every chip has a glyph or a
  word beside it; success shares the brand green and is only distinguishable
  from a primary button by shape and content.
- **Radius is chosen by what an element *is*** — `chip` / `button` / `card` /
  `sheet` / `pill` — not by how big it is.
- **Sizes are literal points.** `moderateScale`/`ms()` is gone; a 16pt gutter
  is 16pt on every handset, which is what makes this app and the customer app
  actually match. `react-native-size-matters` is now unused.

The palette ships light-only. `theme/index.ts` also exports a complete dark
palette (`palettes.dark`), unused — the rider app has no appearance setting,
and following the OS preference would be a behaviour change rather than a
reskin. Wiring it up means putting `colors` behind a provider.

The brand colours are mirrored in `app.config.js` (splash, adaptive icon,
notification tint) — keep the two in sync.

## Getting a rider onto the road

There is no demo mode. Every screen reads the real backend, and the whole loop
runs on a laptop:

1. `cd ../Backend && npm run dev`.

   > **The OTP is a real SMS, in development too.** This file used to claim the
   > code is printed to the console outside production; it is not —
   > `infrastructure/sms/sms.js` calls the live gateway whatever `NODE_ENV`
   > says. Sign in with a number you own. An invented ten-digit Indian mobile
   > number belongs to somebody, and they get the text.
2. `npm run seed:food-menu` in `Backend/`, and give the seeded restaurant a
   `location` pin — the dispatcher searches around it.
3. Sign in here with any 10-digit number and the code from the backend log.
4. The account starts `pending`. Finish the four onboarding steps — the
   document photos go to Cloudinary, so `CLOUDINARY_*` has to be set in
   `Backend/.env` or that step answers a named 503.

   Each step carries a **Fill with dummy data** button in development, which
   fills that step and advances. It will not invent the three fields an account
   is identified by — the mobile number, the email address and the date of
   birth — and refuses, pointing at the field, if one is still blank. The
   document step attaches placeholder scan URLs rather than uploading, so the
   flow is walkable without Cloudinary configured; use the camera path when the
   upload itself is what is being tested. `constants/dummyPartner.ts` holds the
   values and the `EXPO_PUBLIC_ALLOW_DUMMY_DATA` switch for preview builds.
5. **Put yourself somewhere the dispatcher can see you.** An emulator reports
   the Googleplex until told otherwise — 13,476km from Rajahmundry — and the
   dispatcher only searches 2/5/10km around the KITCHEN'S pin, so every order
   finds nobody and neither app says why. In a development build the Home
   screen carries a **Test location** panel: "Put me in Rajahmundry", or paste
   a pin copied from the admin console. It reports through the same
   `PATCH /me/location` a real fix does.
6. Approve the rider in the admin console: **Food → Delivery Riders**. Verify
   each document (or send one back with a reason, which the app then shows on
   that document), then approve the account. Until that happens the duty switch
   refuses, in the server's own words.

   `npm run verify:driver-onboarding` in `Backend/` walks that whole span —
   sign-up, the form, the documents, the console's verdicts and the duty switch
   — headlessly, and texts nobody.
7. Go online, place an order from the User App, and the offer arrives.

`npm run verify:food-dispatch` in `Backend/` walks the same loop headlessly.

## Backend endpoints

The app calls `EXPO_PUBLIC_API_URL` and expects the **v2 driver surface** —
`app_drivers`, the sixth identity system in the Lampose backend, whose tokens
carry `typ: "driver"`:

| Method  | Path                                       | Used for                       |
| ------- | ------------------------------------------ | ------------------------------ |
| `POST`  | `/api/v2/drivers/auth/start`               | A number in, a code out by SMS |
| `POST`  | `/api/v2/drivers/auth/resend`              | Another code                   |
| `POST`  | `/api/v2/drivers/auth/verify`              | The code back, a session out   |
| `GET`   | `/api/v2/drivers/me`                       | Profile, documents, approval, duty |
| `PATCH` | `/api/v2/drivers/me`                       | Name, dob, city, vehicle, payout |
| `GET`   | `/api/v2/drivers/me/documents`             | The five-row checklist and its verdicts |
| `POST`  | `/api/v2/drivers/me/documents`             | Submit or resubmit one document |
| `POST`  | `/api/v2/drivers/me/uploads/images`        | A photo to Cloudinary, URL back |
| `POST`  | `/api/v2/drivers/me/devices`               | Register this handset for push |
| `POST`  | `/api/v2/drivers/me/duty`                  | Go online / offline            |
| `PATCH` | `/api/v2/drivers/me/location`              | Position, every 15s while online |
| `GET`   | `/api/v2/drivers/me/offer`                 | The live offer (poll fallback) |
| `GET`   | `/api/v2/drivers/me/orders/active`         | The job in hand                |
| `GET`   | `/api/v2/drivers/me/orders`                | What has been carried          |
| `GET`   | `/api/v2/drivers/me/earnings`              | Derived from delivered orders  |
| `POST`  | `/api/v2/drivers/orders/:n/accept`         | Take the job                   |
| `POST`  | `/api/v2/drivers/orders/:n/decline`        | Pass it to the next rider      |
| `POST`  | `/api/v2/drivers/orders/:n/release`        | Give back a job you cannot do  |
| `PATCH` | `/api/v2/drivers/orders/:n/status`         | `picked_up` / `delivered` + code |

**An offer makes a noise.** `services/alertSound.ts` plays
`assets/sounds/offer.wav` — three rising staccato pulses — from `receiveOffer`
in the store, which is the ONE place both transports arrive and is idempotent
on the order number, so the tone plays once per offer rather than once per
delivery mechanism. It is played by the app rather than left to the push
notification because a foregrounded app shows no notification at all, and a
phone in a handlebar cradle with the screen on is how a rider actually waits
for work. The session is opened with `playsInSilentMode`, since a rider's phone
lives on silent and this is work arriving. The Food-Partner app plays a
deliberately different chime — see `Backend/README.md`.

Socket.io on the same origin, authenticated by the same bearer token in the
handshake. In: `track_order`, `untrack_order`, `driver_location`. Out:
`delivery_offer`, `delivery_offer_closed`, `delivery_cancelled`,
`dispatch_update`.

**The socket is an optimisation, never a dependency.** An offer arrives over
it *and* over the four-second `GET /me/offer` poll, and both funnel into one
idempotent handler — a rider in a lift, on a train, or on a deployment with no
socket server still gets their work.

The API client treats a 4xx as a real rejection and surfaces it, but lets transport
failures fall through so a patchy connection doesn't strand a driver mid-job.

## Before you ship

- **Google Maps key** — set `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`. For EAS builds store
  it as a secret rather than committing it:
  `eas secret:create --name EXPO_PUBLIC_GOOGLE_MAPS_API_KEY --value <key>`
- **EAS project** — run `eas init` to create one and populate `extra.eas.projectId`.
- **Firebase** — drop your own `google-services.json` in the project root for Android
  push. `app.config.js` wires it up automatically when the file is present.
- **API URLs** — `eas.json` ships with `example.com` placeholders for the preview and
  production profiles.
- **Terms & privacy** — the Profile screen links to placeholders.
- **Identity verification** — in dev builds a failed verification call falls through
  so the flow stays testable. Production builds always surface the failure
  ([`app/identity-verify.tsx`](app/identity-verify.tsx)).

### Typed routes

`experiments.typedRoutes` is **off**. expo-router's type generator strips a trailing
`/index` before normalising Windows path separators, so `(tabs)/index.tsx` gets typed
as `/index` instead of `/`, and files outside `app/` leak in as routes — which breaks
`npm run typecheck` even though routing works fine at runtime. `.expo/types` is
excluded from `tsconfig.json` to match. Re-enable both together once that's fixed
upstream.
