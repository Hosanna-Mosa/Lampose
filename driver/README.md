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
  auth.tsx              Sign in / sign up with OTP
  onboarding.tsx        4-step partner setup
  (tabs)/               Home, Jobs, Earnings, Profile
  active-order.tsx      Live job: map, step flow, hand-off codes
  chat.tsx              Customer chat over socket.io
  add-address.tsx       Saved addresses with autocomplete
  identity-verify.tsx   Aadhaar / PAN verification

theme/                  Design tokens — colours, spacing, radii, type, shadows
components/ui/          Shared primitives (Button, Card, Input, Banner, …)
components/order/       Active-job pieces (OrderMap, TripStats, ContactBar, …)
store/driverStore.ts    Zustand store, persisted to AsyncStorage
utils/                  api client, socket service, formatters, fare, polyline
hooks/                  useDriverLocation (GPS + compass + broadcast)
```

### Design system

Every colour, size and shadow lives in [`theme/index.ts`](theme/index.ts). Screens
import tokens rather than hardcoding values, so the palette can be re-skinned from
one file. The brand colours are mirrored in `app.config.js` (splash, adaptive icon,
notification tint) — keep the two in sync.

## Demo mode (no backend)

`EXPO_PUBLIC_AUTH_MODE=mock` swaps the auth endpoints for
[`utils/mockAuth.ts`](utils/mockAuth.ts), so you can sign in and walk the app
without a server running.

- **Demo account:** `+91 9876543210` / `demo1234` — already onboarded and verified,
  so it lands straight on the tabs. The sign-in screen shows these with a **Fill**
  button.
- **Sign-up** works too: any details, and the OTP is always `123456`. New accounts
  start un-onboarded so you can walk the setup flow.
- Accounts are stored in AsyncStorage, so one you create survives a reload.

Set `EXPO_PUBLIC_AUTH_MODE=api` to go back to the real endpoints. Changing it needs
a dev-server restart — `EXPO_PUBLIC_*` values are inlined at bundle time.

Only auth is mocked. Jobs, earnings and history still come from the API, so those
screens stay empty until a backend is reachable.

## Backend endpoints

The app calls `EXPO_PUBLIC_API_URL` and expects:

| Method  | Path                                | Used for                     |
| ------- | ----------------------------------- | ---------------------------- |
| `POST`  | `/api/v1/auth/login`                | Password sign in             |
| `POST`  | `/api/v1/auth/request-otp`          | Send signup OTP              |
| `POST`  | `/api/v1/auth/verify-otp`           | Verify OTP, create account   |
| `GET`   | `/api/v1/auth/me`                   | Revalidate the stored token  |
| `POST`  | `/api/v1/drivers/me/duty`           | Go online / offline          |
| `GET`   | `/api/v1/drivers/me/earnings`       | Earnings summary             |
| `GET`   | `/api/v1/orders/available`          | Nearby job requests          |
| `POST`  | `/api/v1/orders/:id/accept`         | Accept a job                 |
| `PATCH` | `/api/v1/orders/:id/status`         | Advance a job (with code)    |
| `POST`  | `/api/v1/orders/:id/cancel`         | Cancel a job                 |
| `POST`  | `/api/v1/orders/:id/sos`            | Emergency alert              |
| `GET`   | `/api/v1/orders/history`            | Completed / cancelled jobs   |
| `POST`  | `/api/v1/users/addresses`           | Create / update an address   |
| `GET`   | `/api/v1/places/autocomplete`       | Address suggestions          |
| `POST`  | `/api/v1/onboarding/verify-aadhaar` | Aadhaar check                |
| `POST`  | `/api/v1/onboarding/verify-pan`     | PAN check                    |

Socket.io events (same host): `driver_online`, `driver_offline`,
`driver_location_update`, `track_order`, `new_order_request`, `send_message`,
`receive_message`, `order_status_update`, `assign_task_confirmed`,
`helper_status_update`, `driver_issue_reported`.

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
