# Lampose: user stories and gap audit, testing phase

**Date:** 2026-09-24 · **Branch:** `main` @ `5da550a`

**What this covers.** The four client apps and the backend that connects them:

| App | Folder |
|---|---|
| User App | `User App/` |
| Stay Partner | `Stay Partner/` |
| Food-Partner | `Food-Partner/` |
| driver | `driver/` |
| Backend | `Backend/` |

`Tracker-app/` is out of scope, as requested.

**How it was done.** This was a read-only audit.
- One reviewer read every route file, screen, component, hook, service, store and context in each app.
- Every API call was traced to its backend handler. We compared the request fields, the response shape the app reads, and the guard on the route.
- Two more reviewers followed the stories that cross apps:
  - the **food loop**: diner → kitchen → rider
  - the **stay loop** (student → owner) and the shared features: support, account deletion, push notifications, sessions and addresses.
- The most severe findings were re-checked by hand against the code. Those are marked **checked**.

**Previous audit.** Every finding from the older `CROSS_APP_AUDIT_FINDINGS.md` was re-checked and marked Fixed or Still open. See the "items from the previous audit" subsection at the end of each app section.

> ⚠️ Nothing below has been run on a device. Items marked *confirm on device* are inferred from the code. For everything else, the file:line is the evidence.

## How to read this

- **Story status:** ✅ works end to end · ⚠️ works with a gap · ❌ broken or missing.
- **Acceptance criteria:** each story has checks a tester can run. A ✗ (or ❌) on a check means it fails in the current code.
- **Severity:**
  - 🔴 **Critical:** blocks a core journey, loses money, or is a security hole.
  - 🟠 **High:** a real bug with wrong data or a broken feature, and no workaround.
  - 🟡 **Medium:** partial or inconsistent, but has a workaround.
  - ⚪ **Low:** polish, copy or dead code.
- **Gap IDs** start with the area they belong to:

| Prefix | Area |
|---|---|
| `G-UA-` | User App |
| `G-SP-` | Stay Partner |
| `G-FP-` | Food-Partner |
| `G-DR-` | driver |
| `G-FL-` | Food loop across the three food apps |
| `G-ST-` | Stay loop, User App and Stay Partner |
| `G-SH-` | Shared features across all four apps |

## Gap counts

| Section | 🔴 Critical | 🟠 High | 🟡 Medium | ⚪ Low |
|---|---|---|---|---|
| 1. User App | 3 | 23 | ~72 | ~70 |
| 2. Stay Partner | 4 | 12 | 20 | 15 |
| 3. Food-Partner | 1 | 9 | 21 | 16 |
| 4. driver | 1 | 4 | 15 | 18 |
| 5. Food loop (cross-app) | — | 6 | 8 | 12 |
| 6. Stay loop and shared (cross-app) | — | 4 | 13 | 9 |

Some problems show up in more than one section because each side of a seam was audited separately. The list below removes those duplicates.

## Release blockers, de-duplicated, fix these first

| # | Problem | IDs |
|---|---|---|
| 1 | **The public listings API publishes every owner's phone number** (`listing.formatter.js:163`, checked). This breaks the rule that the owner is contacted only after OTP or payment. | G-ST-1 = G-UA-H1 |
| 2 | **Anyone can register a restaurant on someone else's phone number.** `/api/v2/food-partners/applications` has no phone-proof guard (checked). | G-FP-1 |
| 3 | **Stay Partner can't check a guest in on their arrival day.** `'arriving'` is missing from the check-in condition (`PrimaryAction.tsx:74`, checked). | G-SP-1 |
| 4 | **PG, Co-live and Bachelor tenants can never be checked out or cancelled**, so beds are never freed and properties fill up for good. | G-SP-2 |
| 5 | **Cancelled or lapsed stay bookings stay payable and block the student forever.** No refund row is written, and the bed isn't released. | G-UA-C2 = G-ST-3, G-ST-2 = G-UA-H12, G-ST-5 |
| 6 | **Referral withdrawal sets points to zero and pays nothing**, and every owner shares the hard-coded code `ANJALI4821` (checked). | G-SP-3, G-SP-4 |
| 7 | **Rider background location stops almost immediately on a real device**, because the headless task can't read the token from SecureStore. After 10 minutes the server takes the order away from the rider. Idle riders also drop out of dispatch 5 minutes after locking the phone. | G-DR-1, G-DR-2 |
| 8 | **Marking an order ready kills open rider offers**, and the rider app keeps holding the dead offer. An order no rider takes once cooking has started has no way out: no retry, no cancel, no refund. | G-FL-1, G-FL-2 = G-DR-5, G-FL-16 |
| 9 | **The hand-over codes prove nothing.** The rider's API response includes the kitchen's pickup code, and the 4-digit delivery PIN has no attempt limit. | G-FL-3 = G-DR-4, G-FL-4 |
| 10 | **Payments land on cancelled food orders** and still ring the kitchen. Payment endpoints return the raw order (payout, commission, pickup code). `confirmPayment` is not atomic. | G-FL-5 = G-UA-H5, G-FL-6 = G-UA-H2 |
| 11 | **The User App Food Home crashes** by breaking the rules of hooks, and the food catalogue ignores location and partner type. *Food is dev-build only today; this blocks the food launch.* | G-UA-C1, G-UA-C3 |
| 12 | **The Food-Partner app ships "sample" buttons in production** that attach 1×1-pixel FSSAI, PAN and cheque images and a fake bank account. | G-FP-2 |
| 13 | **Restaurant map pin is optional and can't be set later**, so no rider is ever dispatched. The kitchen never sees add-ons or line notes. The Open/Closed toggle wipes the restaurant state and can't return to schedule. | G-FP-3, G-FP-4, G-FP-5, G-FP-6 |
| 14 | **New riders get stuck on the onboarding "Done" screen**, with no way to the home screen. | G-DR-3 |
| 15 | **Stay Partner owner-side security:** Add Customer can claim a bed in another owner's property; `DELETE /partners/bookings/:id` hard-deletes any booking without freeing the bed; partner email isn't unique, so one owner can lock another out. | G-SP-9, G-SH-8 ⊇ G-SP-10, G-SP-5 |
| 16 | **No rider payout, and no record of the cash riders collect** on cash-on-delivery orders. | G-FL-23, G-DR-17, G-DR-19 |
| 17 | **Hotel guests who pay are told to "pick a visit slot"**, and the owner is never told the guest paid. | G-ST-4 |
| 18 | **The Play-review customer account can reach real owners and kitchens.** | G-SH-13 |

## Themes that repeat across apps (one fix covers many)

- **Sessions.**
  - Stay Partner never calls its own logout endpoint, and doesn't handle `SESSION_REVOKED`, `PHONE_NOT_VERIFIED` or `ACCOUNT_BLOCKED`.
  - Food-Partner and driver have no `sessionVersion`, so a logout or password reset doesn't kill existing tokens.
  - After a token expires, every app unregisters its push device using the dead token, so the phone keeps receiving pushes.
  - Refs: G-SP-16, G-FP-23, G-DR-12, G-SH-16, G-SH-21.
- **Support.**
  - No app creates the Android `support` channel.
  - No app routes a tap on a `support.*` push.
  - Blocked customers and partners are told to contact support, but support refuses them.
  - Stay Partner has no entry point to general support.
  - Refs: G-SH-6, G-SH-7, G-SH-22, G-SP-15, G-UA-H15/H16/H17.
- **Push taps.**
  - The driver app has no tap handler.
  - Food-Partner's tap handler only mounts after the Orders tab has been opened.
  - Stay Partner reopens the last push on every cold start.
  - The User App sends refund and coupon taps to a broken screen.
  - Refs: G-DR-10, G-FL-25, G-SP-29, G-SH-6.
- **Fake or fixture data shown as real.**
  - User App: listing cards show ₹6,500, "Hyderabad" and stock photos; the Confirmed screen shows a fixture address.
  - Stay Partner: header says "Rajahmundry, AP"; badge says "Verified Owner".
  - Food-Partner: "Paradise Biryani House", "Verified Partner".
  - driver: `DR-285792FE`, a fake bell.
  - Refs: G-UA-H6/H7/H8, G-SP-12, G-SP-20, G-FP-7, G-DR-20, G-DR-22.
- **Screens that don't refresh.**
  - Stay Partner: the Bookings tab and the Requests "read" state.
  - driver: Orders.
  - User App: order card and query cache.
  - Refs: G-SP-11, G-SP-13, G-DR-7, G-DR-8, G-FL-15, G-UA-H18.
- **Timezone.** "Today" on earnings is the server's midnight, not IST, in both driver and Stay Partner (G-DR-18, G-SP-27).
- **Play policy.**
  - `RECORD_AUDIO` and `SYSTEM_ALERT_WINDOW` are declared in the driver and Stay Partner manifests.
  - The driver app has no prominent disclosure before asking for background location.
  - Food-Partner and pending restaurants can't reach account deletion.
  - Refs: G-DR-38, G-SP-36, G-DR-32, G-FP-25.
- **Force update** isn't implemented in any app (G-SH-26).

## Docs that no longer match the code (testers: plan against the code)

- **Food dispatch** now broadcasts the offer to every rider in range, with no 15-second window, and only starts when the kitchen **accepts**. `Backend/README.md` §food-delivery loop and `CLAUDE.md` still describe one offer at a time, nearest first, 15 seconds each, starting at placement.
- **Support** has **four** audiences: there is also `/api/v2/partners/support`.
- **Web visit requests** expire after **5 minutes** by default, not 24 hours.

---

## 1. User App ("Lumina", `User App/`)

**Scope.** This was a read-only audit of every route file under `User App/app/` and every component, hook, service and context behind them. Each API call was traced to its handler in `Backend/src/modules/`, and envelope shapes were compared against what the app reads. No files were changed.

**Method.** Six parallel auditors covered the areas below. I re-opened and confirmed the highest-severity findings myself:
- FoodHome hooks crash
- `ownerMobile` leak
- the ₹6,500 and "Hyderabad" placeholders on listing cards
- `toJSON` leak from the payment endpoints
- cancelled booking left `confirmed`
- fixture address on the Confirmed screen
- CONFIRMED booking has no actions
- resolved ticket reopens itself
- support pushes dropped
- maintenance fixture copy
- `queryClient` never cleared

**Line references.** Paths are relative to the repo root. `UA/` means `User App/` and `BE/` means `Backend/src/modules/`.

**Important context.** The food module only renders when `EXPO_PUBLIC_FOOD_MODE=dev` and the build is not production (`UA/constants/env.ts:167-171`, `UA/app/home.tsx:602,1155-1166`). A production build shows `FoodComingSoon`. The `/food/*` routes still exist and can be opened by deep link. Food findings block launching food, not the current production app.

**Contract summary.** Every path and method in `UA/services/api/endpoints.ts` matches the backend. Envelopes match for:
- auth
- `/me`
- notifications (including the `unread` sibling)
- listings, meta, reviews, saved
- addresses
- support
- food kitchens, menu, place order and orders

Two contract problems remain:
- `couponRefusal` is a sibling field next to `data` and is dropped by `unwrap()`.
- The app has no endpoint for `PATCH /food-partners/orders/:n/delivered`.

Most defects are about meaning, state and UX, not transport.

---

### 1.1 User stories

Legend: ✅ works · ⚠️ partial · ❌ broken or missing

#### 1.1.1 Auth / OTP

| # | Story | Screens | Endpoint → handler | Status |
|---|---|---|---|---|
| AU1 | As a customer, I want to type my mobile number and receive an SMS code, so that I can sign in without a password. | `UA/app/(entry)/auth.tsx:163-186`, `UA/context/AuthContext.tsx:425-495` | `POST /api/v2/customers/auth/start` → `startAuth` (`BE/customers/customer.controller.js:134`); rate limits 20/h per IP and 6/h per phone | ✅ |
| AU2 | As a customer, I want to enter the code and be signed in, so that I can book and order. | `auth.tsx:188-224`, `AuthContext.tsx:512-581` | `POST …/auth/verify` → `verifyAuth` (`:270`) | ✅ |
| AU3 | As a customer, I want a wrong code to tell me how many tries I have left. | `AuthContext.tsx:555-562`, `auth.tsx:257-259` | same (`:322-337`) | ✅ |
| AU4 | As a customer, I want a locked code to say so and let me request a new one. | `auth.tsx:252-253,560-568` | same (`:302-312`) | ⚠️ The unlock time is never shown. |
| AU5 | As a customer, I want an expired code marked as expired. | `AuthContext.tsx:564-570`, `auth.tsx:254-255,570-578` | 410 `OTP_EXPIRED` (`:314-320`) | ✅ |
| AU6 | As a customer, I want to resend the code after the cooldown. | `auth.tsx:226-237` | `POST …/auth/resend` → `resendAuth` (`:210`) | ⚠️ A failed resend is silent. |
| AU7 | As a customer, I want to change the number from the code screen. | `auth.tsx:239-244` | — | ✅ |
| AU8 | As a customer, I want to browse as a guest (Skip). | `auth.tsx:68-72,290-299` | — | ⚠️ An action held for after sign-in survives Skip and replays later. |
| AU9 | As a store reviewer, I want the review number to accept the fixed code without an SMS. | — | `customer.controller.js:96-122`; `BE/reviewAccounts/reviewAccounts.service.js:116-135` | ✅ |
| AU10 | As a new customer with an owner's invite code, I want the discount applied at sign-up. | `auth.tsx:184` | backend supports it (`customer.controller.js:388-396`) | ❌ There is no field and the result is ignored. |

Acceptance criteria:
- **AU1:**
  - A number starting with 0–5 shows "Indian mobile numbers start with 6, 7, 8 or 9" and sends no request.
  - A valid number flips the card and shows the masked number plus a 60-second countdown.
  - In airplane mode, a "No internet" box shows and the card does not flip.
- **AU2:**
  - A correct code stores the token in the Keychain and opens `/`, or the pending action.
  - After a restart the user is still signed in.
- **AU3:** A wrong code shows "That code is wrong — 4 tries left", and editing clears the error.
- **AU4:** Five wrong codes show the "Code locked" box. A resend after the cooldown clears it.
- **AU5:** After waiting more than 10 minutes, the "Code expired" box shows until a resend.
- **AU6:** The 4th resend (server `RESEND_LIMIT`) must show a message. **Today it fails.**
- **AU8:** Starting a gated action, then tapping Skip, must not replay that action after a later sign-in. **Today it fails.**
- **AU9:** With `REVIEW_LOGIN_PHONE` and `REVIEW_LOGIN_OTP` set, no SMS is sent and the fixed code signs in.

#### 1.1.2 Entry, onboarding and session

| # | Story | Screens | Endpoint | Status |
|---|---|---|---|---|
| EN1 | As a new customer, I want a short first run: splash, sign-in, category, locality, home. | `UA/app/index.tsx:77-118`, `components/auth/SplashSequence.tsx` | — | ✅ |
| EN2 | As a student, I want to pick a category (PG / Bachelor / Co-live / Hotel). | `UA/app/(entry)/categories.tsx`, `context/AppStateContext.tsx:170-180` | sent later as `?category=` | ⚠️ Tiles show no counts, so an empty category can be chosen. |
| EN3 | As a student, I want to pick an area from those that have listings. | `UA/app/(entry)/locality.tsx` | `GET /api/v2/listings/meta` → `getListingMeta` (`BE/listings/listing.controller.js:582`) | ⚠️ |
| EN4 | As a student, I want "near me within X km". | `locality.tsx:196-227`, `home.tsx:178,318-326` | `GET /listings?lat&lng&radiusKm` (`:258-262,432-437`) | ⚠️ Distance is never shown. |
| EN5 | As a customer, I want a maintenance screen when the service is down. | `UA/app/(entry)/maintenance.tsx` | none | ❌ Hardcoded and never triggered. |
| EN6 | As a customer on an old build, I want a forced-update screen. | `UA/app/(entry)/update.tsx` | none | ❌ Same as EN5. |
| EN7 | As a customer, I want my session restored on launch and checked with the server. | `AuthContext.tsx:324-378` | `GET /api/v2/customers/me` → `getMe` (`:434`), `requireCustomer` | ✅ |
| EN8 | As a customer, I want a dead session explained before I am signed out. | `UA/services/api/client.ts:175,323-325`, `AuthContext.tsx:388-400` | — | ✅ `SESSION_REVOKED` is now handled. |
| EN9 | As a customer, I want an unknown deep link to show a clear screen. | `UA/app/+not-found.tsx` | — | ✅ |

Acceptance criteria:
- **EN1:** A fresh install plays the splash once, then goes to auth, categories, locality and home. Signing in does not replay the splash.
- **EN3:**
  - Areas are sorted A–Z, and only areas with a count above 0 for the category are listed.
  - Typing "hsr" matches "HSR Layout Sector 1".
  - A 503 shows "We could not load your areas" with Try again.
- **EN7:** Launching offline keeps the user signed in. A revoked token turns the user into a guest and shows "Session expired".

#### 1.1.3 Home, search and filters (stays)

| # | Story | Screens | Endpoint | Status |
|---|---|---|---|---|
| H1 | As a student, I want a feed of my category in my area. | `UA/app/home.tsx:306-328,876-1079`, `components/discovery/ListingCard.tsx` | `GET /api/v2/listings` → `getListings` (`listing.controller.js:230`) | ⚠️ Cards show invented city, price, unit and gender. |
| H2 | As a student, I want to search by name, place or amenity. | `home.tsx:223-282,946-958` | `?search=` (`:300-308`) | ⚠️ |
| H3 | As a student, I want quick filters and a full filter sheet. | `FilterChipRow.tsx`, `QuickFilterDropdown.tsx`, `FilterSheet.tsx`, `types/filters.ts:283` | only category, city, locality, search and radius are applied on the server; the rest run on the device | ⚠️ |
| H4 | As a student, I want to sort by lowest rent or lowest deposit. | `home.tsx:708-724` | on device | ✅ |
| H5 | As a student, I want useful empty states. | `home.tsx:945-1005` | — | ⚠️ Dead or mis-wired buttons. |
| H6 | As a student, I want to widen from my area to the whole city. | `home.tsx:343-351,401-409,1052-1066` | — | ⚠️ Wrong while a search is active. |

Acceptance criteria:
- **H1:**
  - Skeleton while loading, error with Try again, pull to refresh.
  - Listings with status `removed` or `review`, or paused, never appear.
  - The card city matches the listing's city.
  - A listing with no rent shows "Price on request".
- **H3:**
  - The "Show N places" count equals the feed count after Apply.
  - The Girls filter never shows a listing tagged BOYS, and untagged listings still appear.
- **H4:** "Price: Low to High" puts unpriced listings last.

#### 1.1.4 Listing detail

| # | Story | Screens | Endpoint | Status |
|---|---|---|---|---|
| L1 | As a student, I want photos, price and deposit on a listing. | `UA/app/listing/[id].tsx` | `GET /listings/:id` → `getListingById` (`:500`); 404 for `review` (`:512`) | ⚠️ Stock photos are labelled "Uploaded by the owner"; hotels show "/ month". |
| L2 | As a student, I want to pick sharing, length of stay or dates at server-derived prices. | `listing/[id].tsx:210-228,319-366,825-902`, `StayIntentSelector.tsx`, `HotelStaySelector.tsx`, `SharingTypeSelector.tsx` | mirrors `stayIntent.util.js` `rateFor:187` / `validateIntent:245` | ⚠️ Hotel dates are unbounded; full room types can be selected. |
| L3 | As a student, I want amenities, meals, the description and the host name, with no phone number shown. | `listing/[id].tsx:904-991` | — | ✅ in the UI. The API still leaks the phone number (GAP-S1). |
| L4 | As a student, I want real reviews with owner replies. | `listing/[id].tsx:1381-1457` | `GET /listings/:id/reviews` → `getListingReviews` (`:468`) | ⚠️ A load error reads "No reviews yet". |
| L5 | As a student, I want to be told when a place is full and shown similar places. | `listing/[id].tsx:788-822` | — | ⚠️ "Notify me" does nothing; "Filled 0 min ago" is invented. |

Acceptance criteria:
- **L1:** Spinner while loading, "not found" on a 404, and "We could not open this place" with Retry on other errors.
- **L2:**
  - Single and 2 Sharing show different monthly prices.
  - A hotel check-in more than 2 months out is refused before the confirm screen. **Today it fails.**
- **L4:** With no reviews, "No reviews yet". With reviews, the average to one decimal plus "Owner replied" where there is a reply.

#### 1.1.5 Saved (shortlist)

| # | Story | Screens | Endpoint | Status |
|---|---|---|---|---|
| SV1 | As a student, I want to save or unsave from a card or the listing header. | `home.tsx:1074`, `listing/[id].tsx:593`, `services/hooks/useSaved.ts` | `POST /customers/saved` → `addSaved` (`BE/customers/saved.controller.js:71`); `DELETE …/:id` → `removeSaved` (`:126`) | ✅ (❌ on the unreachable `results.tsx`) |
| SV2 | As a student, I want a Saved tab with "₹X cheaper since you saved it". | `home.tsx:1091-1149`, `SavedRow.tsx` | `GET /customers/saved` → `getSaved` (`:37`) | ⚠️ Removed or full listings look normal; Undo resets the saved price. |

Acceptance criteria:
- **SV1:**
  - The heart fills immediately and rolls back if the call fails.
  - Saving twice keeps the original `rentWhenSaved`.
  - A guest's tap opens sign-in.
- **SV2:**
  - A rent change in admin shows the difference line.
  - Remove shows a 6-second Undo.
  - Undo must keep the original saved price. **Today it fails.**

#### 1.1.6 Visit requests (₹199 assisted visit)

| # | Story | Screens | Endpoint | Status |
|---|---|---|---|---|
| VR1 | As a student, I want to pay the visit fee once the owner confirms. | `UA/app/confirm/[id].tsx`, `UA/app/pay/checkout.tsx` | `GET /visit-requests/:id/payment/checkout` → `renderCheckout` (`BE/visits/visitPayment.controller.js:611`); callback → `paymentCallback` (`:735`) → `markVisitPaid` (`:166`) | ⚠️ |
| VR2 | As a student, I want to pick a visit day and time after paying. | `UA/app/visit/slot.tsx` | `POST /visit-requests/:id/assisted/slot` → `setSlot` (`assistedSlot.controller.js:236`) | ✅/⚠️ The route has no authentication. |
| VR3 | As a developer, I want a "mark paid" shortcut that never exists in production. | `confirm/[id].tsx` | `POST …/payment/dev-mark-paid` (`:534`); requires `DEV_ALLOW_MARK_PAID` and non-production | ✅ |
| VR4 | As a student, I want pending requests listed under Bookings → Requests. | `home.tsx:1365-1367` | `GET /customers/stay-requests` exists | ❌ Always empty. |

Acceptance criteria:
- **VR1:**
  - The amount comes from `payment.amountPaise`, and only a verified signature marks the request paid.
  - Paying for a cancelled booking must be refused. **Today it fails.**
- **VR2:**
  - Dates run from today to today + 30 days, 08:00–20:00.
  - A 402 before payment; the call is idempotent once scheduled.
- **VR4:** A pending request must appear in the Requests segment. **Today it fails.**

#### 1.1.7 Stay requests and bookings

| # | Story | Screens | Endpoint | Status |
|---|---|---|---|---|
| SR1 | As a student, I want to send a stay request priced on the server. | `confirm/[id].tsx` (sends automatically) | `POST /customers/stay-requests` → `createRequest` (`stayRequest.controller.js:127`) → `createStayRequest` (`stayRequest.service.js:186`) | ⚠️ |
| SR2 | As a student, I want a countdown from the server's `expiresAt`, plus notified, seen, accepted and declined states. | `services/hooks/useStayRequest.ts` | `GET /customers/stay-requests/:id` → `getRequest` (`:172`) | ⚠️ Tracking is per device (AsyncStorage). |
| SR3 | As a student, I want to withdraw a waiting request. | `confirm/[id].tsx:1306` | `POST …/withdraw` → `withdrawRequest` (`:231`) | ⚠️ Errors are never shown. |
| SR4 | As a student, I want to see and open my bookings. | `home.tsx` Bookings tab, `UA/app/bookings/[id].tsx` | `GET /customers/bookings` → `listBookings` (`customerBooking.controller.js:220`); `GET …/:id` → `getBooking` (`:256`) | ⚠️ Unpaid accepted bookings vanish; errors look like an empty list. |
| SR5 | As a student, I want my entry PIN and directions. | `UA/app/booked/[id].tsx`, `VerificationCodeDisplay.tsx` | — | ⚠️ A fixture address can be shown. |

Acceptance criteria:
- **SR1:**
  - The request body carries no money (`stayRequests.api.ts:93-101`).
  - A missing name opens the in-screen profile form.
  - A coupon refusal must be shown. **Today it fails.**
- **SR2:**
  - It polls every 3 seconds while `pending_owner`, and reaching zero triggers a refetch.
  - Opening the request on a second phone must show the same request. **Today it fails.**
- **SR3:** A network failure, 429 or `WITHDRAWAL_LIMIT_REACHED` must show an error. **Today it fails.**
- **SR5:** Before the real booking loads, no address or map pin may show. **Today it fails.**

#### 1.1.8 Payments (hotel stay)

| # | Story | Screens | Endpoint | Status |
|---|---|---|---|---|
| PY1 | As a hotel guest, I want to pay the server's total with my ₹100 reward applied, then get the address. | `confirm/[id].tsx` → `pay/checkout.tsx` → `booked/[id].tsx` | same checkout routes; `markVisitPaid` releases the address | ⚠️ The coupon can be dropped, stuck or unexplained; the header reads "Pay for your visit". |
| PY2 | As a developer, I want the fixture payment screens unreachable. | `UA/app/pay/[id].tsx`, `processing.tsx`, `confirmed.tsx` | none | ❌ They open by deep link and show fixture data. |

#### 1.1.9 Move-in, cancellation, refund, notice and review

| # | Story | Screens | Endpoint | Status |
|---|---|---|---|---|
| MV1 | As a student, I want to be marked moved in when the owner enters my PIN, and see my ₹100 reward. | `bookings/[id].tsx`, `UA/app/moved-in/[id].tsx` | `GET /customers/stay-coupons` → `listMine` (`stayCoupon.controller.js:35`) | ⚠️ The card shows on cancelled bookings; the reward may be the wrong coupon. |
| CX1 | As a student, I want to cancel an upcoming booking and get a paid stay refunded. | `bookings/cancel.tsx`, `cancelled.tsx` | `POST /customers/bookings/:id/cancel` → `cancelBooking` (`:334`) | ❌ There is no Cancel button on CONFIRMED bookings, and afterwards the data is stale. |
| CX2 | As a student whose owner cancelled, I want to add bank details and track the refund. | `bookings/refund.tsx` | `POST …/refund-details` → `submitRefundDetails` (`:619`) | ✅ |
| CX3 | As a resident, I want to give notice to vacate. | `bookings/notice.tsx` | none | ❌ Fixture data, dead button, unreachable. |
| RV1 | As a student, I want to rate a completed stay once. | `bookings/review.tsx` | `POST …/review` → `createReview` (`:452`) | ⚠️ The client allows an empty comment that the server rejects. |

Acceptance criteria:
- **CX1:** The IFSC and account number (6–20 digits) are checked on the client and on the server. After cancelling, the cancelled screen shows the refund. **Today it fails.**
- **RV1:**
  - "Rate your stay" shows only when the stay is completed and not yet reviewed.
  - `ALREADY_REVIEWED` is enforced.
  - Rating is 1–5.

#### 1.1.10 Food: browse, menu, cart, checkout and Razorpay (dev builds only)

| # | Story | Screens | Endpoint | Status |
|---|---|---|---|---|
| FB1 | As a diner, I want approved, open kitchens near me. | `components/food/FoodHome.tsx`, `context/FoodCatalogueContext.tsx:81` | `GET /api/v2/food-partners/restaurants` → `listRestaurants` (`BE/foodpartners/foodDiscovery.controller.js:786`) | ❌ Home crashes (hooks); no lat/lng is sent; meat shops are included; capped at 50 kitchens. |
| FB2 | As a diner, I want cuisine and "under ₹100" filters. | `CuisineRail`, `CuisineSheet` | on device | ✅ |
| FB3 | As a diner, I want honest promo banners. | `promoSlides.ts` | — | ❌ A fake "50% off" slide. |
| FM1 | As a diner, I want a kitchen's menu by section. | `UA/app/food/kitchen/[id].tsx` | `GET /restaurants/:id` → `getRestaurant` (`:925`) is **never called**; the screen reads the catalogue only | ⚠️ |
| FM2 | As a diner, I want to choose a portion and add-ons. | `UA/app/food/dish/[id].tsx` | `GET /products/:id` → `getProduct` (`:998`) is never called | ⚠️ Portions are checkboxes; cheaper portions are dropped. |
| FM3 | As a diner, I want real reviews. | `dish/[id].tsx:240-265` | none | ❌ Two hardcoded reviews. |
| FS1 | As a diner, I want to search dishes and kitchens. | `components/food/FoodSearch.tsx` | none (the server `search` parameter is unused) | ⚠️ |
| FS2 | As a diner, I want veg mode. | `VegModeButton/Sheet/Transition` | on device | ✅ |
| FS3 | As a diner, I want diet, spice and pickup preferences honoured. | `UA/app/food/preferences.tsx` | none | ❌ Saved but never read. |
| FF1 | As a diner, I want to heart dishes and kitchens to my account. | `FavouriteHeart.tsx`, `useFoodFavourites.ts` | `POST/DELETE /customers/food-favourites…` | ✅ Failures are silent. |
| FF2 | As a diner, I want a favourites screen I can order from. | `UA/app/food/favourites.tsx` | `GET /customers/food-favourites` | ⚠️ An error reads "Nothing saved yet". |
| FC1 | As a diner, I want a one-kitchen cart with a prompt before switching. | `FoodContext.tsx:586-616`, `CartSwitchSheet` | — | ⚠️ No prompt from the dish screen. |
| FC2 | As a diner, I want to change quantities. | `cart.tsx:160-164`, row steppers | — | ⚠️ Menu, search and favourites steppers edit the wrong line. |
| FC3 | As a diner, I want the bill to match what I'm charged. | `cart.tsx:94-104`, `BillBreakdown` | the server computes it in `placeOrder` / `foodCharges.util.js` | ⚠️ Totals diverge with several portions or a quantity above 20. |
| FC4 | As a diner, I want my referral or first-order coupon applied. | `coupons.tsx`, `home.tsx:1216` | `GET /customers/food-coupon`; `placeOrder` writes `discount: 0` | ❌ |
| FK1 | As a diner, I want to pick a saved address. | `UA/app/food/address.tsx` | `GET /customers/me/addresses` | ⚠️ No delivery-area check; an error looks like an empty book. |
| FK2 | As a diner, I want to place a cash-on-delivery order. | `UA/app/food/payment.tsx:147-156` | `POST /food-partners/orders` → `placeOrder` (`foodCustomerOrder.controller.js:86`) | ✅ Ids and quantities only; prices re-derived on the server. |
| FK3 | As a diner, I only want payment methods the kitchen accepts. | `payment.tsx:29-31,100-106` | 409 `COD_UNAVAILABLE` / `ONLINE_UNAVAILABLE` | ⚠️ Both methods are always offered. |
| FR1 | As a diner, I want to pay online in the app. | `payment.tsx:159-172`, `pay/checkout.tsx` | `POST …/orders/:n/payment` → `startPayment` (`foodPayment.controller.js:142`); `renderCheckout` (`:340`); `checkoutCallback` (`:448`) | ⚠️ The cart is not cleared; duplicate orders are possible. |
| FR2 | As a diner, I want to retry payment on an unpaid order. | `UA/app/food/order/[id].tsx:179-202` | `startPayment` reuses `razorpay.orderId` | ✅ The Pay button also shows on cancelled orders. |

Acceptance criteria:
- **FB1:**
  - Only approved and active kitchens are listed, open ones first.
  - Home must not crash when moving from loading, error or empty to loaded. **Today it fails.**
- **FC1:** Adding from another kitchen on any screen opens the switch prompt.
- **FC3:**
  - Items + 5% GST + ₹2 platform fee + delivery equals the server's `grandTotal`.
  - A quantity above 20 is capped on the client.
- **FK2:** `nextStep: 'track'` clears the cart and opens tracking.
- **FR1:**
  - After a successful payment the cart is empty.
  - Android Back from checkout does not allow a second order.
  - `paid` is set only through `confirmPayment`.

#### 1.1.11 Food: order tracking, map, history, notifications and profile

| # | Story | Screens | Endpoint / socket | Status |
|---|---|---|---|---|
| FT1 | As a diner, I want to know where my order is. | `food/order/[id].tsx`, `FoodContext.tsx#refreshOrder` (1133), `buildTimeline` (730-905), `FoodStatus.tsx` | `GET /food-partners/orders/:n` → `getMyOrder` (`foodCustomerOrder.controller.js:466`), returns `customerView` | ⚠️ All 8 statuses and 4 `dispatch.state` values are mapped; cancelled timelines are wrong. |
| FT2 | As a diner, I want the kitchen's promised time. | `FoodContext.tsx:787-798`, `[id].tsx:757` | — | ✅ Real, not invented. There is no delivery ETA at all. |
| FT3 | As a diner, I want the rider's name, vehicle and a Call button, and my delivery PIN. | `[id].tsx:564-643` | `customerView.rider` (`foodOrder.model.js:1134-1154`) | ⚠️ The phone number stays visible forever. |
| FT4 | As a diner, I want to be told why no rider was found. | `[id].tsx:506,523-535` | `dispatch.failureReason` / `candidateCount` | ✅ |
| FT5 | As a diner, I want to see the rider move on a real map. | `components/food/DeliveryMap.tsx` | socket `driver_location` in the `order:<n>` room (joined with `track_order`, `support.socket.ts:394-416`; `realtime.js:414-424`) | ⚠️ `[lng,lat]` is handled correctly; the map shows on finished orders. |
| FT6 | As a diner who ordered on the website with the kitchen delivering, I want to confirm delivery. | — | `PATCH /orders/:n/delivered` → `confirmMyDelivery` (`:584`) | ❌ Missing from the app. |
| FH1 | As a diner, I want past and current orders, and to reorder. | `components/food/FoodOrders.tsx` | `GET /food-partners/orders` → `listMyOrders` (`:437`), limit 50 | ⚠️ No loading or error state; totals are wrong; the live card copy is wrong. |
| FX1 | As a diner, I want to cancel before cooking starts. | `[id].tsx:337,955-972` | `PATCH …/cancel` → `cancelMyOrder` (`:490`), allowed for `placed` and `accepted` | ⚠️ No double-tap guard; stale state afterwards. |
| FN1 | As a diner, I want an inbox of changes to my orders. | `UA/app/food/notifications.tsx` | local only (`FoodContext.tsx:1392-1440`) | ⚠️ The unread count explodes on a fresh install. |
| FN2 | As a diner, I want push notifications that open my order. | `services/push/usePushRouting.tsx:44-49` | `BE/drivers/dispatch.notifier.js:155-291` | ⚠️ Some push text is wrong. |
| FP1 | As a diner, I want food profile links (preferences, favourites, addresses, help, delete, appearance). | `UA/app/food/profile.tsx:75-126` | — | ✅ Edit and Log out show to guests. |

Acceptance criteria:
- **FT1:**
  - Polls every 8 seconds, or 5 seconds once a rider is assigned.
  - Timeline ticks carry `statusHistory` times.
  - A cancelled order must not show "Waiting for this". **Today it fails.**
- **FT5:**
  - The route line is a real road route, with a dashed fallback.
  - "We cannot see your rider" shows when there is no fix.
  - No map on a delivered order. **Today it fails.**
- **FX1:** Cancelling a paid order shows "Refund on the way" and the payment label updates. **Today it fails.**

#### 1.1.12 Addresses

| # | Story | Screens | Endpoint | Status |
|---|---|---|---|---|
| AD1 | As a customer, I want my saved addresses with the default marked. | `UA/app/addresses/index.tsx` | `GET /customers/me/addresses` → `listAddresses` (`BE/customers/customerAddress.controller.js:68`) | ⚠️ Signed-out users hit a dead end; an error looks like an empty book. |
| AD2 | As a customer, I want to add or edit an address with only line 1 required. | `UA/app/addresses/edit.tsx` | POST → `addAddress` (`:78`), PATCH → `updateAddress` (`:113`); validation in `Backend/src/shared/utils/address.js` | ⚠️ |
| AD3 | As a customer, I want to set my default. | `index.tsx:113-123` | `POST …/:id/default` → `setDefaultAddress` (`:167`) | ✅ |
| AD4 | As a customer, I want to delete an address, with the default moving to another. | `index.tsx:125-146` | DELETE → `removeAddress` (`:136`), `applyDefault` (`:149`) | ✅ |
| AD5 | As a customer, I want "Use my location" to fill only empty fields. | `services/location/useMyLocation.ts:83-210`, `edit.tsx:139-170` | sent as `{lat,lng}`, stored as `[lng,lat]` | ⚠️ A pin can never be cleared; a stale last-known fix can be used. |

Acceptance criteria:
- **AD2:**
  - An empty line 1 is refused on the client.
  - An empty pincode is accepted.
  - A malformed pincode is refused and the error sits under the Pincode field. **Today it fails.**
  - The 10-address cap shows the server's message.
- **AD5:** Fields already typed are never overwritten. The pin is kept when geocoding returns nothing.

#### 1.1.13 Notifications and push

| # | Story | Screens | Endpoint | Status |
|---|---|---|---|---|
| NT1 | As a customer, I want an alerts inbox. | `UA/app/notifications.tsx`, `useNotifications.ts:108-121` | `GET /customers/notifications` → `getNotifications` (`BE/customers/notification.controller.js:144`) | ⚠️ Visit and stay requests only. |
| NT2 | As a customer, I want "Mark all read" to apply on every device. | `notifications.tsx:103` | `POST …/notifications/read` → `markNotificationsRead` (`:188`) | ✅ Failures are silent. |
| NT3 | As a customer, I want tapping an alert to open the request. | `notifications.tsx:174-181` | — | ⚠️ `requestId` is ignored. |
| PU1 | As a customer, I want my phone registered for push when I sign in. | `AuthContext.tsx:246-251`, `services/push/push.ts:219-252` | `POST /customers/devices` → `registerCustomerDevice` | ✅ |
| PU2 | As a customer, I want tapping a push to open the right screen. | `usePushRouting.tsx:36-104` | — | ⚠️ Support pushes are dropped; booking pushes route to a fixture-shaped id. |

Acceptance criteria:
- **NT1:**
  - A guest sees "Sign in to see your alerts".
  - After an owner answers, a row with an unread dot appears and the bell count matches.
- **PU1:** A real device prompts for permission and `app_customers.devices[]` gains the token. A simulator makes no call.

#### 1.1.14 Support tickets and safety reports

| # | Story | Screens | Endpoint | Status |
|---|---|---|---|---|
| SP1 | As a customer, I want to see all my support requests and their outcome. | `UA/app/support/index.tsx` | `GET /api/v2/support/tickets` → `listTickets` (`BE/support/ticket.controller.js:192`), `requireCustomer` | ⚠️ Unread total not shown; reports not labelled. |
| SP2 | As a customer, I want to open a ticket about a property or the platform. | `UA/app/support/new.tsx` | `GET /support/categories` → `getCategories` (`:588`); `POST /support/tickets` → `createTicket` (`:282`) | ⚠️ |
| SP3 | As a customer, I want to read a thread and reply. | `UA/app/support/[id].tsx` | `getTicket` (`:222`), `replyToTicket` (`:483`), `markTicketRead` (`:555`) | ✅ |
| SP4 | As a customer, I want to confirm a resolved ticket is sorted. | `[id].tsx:168-198` | — | ❌ This reopens the ticket. |
| SP5 | As a customer, I want replies to appear live. | `services/support.socket.ts`, `useTickets.ts:171-242` | `support_message` / `support_ticket_updated`, rooms joined with `track_ticket` | ⚠️ Events are delivered twice; pushes can't be tapped through. |
| SP6 | As a customer, I want help tied to a specific food order or booking. | entry points in `food/order/[id].tsx:988`, `bookings/[id].tsx:589`, `bookings/refund.tsx:256` | `createTicket` accepts `orderNumber` | ❌ No context is passed. |
| SP7 | As a customer, I want to report a serious problem to the safety team. | `UA/app/support/report.tsx` | `POST /support/reports` → `createReport` (`:372`) | ✅/⚠️ No sign-in check before typing. |

Acceptance criteria:
- **SP1:** Spinner while loading, `displayMessage` plus Retry on error, and the "New support request" CTA when empty.
- **SP2:** Categories are filtered by server ids. The property branch sends `listingId`. A failed send keeps the text.
- **SP3:** The composer is hidden on a closed thread. The reply box clears only on success.
- **SP4:** "Yes, close this" must leave the ticket resolved or closed. **Today it fails.**
- **SP7:** At least 50 characters, the emergency note sits on top, and `listingId` is never sent.

#### 1.1.15 Profile, account deletion and logout

| # | Story | Screens | Endpoint | Status |
|---|---|---|---|---|
| PR1 | As a customer, I want to edit my name and email; the phone is read-only. | `UA/app/profile/edit.tsx` | `PATCH /customers/me` → `updateMe` (`customer.controller.js:438-494`) | ✅ |
| DL1 | As a customer, I want to request deletion with a grace period, and cancel it. | `UA/app/profile/delete-account.tsx`, `services/api/accountDeletion.api.ts` | `GET/POST/DELETE /customers/me/account-deletion` (`BE/accountDeletion/accountDeletion.controller.js:393,403,437`) | ✅ No retry when loading fails. |
| LO1 | As a customer, I want Log out to end my session on the server and clear the phone. | `home.tsx:1302-1322`, `AuthContext.tsx:253-301,608-614`, `auth.api.ts:110-117` | `DELETE /customers/devices`, then `POST /customers/auth/logout {everywhere:true}` → `makeLogout` (`BE/iam/session.controller.js:22-42`) | ⚠️ Always signs out everywhere; no progress indicator; React Query cache not cleared. |

Acceptance criteria:
- **PR1:**
  - An empty name disables Save.
  - A bad email shows "Not saved: Please enter a valid email address."
  - An unchanged form just goes back.
- **DL1:**
  - Confirming shows "Scheduled for deletion on <date>".
  - Cancel restores the form.
  - A live order shows the "1 order or stay still in progress" note.
- **LO1:**
  - After confirming, the user is a guest.
  - The old token on `/me` returns 401 `SESSION_REVOKED`.
  - The next account must not see the previous account's cached lists. **Today it fails.**

---

### 1.2 Gaps

Grouped by severity. Each entry gives where, what happens, how to reproduce, and the fix.

#### Critical

**G-UA-C1. Food Home breaks the rules of hooks and crashes.**
- **Where:** `UA/components/food/FoodHome.tsx:473` calls `useMemo(() => buildPromoSlides(onSearch), [onSearch])` after the early returns at `:434` (skeleton), `:436-448` and `:449-472` (error and empty).
- **What happens:** "Rendered more/fewer hooks than during the previous render" is thrown when the feed moves between loading, error or empty and loaded.
- **Repro:** Open the Food tab on a cold start or slow network, or tap Try again once kitchens exist.
- **Fix:** Move the `useMemo` above line 434.

**G-UA-C2. A student can pay for a booking that is already cancelled, and no refund is ever created (backend and app).**
- **Where:**
  - `BE/customers/customerBooking.controller.js:360-372`: `cancelBooking` only updates `PartnerBooking`. The owner-side cancel does the same (`partnerDomains.controller.js:576-592`).
  - The `VisitRequest` stays `status:'confirmed'` with payment pending.
  - `BE/visits/visitPayment.controller.js:374` (order), `:551` (dev) and `:622` (checkout page) only check `doc.status !== 'confirmed'`.
  - `UA/hooks/useOngoing.ts:111-120` keeps showing "Payment pending", and `UA/app/confirm/[id].tsx:641` (`tokenDue`) still offers "Pay ₹X and book".
- **What happens:** `markVisitPaid` creates a hotel settlement for the cancelled booking (`visitPayment.controller.js:308-318`). `openForCancelledBooking` had already returned null at cancel time (`refund.service.js:92-93`), so no refund row is ever written.
- **Repro:** Hotel request → owner accepts → Booking detail → cancel → tap the "Payment pending" strip → Pay.
- **Fix:** When a booking is cancelled, move its request to a terminal state and void the payment. Refuse order, checkout and verify when the linked booking is cancelled.

**G-UA-C3. The food catalogue sends no location or `partnerType`, and is hard-capped.**
- **Where:**
  - `UA/context/FoodCatalogueContext.tsx:81` calls `useKitchens({ limit: 50 })` with no lat/lng.
  - `UA/services/api/food.api.ts:53-65` has no `partnerType`, although the server supports it (`foodDiscovery.controller.js:808,821`).
  - Menus are fetched for only 25 kitchens (`MENU_FANOUT_CAP`, `FoodCatalogueContext.tsx:78`).
  - `useKitchen` and `useDish` (`useFood.ts:65-84`) have no callers.
- **What happens:**
  - Kitchens from any city appear, with no radius, and `walkMinutes` is always 0.
  - Meat shops appear in the food feed.
  - The 26th kitchen onwards shows an empty menu, wrongly labelled "Nothing veg on this menu today" (`kitchen/[id].tsx:404-409`).
  - Cart lines for those dishes are silently dropped (`FoodContext.tsx:405-406`).
  - The dish screen says "off the menu", including while loading (`dish/[id].tsx:52-65`).
- **Fix:** Pass coordinates and `partnerType:'food'`. Use `useKitchen` / `useDish` on the detail screens. Resolve cart dishes per kitchen.

#### High

**G-UA-H1. The public listings API publishes every owner's phone number (backend).**
- **Where:** `Backend/src/modules/listings/listing.formatter.js:163` sets `ownerMobile: doc.ownerMobile || ''` on every public listing. It is served unauthenticated by `GET /api/v2/listings` with no limit (`listing.controller.js:310-313`), by `GET /listings/:id`, and by `saved.controller.js:55`.
- **What happens:** This bypasses the rule in CLAUDE.md that an owner is contacted only after OTP verification or payment. The same formatter already strips the street address. The app never renders the phone (it is only typed, at `UA/services/api/types.ts:133`).
- **Repro:** `curl …/api/v2/listings | jq '.data[].ownerMobile'`
- **Fix:** Drop the field. Coordinate with `Frontend/…/ListingCard.jsx:108`, which builds a `tel:` link from it.

**G-UA-H2. Food payment endpoints return the raw order document (backend privacy).**
- **Where:** `BE/foodpartners/foodPayment.controller.js:157` (`startPayment` when already paid) and `:244` / `:274` (`verifyPayment`) return `order.toJSON()`. That transform strips only `__v` (`foodOrder.model.js:802-806`).
- **What happens:** The diner receives:
  - `partnerPayout` and `commissionRate`
  - `pickupCode`, the kitchen-to-rider code
  - `dispatch.offers`, which holds other riders' ids
  - `delivery.request`, which holds the desk phone number
  - the `razorpay` refund-authoriser fields
- **Repro:** Call `POST /food-partners/orders/:n/payment` on a paid order.
- **Fix:** Return `customerView(order)` in all three places, as `placeOrder` already does (`foodCustomerOrder.controller.js:342`).

**G-UA-H3. The food cart is never cleared after a successful online payment, which enables duplicate orders.**
- **Where:**
  - `UA/context/FoodContext.tsx:1116-1119` clears the cart only when `nextStep === 'track'`, which covers cash on delivery only.
  - No other code clears it.
  - `pay/checkout.tsx:84-86` replaces to the order screen without `placed`, and `order/[id].tsx:431` then calls `router.back()`.
- **What happens:** After paying, the cart still holds the items. Pressing Back lands on the address and payment screens, and Pay places the same food again.
- **Repro:** Pay online → tracking screen → Back twice → Pay.
- **Fix:** Clear the cart once the order is confirmed paid, or as soon as an order exists. Replace to `foodHref.order(id, true)` from checkout.

**G-UA-H4. Duplicate held orders after a payment-start failure, a double tap or Android Back.**
- **Where:**
  - `UA/app/food/payment.tsx:163-176`: `placeOrder` has already created the order when `startPayment` fails, and the screen stays put with a full cart.
  - The comment at `:159-162` claims the diner is sent to tracking, but no navigation happens.
  - There is no in-flight guard (`:147-149`), and `POST /orders` has no idempotency key.
  - There is no `BackHandler` in the app at all.
- **Fix:** After `placeOrder` resolves, always route to the order. Add an in-flight ref and a server idempotency key.

**G-UA-H5. A cancelled unpaid order can still become `paid` and ring the kitchen, and `confirmPayment` is not atomic (backend).**
- **Where:** `confirmPayment` (`foodPayment.controller.js:107-135`) never checks `order.status`, so a cancelled order whose checkout was already open gets marked paid and `notifyRestaurantOfOrder` fires. It also reads `paymentStatus` and then calls `save()`, so a webhook and a callback arriving together both notify the kitchen.
- **Fix:** Use `findOneAndUpdate({_id, paymentStatus:{$ne:'paid'}})`. If the status is cancelled or rejected, record the payment and route it to `markForRefund`.

**G-UA-H6. The Confirmed booking screen shows a fixture address, map pin and date.**
- **Where:** `UA/app/booked/[id].tsx:181-185` falls back to `confirmedBookingFor(...)`, built from `data/bookings.ts:474-485`: "3-6-291/A, Street 8, Himayatnagar…", coordinates 17.4009/78.4861, "5 September 2026".
- **What happens:** `showAddress` (`:237`) is true for CONFIRMED, so "Open in Google Maps" points at a fake place. This happens while loading, and permanently if `bookingId` is null or the fetch fails. The `realAddress` branch (`:232`) reads `stay.request.address`, which `getRequest`'s `toPublic` never returns, so it is dead.
- **Fix:** Remove the fixture fallback. Render a loading state or a neutral card.

**G-UA-H7. Listing cards show invented data.**
- **Where:** `UA/components/discovery/ListingCard.tsx`:
  - `:362` hardcodes the city: `{listing.locality} · Hyderabad`. The catalogue is Bangalore and Anakapalli.
  - `:312` `formatRupees(listing.rent || 6500)`: a listing with no rent shows ₹6,500.
  - `:313` checks `perBed` before `perNight`. The adapter sets `perBed` for hotels too (`listing.adapter.ts:497`), so hotels show "/bed/month". Bachelor and co-live units also show "/bed/month".
  - `:162-174`: the gender badge falls back to "Boys" for untagged listings, which is most of them.
- **Fix:**
  - City: use `listing.localityNote`.
  - Price: show "Price on request", as `RentDisplay.tsx:140` does.
  - Unit: check `perNight` first.
  - Gender: render the badge only when it is set.

**G-UA-H8. Stock Unsplash photos are shown as the owner's photos.**
- **Where:** `UA/services/adapters/listing.adapter.ts:435-447` substitutes three stock photos and sets `photoCount:3`. `UA/app/listing/[id].tsx:1110` labels them "Uploaded by the owner."
- **Fix:** Leave the array empty. Placeholder tiles already exist.

**G-UA-H9. The Bookings tab hides pending requests and unpaid accepted bookings.**
- **Where:** `UA/app/home.tsx:1365-1367` returns `[]` for the Requests segment; the comment at `:1348-1356` calls it "a real gap". `data/bookings.ts:601` maps `PAYMENT_PENDING` to Requests, so accepted-but-unpaid bookings appear in no segment.
- **Repro:** Get a bachelor or hotel request accepted but don't pay → Bookings tab is empty in every segment.
- **Fix:** Render stay requests from the existing `['stay-requests','mine']` query (`useOngoing.ts:80-86`) plus bookings in the `requests` segment.

**G-UA-H10. The request being tracked is remembered only on this phone, keyed by listing.**
- **Where:**
  - `UA/services/hooks/useStayRequest.ts:64,101-164`.
  - `confirm/[id].tsx:254-275` sends a request automatically whenever none is stored.
  - Notifications (`notifications.tsx:176-180`) and pushes (`usePushRouting.tsx:71-74`) open `/confirm/<listingId>`, and `requestId` is never read (`confirm/[id].tsx:88-104`).
  - Booking pushes open `/bookings/bkg-<listingId>` (`usePushRouting.tsx:65-67`), where `bookings/[id].tsx:123` `resolving` stays true forever.
- **What happens:** On a second device, after a reinstall, or for a website request, the confirm screen sends a new request. The server refuses it (`ALREADY_REQUESTED` / `ALREADY_BOOKED` / `CONSENT_REQUIRED`), and the student sees "Your request did not go through", with no way to reach the live request or pay. A booking push shows "Loading…" forever.
- **Fix:** Look the request up on the server by `listingId`, and honour the `requestId` and `bookingId` params.

**G-UA-H11. "Ask again" after a decline or expiry shows the old banner and sends nothing.**
- **Where:** `confirm/[id].tsx:1277`: "See other rooms here" and "Find another property" only call `clearPill()`, not `stay.reset()`. The auto-send guard at `:254` requires `phase==='idle'`.
- **Fix:** Reset terminal state when new params arrive.

**G-UA-H12. An expired payment window or a cancelled unpaid booking blocks the student from requesting again, and holds the bed (backend).**
- **Where:**
  - `BE/visits/stayRequest.service.js:339-355`: the in-flight check also matches expired payments.
  - `:283-299`: `ALREADY_BOOKED` applies forever after a cancelled booking.
  - Nothing closes an expired request (`payment.status='expired'` is only written lazily, at `visitPayment.controller.js:383`).
- **Fix:** Add a worker that closes expired requests, cancels the booking and releases the bed. Exclude cancelled bookings and expired payments from both checks.

**G-UA-H13. A reserved ₹100 stay coupon is only released on withdraw (backend).**
- **Where:** `stayCoupon.service.release` has one caller (`stayRequest.service.js:863`). It is not called from `expireDue` (`:944`), `settleIfExpired` (`:1039`), `decline` (`:776`), `declineForLostInventory` (`:994`) or any booking cancel.
- **What happens:** The coupon stays `reserved` forever, and the next attempt to use it returns `ALREADY_HELD`.
- **Fix:** Call `release` on every terminal transition.

**G-UA-H14. There is no Cancel on a CONFIRMED (upcoming) booking, and the data is stale after cancelling.**
- **Where:**
  - `UA/components/lifecycle/ActionBar.tsx:79-81` returns `{}` for CONFIRMED and CHECKED_IN, although the server allows cancelling any `upcoming` booking (`customerBooking.controller.js:361`). The refundable branch of `bookings/cancel.tsx` is therefore unreachable.
  - `cancel.tsx:79-89` invalidates no queries, and `useBooking` has `staleTime:30_000` (`useBookings.ts:84`). As a result `cancelled.tsx:121` tells a paid guest "Nothing was paid… nothing to refund".
- **Fix:**
  - Add a destructive "Cancel booking" action while the booking is upcoming.
  - After cancelling, call `setQueryData` for the booking and invalidate `['bookings']` and the ongoing key.

**G-UA-H15. "Yes, close this" on a resolved support ticket reopens it.**
- **Where:**
  - `UA/app/support/[id].tsx:168-178`: `confirmSorted` sends a reply.
  - `BE/support/ticket.controller.js:529-531`: any reply to a resolved ticket sets it to `open`.
  - `useTickets.ts:250-255` writes the response into the cache.
  - `closedByYou` (`[id].tsx:198`) requires `state==='resolved'`, which is now false.
- **Fix:** Add a customer "confirm resolved" endpoint, or have the server skip the reopen for that confirmation.

**G-UA-H16. Tapping a support push does nothing.**
- **Where:** The backend sends `data:{kind:'support.reply'|'support.status', reference}` (`BE/support/support.notifier.js:146`). `UA/services/push/push.ts:121-122` `isOurs` accepts only `requestId`, `orderNumber` or `bookingId`, and `PushPayload.kind` (`:71-89`) has no support kinds.
- **Fix:** Add the support kinds and route to `/support/<reference>`.

**G-UA-H17. A blocked customer is told to "contact support", and support refuses them.**
- **Where:**
  - `BE/customers/customerAuth.middleware.js:104-108` returns 403 `ACCOUNT_BLOCKED` "…contact support", and the support router uses the same `requireCustomer` (`ticket.routes.js:156-158`).
  - The rider app has `requireDriverForSupport` for this case (`:166-187`); the diner does not.
  - In the app, `AuthContext.tsx:418-423` shows "The SMS didn't send" for this 403.
  - `AuthContext.tsx:368-371` signs the user out silently on launch.
- **Fix:** Add a `requireCustomerForSupport` guard. Handle `ACCOUNT_BLOCKED` centrally with an alert.

**G-UA-H18. The React Query cache is never cleared on sign-out or session expiry.**
- **Where:** `UA/app/_layout.tsx:55` creates one `QueryClient`. There is no `clear`, `removeQueries` or `resetQueries` anywhere. `persist(null)` (`AuthContext.tsx:253-301`) clears only the token, profile, push and socket.
- **What happens:** On a shared phone, account B briefly sees account A's notifications, bookings, addresses, saved list, tickets and coupon (the query keys in `services/hooks/keys.ts` are not scoped to the user).
- **Fix:** Call `queryClient.clear()` in `persist(null)`, and remove `@lampose/notifications-read`.

**G-UA-H19. Web-channel food orders delivered by the restaurant can never be completed in the app.**
- **Where:** For these orders `customerView` sends `dispatch.state='assigned'` with a rider that has no phone and no location (`foodOrder.model.js:1101-1154`). Only `PATCH /orders/:n/delivered` moves them on, and the app has no endpoint for it (`UA/services/api/endpoints.ts:252-274`).
- **What happens:** The order is stuck at "On the way", with a "signal lost" map and endless polling. The push says "Tap 'Delivered'" (`dispatch.notifier.js:277`), but there is no such button.
- **Fix:** Add the endpoint and a Delivered button when `rider.kind` is set.

**G-UA-H20. Invite and referral sign-up is unreachable.**
- **Where:** `auth.tsx:184` calls `sendCode` without a profile. `auth.tsx:199-213` ignores `referralMessage`. The backend supports it (`customer.controller.js:388-396`).
- **Fix:** Add an optional invite-code field and show the result.

**G-UA-H21. A failed OTP resend is silent.**
- **Where:** `auth.tsx:226-237` ignores the result. The failure box renders only on the front card (`:463-473`), which is hidden while the card is flipped.
- **What happens:** With `RESEND_LIMIT` (429 with no `retryAfter`, `customer.controller.js:244-250`), the button stays enabled and every tap silently fails.
- **Fix:** Show an `InlineAlert` on the back card.

**G-UA-H22. Food discounts are promised but don't exist.**
- **Where:**
  - `UA/components/food/promoSlides.ts:147-164`: "New user offer — flat 50% off your first order". The file's own comment at `:46-56` says it must be removed.
  - `UA/app/home.tsx:1216` promises "₹X off your first food order".
  - `placeOrder` always writes `discount: 0` (`foodCustomerOrder.controller.js:299`), and `food_coupons` is never read or marked used.
- **Fix:** Remove the slide and the card, or apply the coupon on the server.

**G-UA-H23. Fake dish reviews.**
- **Where:** `UA/app/food/dish/[id].tsx:240-265`: hardcoded "Rahul K." ★5 "2 days ago" and "Sneha M." ★4 on every rated dish.
- **Fix:** Remove them, or build a reviews endpoint.

#### Medium

**Auth, entry and session**

- **G-UA-M1. Every auth failure except offline and 429 is labelled "The SMS didn't send".** `AuthContext.tsx:418-423`. This covers `ACCOUNT_BLOCKED`, `BAD_PHONE` and `DB_DISCONNECTED`. For `OTP_SEND_FAILED`, `ApiError.displayMessage` (`client.ts:126-128`) also hides the server's wording. **Fix:** branch on `error.code`.
- **G-UA-M2. A held action survives Skip.** `continueAsGuest` (`AuthContext.tsx:649-651`) never clears `pendingIntentRef`, so a later sign-in replays the stale action and calls `router.back()`.
- **G-UA-M3. Log out always ends every session and is slow.**
  - `auth.api.ts:110-116` hardcodes `{everywhere:true}`, but the dialog (`home.tsx:1307-1312`) only mentions this phone.
  - `persist(null)` awaits two calls in sequence with a 15-second timeout each (`config.ts:176`) and shows no spinner.
  - A spurious "Session expired" can appear if the token was already revoked (G16).
  - **Fix:** clear local state first, then revoke fire-and-forget. Offer per-device logout.
- **G-UA-M4. The maintenance and force-update screens are fixtures that can't be triggered.**
  - `maintenance.tsx:31,33` hardcodes "We're back at 6:30 am" and "Your payment deadline for LAM-4192…". Its buttons are no-ops (`:35,38`).
  - `update.tsx:31-32` has a no-op "Update from Play Store" and "About 18 MB".
  - `AppConfig.forceUpdate` and `maintenance` are never set (`AuthContext.tsx:217-220`), and no backend route exists.
  - Both screens open by deep link (`lampose://maintenance`).
- **G-UA-M5. The category is never synced while signed in.** `syncCategory` (`AuthContext.tsx:507-510`) only sets a ref used at the next sign-in. New accounts are created with `category:null`, because sign-in comes before category selection on first run.

**Notifications and push**

- **G-UA-M6. The alerts inbox covers only visit and stay requests.** `notification.controller.js:157`. Its own header (`:13-17`) says this is unacceptable once bookings and payments exist. Food, booking and support events are absent.
- **G-UA-M7. Tapping an alert ignores `requestId`.** See G-UA-H10.

**Stays**

- **G-UA-M8. Dead or mis-wired buttons.**
  - `listing/[id].tsx:803` "Notify me if a bed opens" is `() => {}`.
  - `home.tsx:967` "Tell me when one opens" is `() => {}`; the copy at `copy.ts:62` promises an alert.
  - `home.tsx:981` "Search <area> instead" opens the area picker instead of switching.
- **G-UA-M9. "Near me" results show no distance.** `distanceKm` is returned (`listing.controller.js:367`) and adapted (`listing.adapter.ts:471`) but never rendered.
- **G-UA-M10. Detail and sharing copy has the wrong units.**
  - `listing/[id].tsx:729-731` says "/ month" for hotels, and `shownRent` null renders "₹—".
  - `:891,899` and `SharingTypeSelector.tsx:59,112` say "per person, per month" for whole units.
- **G-UA-M11. The filter sheet forces a gender and has no Co-ed option.** `FilterSheet.tsx:43` offers `['BOYS','GIRLS']`. `types/filters.ts:338-344` blocks Apply until one is picked, and the button label is wrong when the actual block is the rent ceiling.
- **G-UA-M12. Budget controls are monthly-only.**
  - `FilterSheet.tsx:397,412,424` hardcodes "monthly" wording.
  - `QuickFilterDropdown.tsx:134` uses fixed ₹8k–30k presets, including for per-night hotels, and bypasses `validateQuery`.
  - `QuickFilterDropdown.tsx:165,233` falls back to invented sharing and furnishing values, and each tap closes the dropdown.
- **G-UA-M13. `SharingTypeSelector` reads a field that is never set.** `SharingTypeSelector.tsx:64-66,221` and `defaultSelection.ts:44` read `option.bedsLeft`, but the adapter sets `availableBeds`/`requestable` (`listing.adapter.ts:377-382`). Full room types can be selected and pre-selected. `StayIntentSelector.tsx:692-712` already fixed the same bug.
- **G-UA-M14. Hotel date pickers are unbounded.** `listing/[id].tsx:848-852` doesn't pass `joinWindow`, and the adapter drops the server's value (`listing.formatter.js:211`). The server then rejects the request on the next screen (`stayIntent.util.js:299-306,363-370`).
- **G-UA-M15. An empty category traps the area screen.** `locality.tsx:104-107,266-282` says "nothing in the catalogue" and hides "All locations" and "Use my location".
- **G-UA-M16. Saved rows never reflect removed, paused or full listings.** `saved.controller.js:47-60` skips `withAvailability` and `review` filtering. The adapter also drops `removed`/`paused`, so a removed listing's Request button can stay live.
- **G-UA-M17. The widen offer and heading ignore an active search.** `home.tsx:387-391,409,1016,1052-1058`.
- **G-UA-M18. Undo on an unsave resets `rentWhenSaved`.** `home.tsx:592-595,1461-1465` re-POSTs, and `addSaved` records today's rent (`saved.controller.js:107-111`).
- **G-UA-M19. The Bookings tab has no sign-in prompt, error state or pull to refresh.** `home.tsx:1357-1379`. A guest or a failed fetch sees "no bookings".

**Stay requests, bookings and payments**

- **G-UA-M20. `couponRefusal` is discarded.** `UA/services/api/stayRequests.api.ts:104` returns `unwrap(envelope)`, which drops the sibling field sent by `stayRequest.controller.js:159-163`. The student pays full price with no explanation.
- **G-UA-M21. The coupon can miss the automatic send.** `confirm/[id].tsx:185,227,254-275` doesn't wait for `useStayCoupons`, and `sent.current` then blocks any retry.
- **G-UA-M22. Withdraw errors are invisible.** `useStayRequest.ts:327-334` sets `error` but keeps `waiting`. `confirm/[id].tsx:1059` only shows errors when `failed`, and `:1306` ignores the returned result.
- **G-UA-M23. An expired payment window still says "Your room is held… Pay".** `confirm/[id].tsx:641`. `payment.dueBy` is never shown.
- **G-UA-M24. The move-in card shows on cancelled, completed and unpaid bookings.** `bookings/[id].tsx:471`. The dev force check-in button also shows on cancelled bookings.
- **G-UA-M25. Booking detail on the real-id route never uses the request's payment.** `bookings/[id].tsx:112-113` calls `useStayRequest(null)`, so `visitPaid`, the "Paid to Lampose" row (`:443`) and the Accepted/Paid timestamps (`:191-192`) are always empty.
- **G-UA-M26. Money lines are misleading.**
  - `bookings/[id].tsx:438-439` shows "Paid to the owner so far ₹0" for hotels paid through Lampose.
  - `cancel.tsx:55,170` shows the gross total as "You paid", ignoring the coupon.
  - `BookingTimeline.tsx:168` says "Nothing was charged" on every cancelled booking.
- **G-UA-M27. The reward screen may show another booking's coupon, or a used or expired one.** `moved-in/[id].tsx:64`.
- **G-UA-M28. Notice to vacate is a fixture.** `bookings/notice.tsx:10,89` has a dead button and is unreachable.
- **G-UA-M29. The PIN is falsely described as working offline.** `VerificationCodeDisplay.tsx:118` says "works offline", but no query persister exists.
- **G-UA-M30. The review comment is not validated on the client.** `review.tsx:127`; the server returns 400 (`customerBooking.controller.js:466`).
- **G-UA-M31. Unauthenticated visit-request routes (backend).**
  - `GET /visit-requests/:id` (`visitRequest.routes.js:52`) returns `entryPin`, the customer name and the released address (`visitRequest.model.js:681`).
  - `POST /:id/assisted/slot` (`:79`) and `dev-mark-paid` (`:64`) have no owner check.
- **G-UA-M32. Raw enum values in the status chip.** `bookings/[id].tsx:377` renders values like `PAYMENT_PENDING` and `CANCELLED_BY_OWNER`.
- **G-UA-M33. Dark mode is broken on booking detail.** `bookings/[id].tsx:681,693` hardcodes `#FFFFFF` cards. `moved-in/[id].tsx:74` forces a dark status bar.
- **G-UA-M34. Fixture and dev screens are reachable by deep link in production.**
  - `pay/[id].tsx`: client-computed total with an invented discount.
  - `pay/processing.tsx`: timer simulation, "LAM-4192", a dead "Message support" button at `:186`, and a hardcoded `'10:15 am'` at `:181`.
  - `pay/confirmed.tsx`, `booking.tsx` (a local "Owner rejects" / "Payment fails" simulator at `:262-316`), `shell.tsx`, `primitives.tsx`, `discovery.tsx`, `results.tsx`, `(entry)/splash.tsx`, `request/*`, `listing/visit*`.
  - Only `preview.tsx:125,142` is gated.
  - **Fix:** delete them, or add `if (!previewControls()) return <Redirect href="/home" />`.

**Food**

- **G-UA-M35. Row steppers edit the wrong cart line.** `kitchen/[id].tsx:179-186`, `FoodSearch.tsx:129-142`, `favourites.tsx:74-81`. The row shows the summed quantity but calls `setQty` on the first line with total ±1.
- **G-UA-M36. Portions are shown as add-ons.** `dish/[id].tsx:156-197` uses checkboxes, so several portions can be ticked. `food.adapter.ts:423-429` drops portions priced at or below base. `splitOptions` sends only the first variant, while `FoodContext.tsx:407-408` sums all of them, so the quote diverges from the charge.
- **G-UA-M37. A quantity above 20 is silently capped by the server.** `FoodContext.tsx:577` vs `foodCustomerOrder.controller.js:143`.
- **G-UA-M38. The cart-switch prompt doesn't appear from the dish screen.** `dish/[id].tsx:82-85` ignores the `'conflict'` result. The sheet is only mounted in `FoodModule.tsx:165`.
- **G-UA-M39. Checkout ignores what the kitchen accepts and whether it is open.** `acceptsCod` / `acceptsOnlinePayment` are never read (`food.adapter.ts:61-62`, `payment.tsx:100-106`). The cart and pay buttons stay enabled while the kitchen is closed (`cart.tsx:311-315`, `payment.tsx:335-346`).
- **G-UA-M40. No delivery-area check.** `address.tsx:25-33` promises one; `placeOrder` never checks `deliveryRadiusKm`.
- **G-UA-M41. The sign-in gate on Pay is dead code.** `payment.tsx:187` defines `attemptPay`, but `:345` uses `pay`.
- **G-UA-M42. Pickup and dine-in leftovers that mislead.**
  - `FoodDineIn.tsx:173` says "Order at the counter", but every order is delivery.
  - `KitchenCard.tsx:110` shows "Free pickup", though pickup is refused with 409 at `foodCustomerOrder.controller.js:212-219`.
  - `KitchenCard.tsx:114-115` shows "min ₹0".
  - Non-functional preferences: `preferences.tsx:211-220` (`defaultPickup`), `:128-130` (spice is never sent, `food.adapter.ts:455`) and `:15-18` (diet is never read).
- **G-UA-M43. Search "Request X" is a dead button.** `FoodSearch.tsx:228-232` only resets filters.
- **G-UA-M44. Load errors look like empty lists.** `favourites.tsx:98-111`; `address.tsx:101-106` via `FoodContext.tsx:476-482`. The kitchen empty state is always "Nothing veg" (`kitchen/[id].tsx:403-409`).
- **G-UA-M45. Food providers poll in production.** `_layout.tsx:213-214` mounts them unconditionally, and they refetch every 60 seconds (`useFood.ts:58`, `FoodCatalogueContext.tsx:100`), even though food is hidden.

**Food tracking**

- **G-UA-M46. A cancelled or refused unpaid order still shows "Pay now".** `order/[id].tsx:92,455-463`. The server answers 409 `ORDER_CLOSED`.
- **G-UA-M47. The Orders-tab live card says "The kitchen is cooking" while the rider is on the way.** `FoodOrders.tsx:276-284`. `FoodHome.tsx:546-551` says "Arriving at <cart address>" even at `placed`.
- **G-UA-M48. The timeline on cancelled or unpaid orders shows "Waiting for this".** `buildTimeline` has no cancelled branch (`FoodContext.tsx:762,891-904`). `FoodStatus.tsx:152-154,198`.
- **G-UA-M49. After cancelling, the label is stale and polling stops.** `FoodContext.tsx:1280-1296` keeps the old `paymentLabel` and ignores the returned row. There is no in-flight guard on "Cancel and refund" (`order/[id].tsx:955-972`), and a double tap shows a false "The kitchen has already started".
- **G-UA-M50. Resuming a payment duplicates the order screen.** `order/[id].tsx:193` pushes checkout, which then replaces to the order (`checkout.tsx:85`). The "Payment successful" banner is unreachable for online payments.
- **G-UA-M51. History totals include cancelled, refused and unpaid orders.** `FoodOrders.tsx:53-54`. "This term" is really the last 50 orders.
- **G-UA-M52. The food bell counts every past step as unread on a fresh install.** `FoodContext.tsx:1392,1419-1424`.
- **G-UA-M53. The map shows on finished orders with "signal lost".** `order/[id].tsx:553` has no status check, and a stale socket fix wins after delivery (`:165-169`).
- **G-UA-M54. The rider's phone number and Call button stay on the order forever.** `order/[id].tsx:600-610`; `foodOrder.model.js:1136`.
- **G-UA-M55. Order history has no loading, error or sign-in state.** `FoodContext.tsx:1195` swallows errors. `FoodOrders.tsx:226-235`.
- **G-UA-M56. The notifications screen lists unpaid or concurrent orders as "Recently finished".** `food/notifications.tsx:74-79`. "Mark seen" runs before orders load.
- **G-UA-M57. Food copy and push text is false.**
  - `order/[id].tsx:445` says "one notification when it is ready", but no "ready" push exists.
  - The Delivered push says "Tap to rate the order" (`dispatch.notifier.js:282`), but there is no rating UI.
  - The no-rider push always says "Every rider nearby is busy" (`:211`).
- **G-UA-M58. A completed refund is never shown.** `customerView` sends `razorpay.refundId`/`refundedAt`/`refundStatus` (`foodOrder.model.js:1112-1121`), but `toAppOrder` never maps them. `order/[id].tsx:801-849` is dead, and the screen says "Refund on the way" forever.
- **G-UA-M59. A deep link to a missing order polls forever.** `order/[id].tsx:242,310-323`. It blames "another account" and has no loading state.

**Support**

- **G-UA-M60. The owner's replies appear unsigned.** Partner replies are saved with no `authorName` (`ticket.controller.js:518-522`). The app type has no `'partner'` author (`services/api/types.ts:358`; `support.adapter.ts:166,177`). No push is sent to the student for an owner reply.
- **G-UA-M61. "The owner will see this too" is shown for all four property categories.** `new.tsx:185,20`. The server links the owner only for `property` with a `listingId` (`ticket.controller.js:323-325`).
- **G-UA-M62. No order or booking context in tickets.** `CreateTicketInput` has no `orderNumber` (`support.api.ts:74-82`). Entry points pass no params. `new.tsx` never reads params. The diner categories (`support.audiences.js:50`) have no food category.
- **G-UA-M63. The support push title shows the staff member's real name.** `support.notifier.js:149`, while the thread deliberately hides it.
- **G-UA-M64. The thread's 404 state has the wrong labels and no header.** `[id].tsx:216-222` uses `copy.ts:219-224` ("Search by name").
- **G-UA-M65. The report and category labels are never rendered, nor the unread total.** `support.adapter.ts:124-126`, `Support.tsx:32-101`; `useTickets.ts:114`.
- **G-UA-M66. No sign-in gate on reports or the ticket list.** `report.tsx:76-93` (a guest types 50+ characters, then gets a 401). `support/index.tsx:41` shows "could not load" to guests.
- **G-UA-M67. The categories endpoint is only partly used.** Report reasons and the 50-character minimum are hardcoded (`data/support.ts:84-117`). There is no client check for the 4000-character maximum. An empty response hides every category (`new.tsx:101`).
- **G-UA-M68. Every support socket event is delivered twice.** `support.notifier.js:242,246,271,275` emit to two rooms separately, so the thread is POSTed as read twice per reply.

**Addresses**

- **G-UA-M69. Signed-out dead end, raw error text, and failure looks like empty.**
  - `addresses/index.tsx:88-92` has no sign-in button.
  - `:172-189` shows the error alongside the empty state.
  - Raw `err.message` is used at `index.tsx:98,119,142` and `edit.tsx:197,272`.
- **G-UA-M70. Field errors are not anchored, and there is no client pincode check.** `edit.tsx:405-412,420-424`.
- **G-UA-M71. Saving after a failed load wipes stored fields.** `edit.tsx:183-198,215-223`: the empty form stays savable and PATCHes empty strings.
- **G-UA-M72. A saved pin can't be cleared or refreshed except with the location button.** `edit.tsx:226`.

#### Low

**Auth and entry**
- The Terms and Privacy "links" are dead text (`auth.tsx:521-525`).
- The lock never states the unlock time (`auth.tsx:220,252-253`).
- The OTP boxes are not auto-focused (`auth.tsx:545-558`).
- A stale masked number is kept on `RESEND_TOO_SOON` (`AuthContext.tsx:460-465`).
- Delete-account has no retry and defaults to 30 days when loading fails (`delete-account.tsx:64-74,116`).
- The review account's deletion request is never cleared (`reviewAccounts.service.js:131-133`).
- The theme write is unhandled and the theme can flash on launch (`ThemeContext.tsx`).
- `ErrorBoundary` has no `onError`, so crashes are not reported (`_layout.tsx:197`).
- The splash timer is not fully cleaned up (`SplashSequence.tsx:79-92`).
- Cold-start push routing never calls `clearLastNotificationResponseAsync` (`push.ts:301-309`). This needs a device test to confirm.
- Signing in from Alerts lands on Home, not back on Alerts (`notifications.tsx:132`; same at `food/address.tsx:202`).
- "Mark all read" failures are silent (`useNotifications.ts:123-128`).
- The comment next to Log out is wrong (`home.tsx:1316-1320`).

**Stays**
- "Filled 0 min ago" is invented (`listing.adapter.ts:518`, `types/listing.ts:77-78`, `listing/[id].tsx:800`).
- "Closest area" is really the busiest area; the placeholder promises college and metro matching (`locality.tsx:128-134,290,388`).
- The area median rent is taken from all categories (`places.adapter.ts:62-63`).
- An "Unknown" area opens an empty feed (`listing.controller.js:613-614` vs `listing.formatter.js:126,133`).
- The filter-sheet count includes full listings (`home.tsx:1499`).
- The rent sort mixes nightly and monthly rates (`types/filters.ts:287-289`).
- "Relevance" is just server order (`QuickFilterDropdown.tsx:71-72`).
- A reviews load error reads "No reviews yet", only 10 are shown, and reviews don't check hidden statuses (`listing/[id].tsx:1383-1406`, `listing.controller.js:468-479`).
- Search downloads the full result set on every term with no virtualisation, and matches `ownerName` (`listing.controller.js:300-313`, `home.tsx:1067`).
- The "Map" pill has no map (`home.tsx:1084-1089`).
- "Zero Brokerage" is hardcoded even when there is a paid assisted visit (`listing/[id].tsx:736-741`).
- Back from a deep-linked listing does nothing (`listing/[id].tsx:273,592`).
- Copy slips: "pg / hostels" (`home.tsx:962`), "Tap the bookmark" for a heart icon (`copy.ts:94`), and an accessibility label of "heart" (`Headers.tsx:549`).
- The skeleton ignores dark mode (`ListingCard.tsx:486-488`).

**Bookings and payments**
- A guest on `/confirm/<id>` sees a loader that never ends (`confirm/[id].tsx:261,590`).
- The checkout heading says "Pay for your visit" for hotel stays (`pay/checkout.tsx:173`).
- Android Back mid-checkout doesn't ask for confirmation; there is no `BackHandler` anywhere.
- Free bookings show "₹0" (`BookingList.tsx:73-75`).
- The nights × rate line doesn't match the net amount when a coupon applied (`booked/[id].tsx:426-431`).
- `CHECKED_OUT` pushes `/bookings/refund` with no id, and "Book here again" goes home (`bookings/[id].tsx:567-568`).
- Dead waiting-pill state (`confirm/[id].tsx:313`) and dead `confirmMovedIn`, whose move-in rule differs from `withMoveIn`.
- Visit-slot days are device-local while the server uses server-local days (`visit/slot.tsx:77-81` vs `assistedSlot.controller.js:67-76`).
- No confirmation step before cancelling, and the form can be submitted while `refundable` is still unknown (`cancel.tsx:213-220`).
- `OWNER_WINDOW_MINUTES=3` is hardcoded (`types/request.ts:36`).
- One shared rate limit (12/h) covers withdraw, cancel, refund-details and review (`customer.routes.js`).

**Food**
- "dev build, mock catalogue" text on a live catalogue (`FoodHome.tsx:775`).
- Seeded recent searches and hardcoded "Students near you search" (`FoodSearch.tsx:66,314`).
- "0 min walk" (`cart.tsx:122`, `order/[id].tsx:761`).
- The ETA label is really prep time (`kitchen/[id].tsx:257`, `RestaurantListCard.tsx:88`).
- Dead "popular" features: `ordersInBlock` is never set (`FoodHome.tsx:657-677`, `DishRow.tsx:196`).
- The cart's address is shown instead of the order's (`order/[id].tsx:762`, `FoodOrders.tsx:288`).
- Contradictory copy at `dish/[id].tsx:138-151`, `CartSwitchSheet.tsx:61`, `payment.tsx:36-40,261-265`, `coupons.tsx:52` and `FoodComingSoon.tsx:50-52`.
- Stale comments at `FoodContext.tsx:53-68,223-226,1234-1238`.
- Option labels are repeated in the order `note` (`FoodContext.tsx:409-417`).
- Stale memo dependencies at `FoodContext.tsx:421` and `FoodSearch.tsx:106`.
- Favourite save errors are never shown (`useFoodFavourites.ts:199`).
- The server accepts an empty delivery address (`foodCustomerOrder.controller.js:277`).
- Order-number collisions produce a 500 (`foodOrder.model.js:234-240`).
- `getProduct` doesn't filter `isAvailable`.
- The "delivered at" label shows the pickup time (`order/[id].tsx:297-299`).
- "Order it again" on the order screen only opens the kitchen (`:989`).
- The pickup-code block never renders (`:765-779`), `couponCode` is never mapped (`:422`), and history has no pagination (limit 50).
- The route-refresh throttle uses `&&` but its comment says "whichever comes first" (`DeliveryMap.tsx:68-70,91`).
- The Home card is refreshed only on launch or when the Orders tab opens.
- Statuses `refunded`, `pending` and `failed` are never produced, so their branches are dead.
- The food profile shows Edit and Log out to guests (`food/profile.tsx:75,114-120`).

**Support and addresses**
- The resolved-ticket verdict is stored per device (`[id].tsx:129`).
- The server sends support pushes on an Android `support` channel the app never creates (`support.notifier.js:119` vs `push.ts:182,196`).
- The "first reply within 4 hours" promise is unmeasured, and the copy assumes every owner is a woman (`data/support.ts:43-44,104`).
- Address fields are truncated silently on the server; there is no client `maxLength` (`address.js:137-157`).
- `locateMe` can use an old last-known fix, has no timeout, hardcodes Hyderabad and Bangalore region names, and offers no "Open Settings" (`useMyLocation.ts:94-163`).

**Dead code and tooling**
- `constants/push.ts` holds fake push fixtures and has no importers.
- `hooks/useHealth.ts` is unused, and its `databaseDown` flag can never be true.
- `hooks/useScreenState.ts` is unused.
- Unused: `resolveLocality.ts`, `PlaceFacts.tsx`, `CategoryCarousel.tsx`, `data/places.ts`, `verifyFoodPayment` (`foodOrders.api.ts:250-265`).
- `scripts/build.js` and `server/serve.js` are broken Replit leftovers; no secrets are in them.
- **Secrets check (clean):**
  - There are no `AIza…`, `rzp_…` or `sk_live` strings in source.
  - The Google Maps key comes from env (`app.config.js:83,113`) and is compiled into the APK, so restrict it by package name and SHA in the Google console.
  - `.env` is git-ignored.

---

### 1.3 Prior-audit (`CROSS_APP_AUDIT_FINDINGS.md`) findings for the User App

| Prior item | Verdict | Evidence |
|---|---|---|
| #8 Pickup and dine-in built but unreachable; fulfilment locked to delivery | **Superseded / deliberately closed.** The lock is now intentional. | `FoodContext.tsx:364-368` is still constant `'delivery'`; `kitchen/[id].tsx:36-38` documents removing the toggle; the backend now refuses pickup (`foodCustomerOrder.controller.js:212-219`, `PICKUP_UNAVAILABLE`). Misleading pickup leftovers remain (G-UA-M42). |
| #9 Logout doesn't call the server logout; `SESSION_DEAD` lacks `SESSION_REVOKED` | **Fixed** | `AuthContext.tsx:289` calls `logoutAuth()`, which posts `{everywhere:true}` (`auth.api.ts:110-117`) to `makeLogout` (`customer.routes.js:248`). `client.ts:175` now includes `SESSION_REVOKED`. New issues: G-UA-M3 and G-UA-H18. |
| #18 Support categories hardcoded; endpoint never called | **Mostly fixed** | `new.tsx:79-102` fetches `GET /support/categories` (`support.api.ts:35-42`) and filters local labels by the server's ids. Still open: report reasons, the 50-character minimum and limits are hardcoded; an empty response hides every category (G-UA-M67). |
| #19 An expired OTP gets no distinct UI | **Fixed** | `OTP_EXPIRED` is mapped at `AuthContext.tsx:564-570`, with a distinct message and a "Code expired" box at `auth.tsx:221,254-255,570-578`. |
| Low: pincode error not anchored; `err.message` instead of `displayMessage` | **Still open** | `addresses/edit.tsx:405-412` (no `error` prop), `:420-424`; raw `err.message` at `index.tsx:98,119,142` and `edit.tsx:197,272`. |
| Low: variant priced below base is filtered out (`food.adapter.ts:402`) | **Still open, and worse** | Now `food.adapter.ts:424` (`> base`), which also drops a variant priced exactly at base. |
| Low: `verifyFoodPayment` has zero call sites | **Still open, as dead code** | `foodOrders.api.ts:250-265`, no callers. Payment is verified through `checkoutCallback` and the webhook. The route it would call also leaks the raw order (G-UA-H2). |
| Low: Bookings → Requests segment always empty | **Still open, and worse** | `home.tsx:1365-1367`, comment at `:1348-1356`. Unpaid accepted bookings are also mapped to this segment (`data/bookings.ts:601`), so they appear nowhere (G-UA-H9). |
| Dead code: `request/[id].tsx`, `request/waiting.tsx`, `listing/visit.tsx`, `listing/visit-confirmed.tsx` | **Still open** | They still use fixtures (`findListing`, `visitDays`, `visitConfirmed`, a fake 600 ms submit at `request/[id].tsx:102`). They link only to each other and to the fixture chain `pay/[id]` → `processing` → `confirmed`. They can be reached by deep link in production (G-UA-M34). |
| "Verified solid: live order tracking (status + dispatch.state, every value covered)" | **Partly true** | All 8 statuses (`FoodContext.tsx:655-681`) and all 4 dispatch states are mapped on `order/[id].tsx`. But: the Orders-tab card is wrong for `onTheWay` (G-UA-M47); cancelled timelines are wrong (G-UA-M48); cancelled unpaid orders show Pay now (G-UA-M46); restaurant-delivered web orders can't be completed (G-UA-H19). |
| "Verified solid: address handling (address book, default promotion on delete, fill-empty-only)" | **Confirmed**, with new gaps | G-UA-M69 to G-UA-M72. |

---

### 1.4 Top 10 to fix first
1. G-UA-C1: FoodHome hooks crash.
2. G-UA-C2 and G-UA-H12: cancelled booking still payable, no refund, and the student is locked out.
3. G-UA-H1: owner phone numbers in the public listings API.
4. G-UA-H2 and G-UA-H5: raw food order leaked from the payment endpoints; non-atomic, status-blind `confirmPayment`.
5. G-UA-H3 and G-UA-H4: food cart not cleared after payment, and duplicate orders.
6. G-UA-H6, G-UA-H7 and G-UA-H8: fixture address, Hyderabad city, ₹6,500 price and stock photos presented as real.
7. G-UA-H9 and G-UA-H10: requests missing from Bookings; request tracking tied to one device.
8. G-UA-H14: no Cancel on confirmed bookings; stale data after cancel.
9. G-UA-H15 and G-UA-H16: resolved tickets reopen; support pushes dead.
10. G-UA-H18: query cache not cleared between accounts.


---

## 2. Stay Partner app (`Stay Partner/`)

**What was covered.** Every route under `Stay Partner/app/`, plus every component, hook, service, context and `lib` file those routes use. Each API call was traced to its handler in `Backend/src/modules/partners/*`, `support/*`, `accountDeletion/*`, `visits/*` and `inventory/*`.

**Screens you can only reach by deep link (`lamposepartner://`) or from one buried button:**
- `/reviews`
- `/payout-setup`
- `/support` and `/support/new` (only from the check-in lockout screen)
- `/inventory/*` (runs on fixture data)
- `/design-system`
- `/settings/stub`
- `/splash`

Paths below are relative to `Stay Partner/` unless stated. In the acceptance criteria, ✗ marks a check that currently fails.

### 2.1 User stories

Every story is written from the owner's side: "As a property owner, I want …".

#### Sign-in and onboarding

| ID | I want … | Screen | Endpoint | Status | Acceptance criteria |
|---|---|---|---|---|---|
| US-SP-A1 | to sign in with my mobile number and an SMS code | `components/auth-login/LoginScreen.tsx` | `POST /api/v2/partners/auth/start`, `/verify`, `/resend` | ⚠️ | A number starting 6–9 sends a code. A wrong code shows "N tries left", and after 5 wrong tries I see the unlock time. A new number goes to profile setup; a returning one goes to Today. ✗ A failed resend (`RESEND_LIMIT`) shows no message (G-SP-32). |
| US-SP-A2 | to sign in with my email and password | same screen, password mode (`:459-533`) | `POST /partners/auth/login` | ✅ | One generic error for a wrong email or password. `PHONE_NOT_VERIFIED` gets its own message. |
| US-SP-A3 | to stay signed in, and be told clearly when my session has ended | `context/AuthContext.tsx` | `GET /partners/me` | ⚠️ | A valid token skips the login screen with no flash. An expired token shows "Session expired". ✗ A revoked session, or a blocked account, is never detected (G-SP-16). |
| US-SP-B1 | to set my name, email and referral code after verifying my number | `auth-profile-setup/ProfileSetupScreen.tsx` | `PATCH /partners/me` | ⚠️ | Continue needs a name. An invalid email shows an error. ✗ An invalid referral code is silently ignored (G-SP-21). ✗ I can't leave this screen to sign out (G-SP-37). |
| US-SP-B2 | (hotel owner) to register the bank account Lampose settles into | `auth-payout-setup/PayoutSetupScreen.tsx` | `GET/POST /partners/payout-onboarding` | ❌ | Owners who aren't hotels are redirected away. "Pending" shows a Check again button; a rejection shows the reason. ✗ Nothing in the app opens this screen (G-SP-30). |

#### Today tab (dashboard)

| ID | I want … | Screen | Endpoint | Status | Acceptance criteria |
|---|---|---|---|---|---|
| US-SP-C1 | to see today's arrivals, departures, earnings and pending requests at a glance | `tabs-index/TodayTabScreen.tsx` | `GET /partners/summary`, `/notifications`, `/requests`, `/bookings` | ⚠️ | Pull-to-refresh updates every tile, and going offline shows Retry. ✗ The header always reads "Rajahmundry, AP" (G-SP-12). ✗ The earnings tiles actually show payouts (G-SP-27). |
| US-SP-C2 | a single switch that takes all my rooms offline | `HeroCard`, `TodayTabScreen.tsx:318-338` | `PATCH /partners/share-types/availability` | ⚠️ | Turning it off marks everything unavailable. Turning it on opens the share types in "Confirm & go online" mode. ✗ If the call fails, no error is shown (G-SP-23). |
| US-SP-C3 | a strip of everything waiting on me | `components/OngoingStrip.tsx` | computed in the app | ✅ | It shows requests waiting on me, today's arrivals, and accepted requests that are still unpaid. |

#### Properties

| ID | I want … | Screen | Endpoint | Status | Acceptance criteria |
|---|---|---|---|---|---|
| US-SP-D1 | to see my listings the way students see them | `settings-property/PropertyDetailsScreen.tsx` | `GET /partners/properties` | ⚠️ | One card per property; the Verified/Pending badge is correct; there's an empty state. ✗ Deleted listings come back (G-SP-7). |
| US-SP-D2 | to edit my listing details | `settings-property-edit/PropertyEditScreen.tsx`, `PropertyCategoryFields.tsx` | `GET/PATCH /partners/properties/:id` | ⚠️ | "Both Short & Long Stay" survives a save. I can't set `ownerMobile` to someone else's number. ✗ I can't enter PG bed counts (G-SP-8). ✗ A price of ₹0 is accepted (G-SP-33). |
| US-SP-D3 | to add and remove photos | `PropertyPhotosField.tsx` | `POST /partners/uploads/property-images` | ✅ | The first photo is the cover, and ✕ removes a photo. There's no reordering and no camera option. |
| US-SP-D4 | to pause one listing | `PropertyCard` switch | `PATCH /partners/properties/:id/availability` | ✅ | The pause stays after a refresh. |
| US-SP-D5 | to delete a listing | `PropertyCard` | `DELETE /partners/properties/:id` | ⚠️ | Deleting is refused with a 409 while a guest is staying or a request is pending. ✗ The deleted card comes back after a refresh (G-SP-7). |

#### Rooms and share types

| ID | I want … | Screen | Endpoint | Status | Acceptance criteria |
|---|---|---|---|---|---|
| US-SP-E1 | to see my room types and amenities | `settings-rooms/RoomsAndAmenitiesScreen.tsx` | `GET /partners/share-types`, `/properties` | ✅ | Each room type shows its price and bed count; there's an empty state. |
| US-SP-E2 | to turn individual share types on and off | `share-types-index/ShareTypesScreen.tsx` | `PATCH /partners/share-types/:id/availability` | ⚠️ | ✗ Errors are swallowed and the screen closes as if it saved (G-SP-22). ✗ A missing price shows as a fake ₹8,000. ✗ There's no empty state. |
| US-SP-E3 | seasonal and weekend pricing | `inventory-*` screens | none | ❌ | Runs on fixture data only and isn't reachable; the rule editor says "This form was never designed". |

#### Requests

| ID | I want … | Screen | Endpoint | Status | Acceptance criteria |
|---|---|---|---|---|---|
| US-SP-F1 | a ringing popup the moment a student asks for a stay | `components/IncomingRequestAlert.tsx`, `services/alertSound.ts`, `services/realtimeSocket.ts` | socket `stay_request_new`; polls `/partners/requests` every 4–5 s | ✅ | Appears within about 4 s and rings even in silent mode, once per request. "Not now" dismisses it; "Open" goes to the request. |
| US-SP-F2 | an inbox sorted by deadline, with a badge on the tab | `tabs-requests/RequestsInboxScreen.tsx` | `GET /partners/requests`, `POST /partners/requests/read` | ⚠️ | ✗ The server never hears "read" after my first visit (G-SP-11). ✗ Website requests are counted in the badge (G-SP-28). |
| US-SP-F3 | to accept a request and be told which other requests were closed automatically | `requests-id/RequestDetailScreen.tsx` | `POST /partners/requests/:id/accept` | ✅ | Taking the last bed shows "N other requests closed". An expired request shows the server's reason. |
| US-SP-F4 | to decline with a reason | `requests-reject/RejectSheetScreen.tsx` | `POST /partners/requests/:id/decline` | ✅ | Confirm needs a reason chip. On success I'm back in the inbox; if two actions race, I see the server's message. |
| US-SP-F5 | website requests to tell me to answer AVAILABLE on WhatsApp | `RequestDetailScreen.tsx:365-374` | WhatsApp webhook | ✅ | The detail screen says so. ✗ The dashboard alert shows these as "NEW REQUEST" with an empty timer (G-SP-28). |
| US-SP-F6 | to see the entry PIN and payment status after I accept | `RequestDetailScreen.tsx:106-161, 408-434` | same | ✅ | |

#### Bookings

| ID | I want … | Screen | Endpoint | Status | Acceptance criteria |
|---|---|---|---|---|---|
| US-SP-G1 | Upcoming and History lists with filters | `tabs-bookings/BookingsTabScreen.tsx` | `GET /partners/bookings?category=` | ⚠️ | Chip counts are right, and an error shows Try again. ✗ The list doesn't refresh after check-in, checkout or cancel (G-SP-13). |
| US-SP-G2 | booking details | `booking-id/BookingDetailScreen.tsx` | `GET /partners/bookings/:id` | ✅ | Shows the guest's contact, dates and payout. |
| US-SP-G3 | to check a guest in with their 6-digit PIN on arrival day | `PrimaryAction.tsx`, `booking-checkin/CheckInScreen.tsx`, `booking-checked-in/CheckedInScreen.tsx` | `POST /partners/bookings/:id/checkin {code}` | ❌ | ✗ **On the arrival day itself the button is disabled** (G-SP-1). A wrong PIN shows the attempts left; before the date the server returns `TOO_EARLY`. |
| US-SP-G4 | to check a guest out on their departure day | `booking-active/ActiveStayScreen.tsx`, `booking-checkout/CheckoutSheetScreen.tsx` | `POST /partners/bookings/:id/checkout` | ⚠️ | Both checkboxes are required; the bed count goes up by 1. ✗ Hotels only: PG, Co-live and Bachelor tenants can never be checked out (G-SP-2). ✗ An overdue departure is disabled (G-SP-18). |
| US-SP-G5 | to cancel a booking with a reason | `booking-cancel/CancelBookingScreen.tsx` | `POST /partners/bookings/:id/cancel` | ⚠️ | A reason and a confirmation are required; the student is told and the bed is released. ✗ Hotels only. |

#### Walk-in customers

| ID | I want … | Screen | Endpoint | Status | Acceptance criteria |
|---|---|---|---|---|---|
| US-SP-H1 | to log a walk-in guest after checking their phone with an SMS code | `requests-add-customer/AddCustomerScreen.tsx` | `POST /partners/guest-otp/start` and `/verify`, `POST /partners/bookings` | ⚠️ | Save needs a name, phone, date, address, at least one document and a verified phone. A PG pre-fills the rent. ✗ Owners with 0 properties are blocked (G-SP-24). ✗ Changing the phone keeps the ✓ (G-SP-25). ✗ The property isn't checked against the owner (G-SP-9). |
| US-SP-H2 | an invite code to share with that guest | same screen | `POST /partners/invites` | ✅ | Shows the code and its expiry; Share opens the share sheet. |
| US-SP-H3 | to list, edit and delete my walk-in customers | `customers/CustomersScreen.tsx`, `customer-id/EditCustomerScreen.tsx`, `customer-delete/DeleteCustomerSheetScreen.tsx` | `GET /partners/bookings?source=manual`, `PATCH/DELETE /partners/bookings/:id` | ⚠️ | ✗ Deleting a customer doesn't free the bed (G-SP-10). |

#### Money

| ID | I want … | Screen | Endpoint | Status | Acceptance criteria |
|---|---|---|---|---|---|
| US-SP-I1 | to see my balance and request a payout | `earnings-index/EarningsScreen.tsx` | `GET /partners/earnings`, `/payouts`, `POST /partners/payouts/request` | ⚠️ | Disabled at ₹0. With no bank account it prompts me to add one. After a request, a pending badge and a history row appear. ✗ The "Today / This week" tiles count payouts, not earnings (G-SP-27). |
| US-SP-I2 | to manage my bank accounts | `earnings-methods/*`, `earnings-add-method/*`, `earnings-method-actions/*` | `/partners/payment-methods` (GET/POST/PATCH/DELETE) | ⚠️ | A bad IFSC shows an error; the bank name is detected automatically; the first account becomes the default. ✗ The default account can't be removed. ✗ A failed load shows "No payout method" (G-SP-26). |
| US-SP-K1 | to share my own referral code | `referrals-index/ReferAndEarnScreen.tsx` | `GET /partners/referrals`, `/invites` | ❌ | ✗ **Every owner shares the hard-coded code `ANJALI4821`** (G-SP-4). |
| US-SP-K2 | to withdraw referral points once I have 500 or more | `referrals-withdraw/WithdrawReferralsScreen.tsx` | `POST /partners/referrals/withdraw` | ❌ | ✗ **The server sets my points to zero and pays nothing** (G-SP-3). |

#### Reviews, notifications, support, staff, profile, deletion, logout

| ID | I want … | Screen | Endpoint | Status | Acceptance criteria |
|---|---|---|---|---|---|
| US-SP-J1 | to read reviews and reply publicly | `reviews-index/ReviewsListScreen.tsx`, `ReviewCard.tsx` | `GET /partners/reviews`, `POST …/:id/reply` | ❌ | ✗ The screen can't be reached, and the Reply button never appears (G-SP-6). |
| US-SP-L1 | an in-app notification inbox | `notifications-index/NotificationsScreen.tsx` | `GET /partners/notifications`, `POST …/:id/read` | ✅ | A failed load shows an error, not an empty list. Tapping a notification opens the request. |
| US-SP-L2 | pushes that open the right screen when tapped | `services/push/push.ts`, `usePushRouting.tsx` | `POST/DELETE /partners/devices` | ⚠️ | ✗ An old push reopens on every cold start. ✗ Only request pushes are routed anywhere (G-SP-29). |
| US-SP-M1 | to report a problem with a guest and follow the thread | `complaints-*`, `support-ticket/TicketThreadScreen.tsx` | `/api/v2/partners/support/tickets` (`guest`), socket `ticket:<ref>` | ✅ | Replies arrive live; a closed ticket disables input. |
| US-SP-M2 | tickets about payouts, listings, my account or the app | `support-index`, `support-new` | `/partners/support/categories`, `/tickets` | ⚠️ | ✗ There's no menu entry; the only way in is the check-in lockout screen (G-SP-15). |
| US-SP-M3 | to raise a dispute about a booking | `support-dispute/RaiseDisputeScreen.tsx` | creates a `guest` ticket | ⚠️ | ✗ It tells me to follow up in a "Support tab" that doesn't exist. |
| US-SP-N1 | to invite staff with roles and remove them | `staff-index`, `staff-invite` | `/partners/staff` (GET/POST invite/DELETE) | ❌ | ✗ It only writes a database row: no SMS, no login for staff, no permission checks, no remove button, and errors are swallowed (G-SP-14). |
| US-SP-O1 | to edit my profile and address, with "Use my location" | `settings-profile/EditProfileScreen.tsx`, `services/location/locateMe.ts` | `PATCH /partners/me` | ⚠️ | Only empty fields are filled; a bad pincode is refused. ✗ A located pin with no street is dropped even though a toast says it was saved (G-SP-19). ✗ Email isn't unique (G-SP-5). |
| US-SP-P1 | to request account deletion and be able to cancel it | `settings-delete-account/DeleteAccountScreen.tsx` | `GET/POST/DELETE /partners/me/account-deletion` | ✅ | Shows "Scheduled for deletion on <date>"; I can cancel; active bookings are listed. |
| US-SP-Q1 | logging out to end my session on the server | `tabs-menu/MenuTabScreen.tsx:145-159` | `DELETE /partners/devices` (`POST /auth/logout` is **never called**) | ⚠️ | ✗ The token stays valid after logout. ✗ There's no "are you sure?" dialog (G-SP-16, G-SP-39). |

### 2.2 Gaps

| ID | Sev | Where | What happens / repro | Fix |
|---|---|---|---|---|
| G-SP-1 | 🔴 Critical | `components/booking-id/organisms/PrimaryAction/PrimaryAction.tsx:74` (**checked**) vs `Backend/…/partners/bookingStage.util.js:97-99`, `lib/bookings.ts:302` | When `checkInDate` is today, the server sends `stage:'arriving'`. PrimaryAction only enables "Start check-in" for `confirmed` or `overdueArrival`, so on the arrival day the button is disabled. Guests can only be checked in the day after. **Repro:** create a booking with today's check-in date and open it. | Add `'arriving'` to the condition. |
| G-SP-2 | 🔴 Critical | `PrimaryAction.tsx:41-43`, `booking-active/ActiveStayScreen.tsx:96-111, 120-121`, `BookingDetailScreen.tsx:244-247`, `partnerDomains.controller.js:120-137` | PG, Co-live and Bachelor tenants can never be checked out or cancelled from the app. Checkout and cancel are the only things that call `releaseBed`, so `availableBeds` only ever goes down and properties end up showing as full. | Offer "Mark moved out" for every property type. |
| G-SP-3 | 🔴 Critical | App: `referrals-withdraw/WithdrawReferralsScreen.tsx:77, 146-158`. Server: `partnerDomains.controller.js:1228-1241` | Withdrawing sets `points:0, earningsRupees:0`, but no payout or ledger row is created, no payment method is sent, and the 500-point minimum is only checked in the app. The app still says "₹X is on its way". If the owner has no referral row, `ref._id` throws a 500. | In one transaction, create a payout row and check the minimum on the server. Handle a missing referral row. |
| G-SP-4 | 🔴 Critical | `referrals-index/ReferAndEarnScreen.tsx:60, 101-103`, `lib/referrals.ts:31` (**checked**: `REFERRAL_CODE = 'ANJALI4821'`) | Every owner shares the same fake code and link. If the code fails to load, the screen falls back to showing `'PAR-9600'`. | Use `refInfo.code`, and show a loading or error state instead of a fallback. |
| G-SP-5 | 🟠 High (security) | `partner.model.js:187` (email has no unique index), `partner.controller.js:457, 591-599`, `EditProfileScreen.tsx:228-244` | Owner A can set their email to owner B's login email. `findOne({email})` may then return A's row, which has no password hash, and B gets `INVALID_CREDENTIALS` and is locked out. | Add a unique sparse index, return 409 on a clash, and pick the row that has a password hash. |
| G-SP-6 | 🟠 High | `ReviewsListScreen.tsx:51, 53-55`, `ReviewCard.tsx:82-92`, reviews schema in `partnerDomains.model.js` | The schema defaults `reply` to `{text:null}`, which is truthy, so every review renders an empty reply with a hard-coded "SV" avatar and never shows the Reply button. `rating \|\| 5` makes up 5 stars. No screen links to `/reviews`. | Test `reply?.text` instead; add a Reviews entry to Profile. |
| G-SP-7 | 🟠 High | `portfolio.controller.js:76-82, 461`, `PropertyDetailsScreen.tsx:77-81, 147` | `ownedProperties` includes `status:'removed'`, so a deleted listing comes back on the next refresh and can become the header name. | Filter out removed properties. |
| G-SP-8 | 🟠 High | `PropertyCategoryFields.tsx:353-359` (vs Hotel `:388-390` and Bachelor/Co-live `:533-540`), `PropertyCard.tsx:82-86`, `RoomsAndAmenitiesScreen.tsx:125, 154` | The PG and Hostel sections have no inputs for bed or room counts, so PGs never get share types and students can never request them. Yet the app tells owners to "add room counts in Edit details". | Add a bed or room count for each sharing type. |
| G-SP-9 | 🟠 High (security) | `addCustomer.controller.js:483-498, 542-548`, `inventory.service.js:273-280, 356-359`, `propertyEdit.controller.js:466-469` | Add Customer never checks that `propertyId` belongs to the caller. One owner can take a bed in another owner's property, and that booking then blocks the real owner from deleting their listing. | Require that `phoneKey(property.ownerMobile)` equals the caller's key. |
| G-SP-10 | 🟠 High | `addCustomer.controller.js:685-735`, `DeleteCustomerSheetScreen.tsx:37` | Deleting a walk-in customer hard-deletes the booking without calling `releaseBed`, and it doesn't restrict deletion to `source:'manual'`. | Release the bed when the booking was occupying one, and refuse non-manual bookings. |
| G-SP-11 | 🟠 High | `tabs-requests/RequestsInboxScreen.tsx:141-147` | `useFocusEffect(useCallback(…, []))` captures the first `unread` value. The tab stays mounted, so `POST /requests/read` is never sent again. | Read `unread` through a ref. |
| G-SP-12 | 🟠 High | `TodayTabScreen.tsx:369-370`, `HeaderBar.tsx:16, 23-24, 43`, `portfolio.controller.js:453-487` | The header falls back to "Apex Luxury Girls Hostel & PG" and "Rajahmundry, AP". `getSummary` never returns `city`, so every owner sees Rajahmundry. The chevron suggests a property switcher that doesn't exist. | Return `city` from the summary and remove the fixture fallbacks. |
| G-SP-13 | 🟠 High | `BookingsTabScreen.tsx:180-223`, `stayRequest.notifier.js:501`, `CheckoutSheetScreen.tsx:42`, `CancelBookingScreen.tsx:80` | The Bookings tab doesn't reload on focus, and the socket only covers cancellations made by students, so after checkout or cancel the old row stays. | Reload with `useFocusEffect`, or switch to react-query `queryKeys.bookings`. |
| G-SP-14 | 🟠 High | `staff-invite/InviteStaffScreen.tsx:56-72`, `lib/staff.ts:66-81`, `partnerDomains.controller.js:1140-1158`, `StaffListScreen.tsx` | Staff invites are a facade: errors are swallowed, a fixture is mutated, and there's no SMS, no staff identity and no permission checks. There's no remove button even though `DELETE` exists. | Build the feature properly, or label it "Coming soon". |
| G-SP-15 | 🟠 High | `MenuTabScreen.tsx:25-34, 63-71`, `CheckInScreen.tsx:203`, `RaiseDisputeScreen.tsx:97-98` | The general Support inbox can't be reached; the only link is on the check-in lockout screen. The dispute screen points to a "Support tab" that doesn't exist. | Add "Help & support" to Profile. |
| G-SP-16 | 🟠 High | `AuthContext.tsx:196-216, 267-271, 477-479`, `services/api/client.ts:166`, `partnerAuth.middleware.js:117, 121`, `partner.routes.js:189` | Logout never calls `POST /partners/auth/logout`. `SESSION_DEAD` doesn't include `SESSION_REVOKED` or `PHONE_NOT_VERIFIED`, so after "sign out everywhere" this device keeps a session that no longer works. A 403 `ACCOUNT_BLOCKED` at cold start leaves the app "signed in" with every screen showing errors. | Call logout, add the missing codes, and handle `ACCOUNT_BLOCKED`. |
| G-SP-17 | 🟡 Med | `CheckInScreen.tsx:33-36, 107-108, 143, 234, 248-253`, `partnerDomains.controller.js:364-376` | The 3-minute code expiry and the "locked for 15 minutes" message are invented in the app and reset when the screen is reopened. The server has no attempt limit. The lockout tells owners to "check in manually from support", which isn't possible. | Remove the fake timer and add an attempt limit on the server. |
| G-SP-18 | 🟡 Med | `ActiveStayScreen.tsx:114, 130-140` (the shortcut at `:196` works) | For an overdue departure the footer is disabled with a past date. | Enable it when the departure date is today or earlier. |
| G-SP-19 | 🟡 Med | `EditProfileScreen.tsx:69-74, 122-133`, `locateMe.ts:92` | The toast says "Pin saved", but the address, including the pin, is only sent when `line1` is filled. `state` is dropped. | Save the pin even without a street, or change the message. |
| G-SP-20 | 🟡 Med | `EditProfileScreen.tsx:181-185` | Every owner sees a hard-coded "Verified Owner" badge. | Base the badge on the server's verification status. |
| G-SP-21 | 🟡 Med | `ProfileSetupScreen.tsx:121-130`, `partner.controller.js:583-589` | An invalid referral code is silently ignored: the server swallows the error and returns 200. | Return the error and show it. |
| G-SP-22 | 🟡 Med | `ShareTypesScreen.tsx:85, 99-101, 127-143, 192` | A failed load looks like an empty list, and there's no empty state. A missing price shows as a fake `\|\| 8000`. Save swallows errors, always goes back, and a partial `Promise.all` failure goes unnoticed. The label says "per bed" even for hotels. | Show errors, and stay on the screen if the save fails. |
| G-SP-23 | 🟡 Med | `TodayTabScreen.tsx:331-337` | The offline switch flips locally, and if the API call fails the error only goes to `logWarn`. | Roll the switch back and show the error. |
| G-SP-24 | 🟡 Med | `AddCustomerScreen.tsx:137, 142, 237` | Owners with 0 properties can never save (`canSave` needs a `category`), and with 2 or more properties and none chosen, Save is silently disabled. Properties are matched by name. | Tell the owner what's missing, and match by id. |
| G-SP-25 | 🟡 Med | `AddCustomerScreen.tsx:458`, `VerificationCodeField.tsx:125-136` | Editing the phone number keeps "Verified +91 <new number>". The server catches it and returns 409. | Reset `verified` when the phone changes. |
| G-SP-26 | 🟡 Med | `PayoutMethodsScreen.tsx:27-31, 87-91`, `AddMethodScreen.tsx` | The default account can't be removed. A failed load shows "No payout method". There's no "re-enter account number" check. | Allow removing the default, show the load error, and add a confirmation field. |
| G-SP-27 | 🟡 Med | `partnerDomains.controller.js:656-670`, `portfolio.controller.js:414-431`, `EarningsScreen.tsx:122-123` | The "Today / This week" earnings tiles actually add up completed payouts, and "today" uses the server's local midnight, not IST. | Compute from bookings, using IST. |
| G-SP-28 | 🟡 Med | `UnansweredRequestAlert.tsx:73-75` (vs `IncomingRequestAlert.tsx:141`), `(tabs)/_layout.tsx:44` | Website and WhatsApp requests show as "NEW REQUEST" with an empty timer, and they're counted in the badge. | Filter to `channel==='app'`. |
| G-SP-29 | 🟡 Med | `services/push/push.ts:229-237, 253-261`, `usePushRouting.tsx:272-278` | `getLastNotificationResponseAsync` reopens the same old request on every cold start. Only pushes carrying a `requestId` are routed. | Call `clearLastNotificationResponseAsync`, and route every push kind. |
| G-SP-30 | 🟡 Med | No navigation to `/payout-setup`; `settlement.service.js:62-75`; `PayoutSetupScreen.tsx:92` | Hotel payout onboarding is orphaned, even though admin settlements require it to be `active`. The screen says "Pull to try again" but has no pull-to-refresh. | Link it from Earnings for hotel owners. |
| G-SP-31 | 🟡 Med (performance) | `useStayRequests.ts:40, 71, 145-150`, `portfolio.controller.js:80, 237-255` | Every signed-in phone polls every 4–5 s, forever. Each poll loads up to 200 visit requests and runs `settleIfExpired`, and `Property.find({})` scans the whole collection. | Poll only while the app is in the foreground, back off over time, and query with an index. |
| G-SP-32 | 🟡 Med (check on a device) | `LoginScreen.tsx:257-267, 452-457, 621` | The OTP field is `autoFocus` while hidden on the back of the flip card, and resend errors only show on the front, so they're never seen. | Focus the field after the flip, and show the error on the code step. |
| G-SP-33 | 🟡 Med | `PropertyEditScreen.tsx:74-78, 180-183`, `propertyEdit.controller.js:120-126` | A ₹0 rent is accepted. Amenities outside `ALL_AMENITIES` are invisible and can't be removed. Changing the category keeps the old `categoryDetails`. | Set a minimum price, show unknown amenities, and reset details when the category changes. |
| G-SP-34 | 🟡 Med | `propertyEdit.controller.js:466-469` vs the enum at `partnerDomains.model.js:63` | The removal guard ignores the `arriving` and `departing` statuses. | Include them. |
| G-SP-35 | 🟡 Med | `partnerDomains.controller.js:1296-1329` | A missing request body is read as `false` and pauses every property. Turning it back on doesn't re-enable the share types. | Validate the body. |
| G-SP-36 | 🟡 Med (Play policy) | `android/app/src/main/AndroidManifest.xml:9-10`, `app.config.js` | `RECORD_AUDIO` and `SYSTEM_ALERT_WINDOW` are declared but unused. The `expo-image-picker` plugin isn't declared. | Remove the two permissions and declare the plugin. |
| G-SP-37 | ⚪ Low | `ProfileSetupScreen.tsx`, `(auth)/_layout.tsx` | Profile setup has no sign-out or back, so someone who verified the wrong number is stuck. | Add a sign-out link. |
| G-SP-38 | ⚪ Low | `LoginScreen.tsx:585-589` | The Terms and Privacy "links" can't be tapped. | Make them open the pages. |
| G-SP-39 | ⚪ Low | `MenuTabScreen.tsx:145-149` | Logout has no confirmation. | Add a confirmation dialog. |
| G-SP-40 | ⚪ Low | `app/inventory/*`, `app/settings/stub.tsx`, `app/design-system.tsx`, `app/splash.tsx` | Fixture and dev screens ship in the app and can be opened by deep link. | Remove them, or gate them behind `__DEV__`. |
| G-SP-41 | ⚪ Low (dead code) | `lib/bookings.ts:120-249`, `lib/notifications.ts:187-236`, `lib/staff.ts:37-41`, `lib/referrals.ts:44-98`, `TodayTabScreen.tsx:6-15`, `usePortfolio.ts`, `useListings.ts`, `useHealth.ts`, unused `domain.api.ts` functions, 5 unused organisms, `AadharUploadTile`, `uploadKycImages` | Unused code. | Delete it. |
| G-SP-42 | ⚪ Low | `CancelBookingScreen.tsx:194-196` | Warns about a "response rating" that doesn't exist. | Remove the warning. |
| G-SP-43 | ⚪ Low | `BookingDetailScreen.tsx:213-221`, `CheckedInScreen.tsx:152-168`, `lib/bookings.ts:414` | Says "Waiting for guest to confirm", but the server now confirms both sides at once. Check-out time is hard-coded to 11:00 AM. | Update the copy. |
| G-SP-44 | ⚪ Low | `RejectSheetScreen.tsx:128` | Says "note for the guest", but it's unconfirmed whether the student ever sees `declineNote`. | Confirm, then fix the copy or the notifier. |
| G-SP-45 | ⚪ Low | `NewTicketScreen.tsx:72`, `TicketThreadScreen.tsx:82-92, 108-110` | Category ids are shown raw. A network error reads "Ticket not found". A failed reply fails silently. | Use labels and show the real error. |
| G-SP-46 | ⚪ Low | `RaiseDisputeScreen.tsx:66-72` | Sends `roomType` as `placeLabel`, sends no `listingId`, and files "False review" under `guest`. | Correct the fields. |
| G-SP-47 | ⚪ Low | `PropertyPhotosField.tsx` | No reordering or set-as-cover, photos are removed without confirmation, uploads made before an abandoned edit are left orphaned on Cloudinary, and there's no camera option. | |
| G-SP-48 | ⚪ Low | `ErrorFallback.tsx:39-40` | The full stack trace is shown in production. | Show it only under `__DEV__`. |
| G-SP-49 | ⚪ Low | `QuickActionsGrid.tsx:20` ("1 pending requests"), `HeroCard` (" ☀️" with no name), `(tabs)/_layout.tsx:56` (`#FF5200` isn't a brand colour), `TodayTabScreen.tsx:108-112` (the `today` memo goes stale after midnight), `EditProfileScreen.tsx:96-104, 124, 173-175` | Cosmetic issues: wrong plural, stray emoji, off-brand tab colour, stale date after midnight, a stale dirty check, `kind` hard-coded to `'home'`, a dead pencil icon. | |
| G-SP-50 | ⚪ Low | `partner.controller.js:146-152` | `startAuth` creates a Partner row before the code is verified, so junk rows pile up. | Create the row on verify. |
| G-SP-51 | ⚪ Low | `portfolio.controller.js:237-240` vs `:301-302` | The request list matches phones by `+91`/10-digit strings, while the detail screen uses `phoneKey`. A request can open in detail but be missing from the list. | Use `phoneKey` in both. |

### 2.3 Stay Partner items from the previous audit

| Prior # | Now |
|---|---|
| #7 Dual-rate stay type lost on edit | **Fixed** |
| #13 Rooms screen says the feature doesn't exist | **Fixed** (the wording now points to Property details, but there's still no PG field there; see G-SP-8) |
| #14 Payout setup had no validation | **Fixed** (but the screen is now unreachable; see G-SP-30) |
| #15 Fake notification toggles | **Fixed** (removed) |
| #16 No account deletion | **Fixed** |
| #17 A failed load looked like an empty list | **Fixed on Earnings and Notifications**; still open on PayoutMethods, ShareTypes, Staff and Reviews |
| #9 Logout doesn't revoke the session | **Still open** (G-SP-16) |
| Low: dead pencil icon, `kind` hard-coded to `'home'`, stale dirty check, payout rejection banner only updates on reload, raw category chips | **All still open** |


---

## 3. Food-Partner app (`Food-Partner/`)

**What was covered:** all 25 route files under `Food-Partner/app/`, every screen component, every `services/*` file, the store, `lib/*`, constants and shared organisms. Each API call was traced into `Backend/src/modules/foodpartners/*`, `support/*`, `accountDeletion/*`, `realtime.js` and `foodDispatch.service.js`.

**Path shorthand:** `FP/` = `Food-Partner/`, `BE/` = `Backend/src/modules/`.

### 3.1 User stories

Each row reads "As a restaurant owner or kitchen staff member, I want …". A ✗ in the acceptance criteria marks a check that currently fails.

| ID | Story | Screen(s) | Endpoint(s) | Status | Acceptance criteria |
|---|---|---|---|---|---|
| US-FP-A1 | Verify my phone with an OTP so the application is tied to my number | `onboarding-restaurant/StepRestaurant.tsx` | `POST /auth/otp/start`, `/auth/otp/verify` | ⚠️ | The code is sent to +91; a wrong code shows the attempts left; lockout is shown; ✗ the **server never checks the proof** (G-FP-1) |
| US-FP-A2 | Enter the restaurant, owner, address and map pin so diners and riders can find me | StepRestaurant, `LocationRow` | local | ⚠️ | Required fields gate Next; ✗ union territories are missing (G-FP-14); ✗ "use my location" overwrites typed fields (G-FP-15); ✗ the pin is optional (G-FP-3) |
| US-FP-A3 | Set opening hours, prep time, delivery radius, fee and payment modes | `onboarding-operations/StepOperations.tsx` | local | ⚠️ | Split slots per day and "copy Monday" work; ✗ minimum order and packaging charge are collected but never billed; ✗ `distance_based` fee bills ₹0 (G-FP-11, G-FP-12) |
| US-FP-A4 | Build my menu by hand or from a CSV | `onboarding-menu/StepMenu.tsx`, `ProductForm`, `lib/menuSheet.ts` | sent as `products[]` | ⚠️ | CSV headers are validated; ✗ moving an item to another category is lost (G-FP-16); ✗ rows with no price become ₹0 (G-FP-17); ✗ the sheet itself is never uploaded (G-FP-18) |
| US-FP-A5 | Upload PAN, GST, FSSAI and a cancelled cheque, and add bank details | `onboarding-documents/StepDocuments.tsx`, `FilePick` | `POST /uploads/images` | ⚠️ | Files upload before submit; ✗ an expired FSSAI still passes Next (G-FP-10); ✗ the "Use a sample" 1×1 image ships in production (G-FP-2) |
| US-FP-A6 | Read the terms, sign and submit | `onboarding-contract/StepContract.tsx`, `submitted/Submitted.tsx` | `POST /applications` | ⚠️ | Upload progress and server errors are shown; a session is returned; ✗ the commission rate is never shown; ✗ the contract says "weekly every Monday" but payouts are on request (G-FP-13) |
| US-FP-B1 | See where my application stands | `status/Status.tsx` | `GET /me` | ⚠️ | The status is re-read on mount; "Open the dashboard" appears once approved; ✗ "What you sent" shows local or default data (G-FP-21) |
| US-FP-B2 | As a rejected applicant, see why and fix it | Status, `_layout.tsx` | 403 `ACCOUNT_REJECTED` | ❌ | The reason is shown; ✗ there is no resubmit path — a new application gets 409 (G-FP-22); ✗ a redirect loop (G-FP-8) |
| US-FP-C1 | Sign in with email or phone and a password | `signin/SignIn.tsx` | `POST /auth/login` | ✅ | Approved → dashboard; pending or rejected → `/status`; server errors are shown |
| US-FP-C2 | Reset a forgotten password with an OTP | `signin/ForgotPasswordModal.tsx` | `/auth/otp/*`, `/auth/forgot-password/reset` | ⚠️ | Three steps with a 60-second cooldown; ✗ other sessions are not revoked (G-FP-23); ✗ reveals whether a number has an account (G-FP-24) |
| US-FP-D1 | See my status, menu counts, prep time, radius and rating at a glance | `dash-index/DashHome.tsx` | `GET /me`, `/me/products`, `/support/tickets` | ⚠️ | Counts come from the server; ✗ stock photos and hard-coded name, ID, badge and copy (G-FP-7) |
| US-FP-E1 | Force the restaurant open or closed, and return it to its schedule | DashHome | `PATCH /me/availability` | ❌ | The choice persists; ✗ the UI loses all restaurant data after one tap (G-FP-5); ✗ there is no way back to "Schedule" (G-FP-6) |
| US-FP-F1 | Add or edit a dish with a photo, variants and add-ons | `product-id/ProductScreen.tsx`, `ProductForm` | `GET/POST/PATCH /me/products`, `/uploads/images` | ⚠️ | A new category can be typed; the image uploads first; ✗ no double-submit guard (G-FP-27); ✗ the "Sample" image button ships in production (G-FP-2) |
| US-FP-F2 | Delete a dish | ProductScreen | `DELETE /me/products/:id` | ✅ | Asks for confirmation, then returns to the menu |
| US-FP-F3 | Mark a dish out of stock during service | `dash-menu/DashMenu.tsx` | `PATCH /me/products/:id/availability` | ✅ | Updates immediately and rolls back on error |
| US-FP-F4 | Search and filter the menu | DashMenu | client-side | ✅ | Search, 3 status filters, category chips |
| US-FP-F5 | Rename and reorder categories | — | — | ❌ | No such screen |
| US-FP-G1 | Hear a loud alert and see a sheet the moment an order lands, on any tab | `_layout.tsx`, `services/orderPump.ts`, `orderSocket.ts`, `alertSound.ts`, `new-order/NewOrderScreen.tsx` | socket `order_placed` into `restaurant:<id>`, a 20-second poll, push | ⚠️ | The WAV plays in silent mode and the sheet opens once; ✗ add-ons are not shown (G-FP-4); ✗ a load failure reads as "no ticket" (G-FP-26); ✗ push registration probably fails (G-FP-19) |
| US-FP-G2 | See the order queue by state, with cancellations flagged | `dash-orders/DashOrders.tsx` | `GET /me/orders?status=`, socket `dispatch_update` | ⚠️ | The Live, New, Done and All tabs and the cancel banner work; ✗ `picked_up` orders appear only under All; ✗ add-ons and notes are missing |
| US-FP-H1 | Accept with a ready-in time, reject with a reason, then mark preparing and ready | DashOrders, NewOrderScreen | `PATCH /me/orders/:n/status` | ✅ | Only the moves `partnerMovesFor` allows are offered; the server's refusal is shown; reject requires a reason |
| US-FP-I1 | See the rider, their vehicle and the pickup code when the order is ready | DashOrders | `partnerView.rider`, `pickupCode` | ⚠️ | Searching, unassigned and assigned are shown; the code appears only at `ready`; ✗ a restaurant without a pin never gets a rider (G-FP-3); no tap-to-call the rider |
| US-FP-J1 | See past orders | DashOrders Done and All tabs | `GET /me/orders` (capped at 50) | ⚠️ | ✗ no pagination or date filter |
| US-FP-K1 | See what I'm owed and request a payout | `payouts-index/PayoutsScreen.tsx` | `GET /me/payouts`, `POST /me/payouts/request` | ✅ | The balance breakdown, the server's minimum, the history and refusal reasons are all shown |
| US-FP-L1 | Read diners' ratings and reviews | Only the DashHome tile | nothing writes `ratingAvg` | ❌ | No rating feature exists end to end |
| US-FP-M1 | See a notifications list | `dash-index/NotificationsModal.tsx` | tickets + orders + `/me` | ⚠️ | ✗ read state is kept locally only; ✗ tapping an item doesn't navigate (G-FP-31) |
| US-FP-M2 | Register this device for push and unregister it on sign-out | `_layout.tsx`, `partnerStore.signOut` | `POST/DELETE /me/devices` | ⚠️ | ✗ the EAS `projectId` is probably missing (G-FP-19) |
| US-FP-N1 | File, list, read and reply to support tickets, updated live | `support-index`, `support-new`, `support-reference` | `/api/v2/food-partners/support/*`, socket | ✅ | Categories come from the server; the unread badge uses `unread`; a closed ticket shows a notice |
| US-FP-O1 | View my verified details and edit the operational and presentation fields | `dash-profile/DashProfile.tsx` | `GET/PATCH /me` | ⚠️ | Description, cuisines, contact, prep time, radius and payment modes are editable; ✗ hours, fee, logo, cover and pin are not (G-FP-30); ✗ phone shows as "+91 +91…" (G-FP-29) |
| US-FP-P1 | Request, and cancel, deletion of my account | `delete-account/DeleteAccountScreen.tsx` | `GET/POST/DELETE /me/account-deletion` | ⚠️ | Status, date and cancel work; ✗ pending and rejected partners can't reach this screen (G-FP-25) |
| US-FP-Q1 | Sign out cleanly | DashProfile, `partnerStore.signOut` | `DELETE /me/devices` | ⚠️ | The socket closes; ✗ the token is not revoked; ✗ the store keeps the draft and status (G-FP-20) |
| US-FP-Q2 | Be told when my session expires | `SessionExpiredSheet`, `api.ts` | 401 codes | ✅ | A sheet appears and asks me to log out |

### 3.2 Gaps

| ID | Sev | Where | What happens | Fix |
|---|---|---|---|---|
| G-FP-1 | 🔴 Critical (security) | `BE/foodpartners/foodPartner.routes.js:118-125` (**verified**: no `requireVerifiedPhone` on `/applications`); `foodPartner.controller.js:620` checks only `if (req.verifiedPhone …)` | Anyone can register a restaurant on someone else's phone number. A direct POST with any `ownerPhone` and no Authorization header returns 201 plus a session, and the real owner is then refused with 409 `PHONE_IN_USE`. **Repro:** `curl -X POST …/api/v2/food-partners/applications` with a full body. | Put `requireVerifiedPhone` on the route (give Onboard its own staff route), or reject in the controller when no proof is present. |
| G-FP-2 | 🟠 High | `FP/components/common/templates/StepScaffold/index.tsx:95-102`, `FilePick/index.tsx:120-130`, `ImagePick/index.tsx:43,123-135`, `store/partnerStore.ts:337-462` | "Sample data" and "Use a sample" buttons ship in production, with no `__DEV__` gate. They attach a 1×1 JPEG as FSSAI, PAN or cheque, fill PAN `ABCDE1234F` and a fake bank account with `ifscVerified:true`, and set `otpVerified:true` without any proof. | Show them only under `__DEV__`. |
| G-FP-3 | 🟠 High | `FP/lib/gates.ts:19-32`; `BE/drivers/foodDispatch.service.js:456-457`; `PATCH /me` refuses `location` | The map pin is optional at onboarding and can't be set afterwards. Without a pin, dispatch never finds a rider and every order stays "unassigned" forever. | Require the pin in step 1, and add a "set pin" flow. |
| G-FP-4 | 🟠 High | `DashOrders.tsx:460-471`, `NewOrderScreen.tsx:185-202`, `services/foodPartner.ts:236-244` (no `addOns` in the type) vs `foodOrder.model.js:284,289` | The kitchen never sees the add-ons on an order line, and the order cards don't show the diner's note, so dishes are cooked wrong. | Show add-ons on both screens and the note on the cards. |
| G-FP-5 | 🟠 High | `DashHome.tsx:94-95` (`setMe(updated)`) vs `foodPartner.controller.js:1438-1444` (returns only `{openState,isCurrentlyOpen,restaurantId}`) | One Open/Closed tap replaces the restaurant with that 3-field object. An approved kitchen then sees "not approved yet", prep time and radius fall back to fake 25 and 6, and the name reverts to the fallback. | Merge the response into the existing object, or re-fetch `/me`. |
| G-FP-6 | 🟠 High | `DashHome.tsx:157-195, 210-212` | There is no "Schedule (auto)" option, so after one manual Open or Closed the kitchen stays pinned to it forever. | Add a third segment for the schedule. |
| G-FP-7 | 🟠 High | DashHome:114 reads `coverImageUrl` (doesn't exist) and shows a stock photo; 106-107 fall back to "Paradise Biryani House" / "FP-P5Y9DQ4B"; 123 always shows "Verified Partner"; 167-168 always show "Taking orders"; 252 and 266 fall back to `?? 25` / `?? 6`. DashProfile:144-145 has the same fallbacks; 174 uses the cover as the avatar; 185 always shows "Approved Kitchen"; 356 shows `gstinNumber \|\| "Verified ✓"` | Every kitchen sees fake data. | Use `logoImage.url`, gate the badges on `verificationStatus`, and remove the hard-coded values. |
| G-FP-8 | 🟠 High | `FP/app/_layout.tsx:111-117`, `orderPump.ts:322`, `Status.tsx:74-93` | Every 403 `ACCOUNT_REJECTED` calls `router.replace("/status")`. The order pump polls every 20 seconds, and Status calls `getMe` on mount, so this is a probable redirect/request loop (confirm on a device). | Skip the redirect when already on `/status`, and stop the order pump once the account is rejected. |
| G-FP-9 | 🟠 High (security) | `FP/store/partnerStore.ts:700, 702, 714, 619-641, 644-679` | `secureFields` lists `verificationToken`, but the store persists the proof as `phoneProof`, so it is never moved to the keychain. The onboarding password and the full account number sit in plain AsyncStorage and are never cleared. | Use `secureFields(["session","phoneProof"])`, exclude secrets via `partialize`, and clear them after submit. |
| G-FP-10 | 🟠 High | `StepDocuments.tsx:100-102`, `lib/gates.ts:73`, `services/uploads.ts:196-205` | An expired FSSAI licence doesn't block Next. The server refuses it at submit, after every image has uploaded, and a retry uploads them all again. | Block Next on an expired licence, and save the uploaded URLs so a retry reuses them. |
| G-FP-11 | 🟡 Med | `StepOperations.tsx:213-224`, `gates.ts:45` vs `foodCustomerOrder.controller.js:243-245` | A `distance_based` fee bills ₹0: the server reads only `fee.amount` and never uses `perKm`. | Collect a base amount, or hide this fee type. |
| G-FP-12 | 🟡 Med | `StepOperations.tsx:173-190`, `lib/money.ts:37-38`, `StepContract.tsx:98`, `Status.tsx:190` vs `foodCharges.util.js` | Minimum order and packaging charge are collected and shown as terms, but the server never charges either. | Remove both fields. |
| G-FP-13 | 🟡 Med | `constants/partner.ts:194-198`, `constants/contract.ts` clause 2 vs `COMMISSION_RATE = 15` (`foodCustomerOrder.controller.js:67`) | The contract never states the commission rate and says payouts are "weekly every Monday", but payouts are made on request. | Show 15% and describe the request-based payouts. |
| G-FP-14 | 🟡 Med | `constants/partner.ts:183-189` | The state list is missing J&K, Ladakh, Puducherry, Chandigarh, Lakshadweep, A&N and DNH&DD. | Add all union territories. |
| G-FP-15 | 🟡 Med | `onboarding-restaurant/organisms/LocationRow/index.tsx` | "Use my location" overwrites typed fields, against the repo rule that it only fills empty ones. The geocoded region may not match the state list. | Fill only empty fields, and map the region onto the list. |
| G-FP-16 | 🟡 Med | `StepMenu.tsx:293-295`, `services/foodPartner.ts:146-149` | Moving an item to another category in the onboarding editor is thrown away. | Move the item into the new category's list. |
| G-FP-17 | 🟡 Med | `services/foodPartner.ts:137` (`num(row.price) ?? 0`), `menuSheet.ts:92` | CSV rows with no price become ₹0 dishes, which skips the server's "unpriced" check. | Keep the price `null` so the server rejects the row. |
| G-FP-18 | 🟡 Med | `StepMenu.tsx:155-158`, `services/foodPartner.ts:122` | The copy says the team "checks the sheet", but only the file name is sent. | Upload the file. |
| G-FP-19 | 🟡 Med | `FP/services/orderAlerts.ts:103`, `app.config.js:114-116` (no `extra.eas.projectId`), `eas.json:11` | `getExpoPushTokenAsync()` without a `projectId` probably fails silently, so kitchens get no background alerts. The dev API is set to `localhost:5001`, which doesn't work on a physical phone. | Add the `projectId`, and use a LAN or tunnel URL for dev. |
| G-FP-20 | 🟡 Med | `partnerStore.ts:678`, `Pitch.tsx:43-44,95-105`, `Status.tsx:140-141` | Sign-out resets only `session`. A signed-out approved partner sees "Your application is with us", then a dashboard full of "signed out" errors. A second restaurant signing in on the same device sees the first one's draft. | Reset the whole store on sign-out. |
| G-FP-21 | 🟡 Med | `Status.tsx:174-181`, `partnerStore.ts:237-242` | "What you sent" shows the local draft or `INITIAL` defaults (5 days, 30 min, 5 km) instead of what the server holds. | Render it from `GET /me`. |
| G-FP-22 | 🟡 Med | `Status.tsx:204-231` | A rejected partner can only start a new application, which gets 409 because the phone or email is already in use. | Add a resubmit/edit route. |
| G-FP-23 | 🟡 Med (security) | `foodPartner.routes.js` (no logout route), `foodPartnerAuth.middleware.js:214-276`, `resetPassword` at `controller:1572` | Neither logout nor a password reset revokes existing tokens; old 7-day tokens stay valid. | Add a `sessionVersion` check to the guard. |
| G-FP-24 | 🟡 Med (security) | `foodPartner.controller.js:1547-1550` | The reset endpoint returns 404 `ACCOUNT_NOT_FOUND` before checking the OTP, so anyone can learn which numbers have accounts. | Check the OTP first, and answer the same way either way. |
| G-FP-25 | 🟡 Med (store compliance) | `DashProfile.tsx:392-398`, `app/index.tsx:18`, `foodPartnerAuth.middleware.js:256` | Account deletion is reachable only from the approved dashboard. Pending and rejected partners can't delete an account they created in the app. | Link it from Status, and let the deletion routes accept rejected partners. |
| G-FP-26 | 🟡 Med | `NewOrderScreen.tsx:135-145` | A failed fetch shows "No active ticket waiting" instead of an error. | Render the error outside the order branch. |
| G-FP-27 | 🟡 Med | `ProductScreen.tsx:115-142`, `ProductForm:241` | Saving has no busy guard, so a double tap creates two dishes. | Disable Save while the request is in flight. |
| G-FP-28 | 🟡 Med | `DashProfile.tsx:107-108` | Empty or invalid prep time and radius are silently replaced with 25 and 6. | Validate the input and show an error. |
| G-FP-29 | 🟡 Med | `DashProfile.tsx:209` | The phone shows as "+91 +91XXXXXXXXXX" because the stored value is already E.164. | Format the stored number without adding "+91". |
| G-FP-30 | 🟡 Med | `DashProfile.tsx:50-55` | `openingHours`, `deliveryFee`, logo, cover and `openState:auto` can't be edited after onboarding. | Add editors for these fields. |
| G-FP-31 | 🟡 Med | `NotificationsModal.tsx:68-76, 89-106, 145-169`, `DashHome.tsx:69-74` | Order read state is kept locally only; the badge count and the list count differ; tapping an item doesn't navigate; "Verified & Live" is shown even when `isActive:false`, with a fake "Just now". | Persist read state, use one count, navigate on tap, and gate "Verified & Live" on `isActive`. |
| G-FP-32 | ⚪ Low | `NewOrderScreen.tsx:96, 115` | The sheet highlights a default ready time that `accept` never sends. | Send the highlighted value, or don't highlight one. |
| G-FP-33 | ⚪ Low | `StepMenu.tsx:206-210`, `NewOrderScreen.tsx:186`, `DashMenu.tsx:266-272` | Egg dishes are drawn with the non-veg (red) mark. | Give egg its own mark. |
| G-FP-34 | ⚪ Low | `DashOrders.tsx:43-52, 421-429` | `picked_up`, `rejected` and `cancelled` orders appear only under All; the empty-state copy doesn't depend on the tab; no pagination beyond 50. | Put each status on a tab, write per-tab empty copy, and paginate. |
| G-FP-35 | ⚪ Low | `DashHome.tsx:139` and the other list screens | Pull-to-refresh spinners stop immediately because `loading` is never set back to true. | Set `loading` to true at the start of each refresh. |
| G-FP-36 | ⚪ Low | `DashHome.tsx:157-164, 246-305` | Tiles show chevrons but can't be pressed; two tiles show the same `avgPreparationTime`; the status "dropdown" is fake. | Make the tiles pressable or drop the chevrons; remove the duplicate; build or remove the dropdown. |
| G-FP-37 | ⚪ Low | `NewSupportRequest.tsx:171` | The order-number placeholder is "LMP-2481", but real numbers look like `LO123456`. | Change the placeholder. |
| G-FP-38 | ⚪ Low | `NewSupportRequest.tsx:136` | If loading categories fails, the whole support form is hidden. | Show an error with a retry. |
| G-FP-39 | ⚪ Low | `NotFound.tsx:18-29` | The not-found screen lists every route in production, and `(dash)` has no guard. | Hide the route list in production, and guard `(dash)`. |
| G-FP-40 | ⚪ Low | `StepRestaurant.tsx:9-11` | A stale comment says SMS is not wired up. | Update the comment. |
| G-FP-41 | ⚪ Low | `StepMenu.tsx:191-195` | Removing a category deletes its items without confirmation, and duplicate category names are allowed. | Confirm before deleting, and reject duplicate names. |
| G-FP-42 | ⚪ Low | `gates.ts:23` | Email is only checked for an `@`; there is no PAN, GSTIN or IFSC format check. | Add format checks. |
| G-FP-43 | ⚪ Low | `DashProfile.tsx:402` | The sign-out modal has no `onRequestClose`, so the Android back button does nothing. | Add `onRequestClose`. |
| G-FP-44 | ⚪ Low | `orderAlerts.ts:46` | While the app is open, a push (`shouldPlaySound:true`) and the socket WAV can both ring for the same order. | Mute the push sound while the app is in the foreground. |
| G-FP-45 | ⚪ Low | `orderPump.ts:340-345` | The first poll only records orders; with the socket down, an order placed in the first ~20 s never rings. | Ring for placed orders found on the first poll. |
| G-FP-46 | ⚪ Low | `DashMenu.tsx:319-324` | Availability switches aren't disabled while saving, and a stale category chip stays selected after its category is gone. | Disable the switch while saving, and reset the chip. |
| G-FP-47 | ⚪ Low | `DashHome.tsx:9,17,18,44`, `app/(dash)/_layout.tsx:9-18,34-35` | Unused imports and styles. | Delete them. |

### 3.3 Food-Partner items from the previous audit

| Prior # | Now |
|---|---|
| #2 Fake data on DashProfile | **Fixed for every field it listed.** New fake data is tracked in G-FP-7 and G-FP-29, and DashHome still reads `coverImageUrl`. |
| #3 `hasUnreadReply` / the hard-coded 2 | **Fixed** |
| #4 `products.length \|\| 7` | **Fixed** |
| #5 No payouts screen | **Fixed** (`app/payouts.tsx`) |
| #6 A rejected partner lands on the dashboard | **Fixed**, but it regressed into the redirect loop in G-FP-8 |
| #20 New category | **Fixed on the dashboard, still broken in onboarding** (G-FP-16) |
| #21 Fake IFSC verification | **Fixed** (the copy changed); the sample button still fakes it |
| #22 Fields that can't be edited | **Partly fixed** (G-FP-6, G-FP-30) |
| "Logout is correct in all four apps" | **Not true** for Food-Partner (G-FP-9, G-FP-23) |


---

## 4. Driver app (`driver/`)

Read every file under `driver/app`, `components`, `hooks`, `services`, `store`, `utils` and `constants`, and traced each call into `Backend/src/modules/drivers/*`, `foodpartners/foodOrder.model.js`, `support/*` and `accountDeletion/*`. The typecheck was not run because `driver/node_modules` is not installed.

### 4.1 User stories

#### A. Phone OTP sign-in
**US-DR-A1 ⚠️:** As a rider, I want to sign in or sign up with my phone number and an SMS code, so I don't need a password.
- **Files:** `app/auth.tsx`, `store/driverStore.ts:639-683`
- **Endpoints:** `POST /api/v2/drivers/auth/start`, `/auth/resend`, `/auth/verify` (public, rate-limited by IP and by phone)
- **Acceptance criteria:**
  - [x] "Send OTP" is enabled only for a 10-digit number starting with 6–9.
  - [x] A 60-second resend cooldown shows, and the server's 429 errors (`OTP_COOLDOWN`, `OTP_TOO_MANY_RESENDS`) are shown in the server's words.
  - [x] A wrong, expired or locked code shows the server's message. There is no separate screen for a locked or expired code.
  - [x] After verifying, I land on `/onboarding` if I haven't finished onboarding, otherwise on the tabs (`auth.tsx:220`).
  - [ ] ❌ SMS autofill and pasting a code work (G-DR-21).

#### B. Onboarding (profile, vehicle, documents, bank, address)
**US-DR-B1 ⚠️:** As a rider, I want a step-by-step sign-up that saves each step, so a dead battery doesn't lose my progress.
- **Files:** `app/onboarding.tsx`
- **Endpoints:** `PATCH /me`, `POST /me/uploads/images`, `POST /me/documents`
- **Acceptance criteria:**
  - [x] Each step saves with a PATCH before moving on, and sign-up resumes at the server's `onboarding.step`.
  - [x] The server works out `hasCompletedOnboarding` itself; if anything is missing it answers `ONBOARDING_INCOMPLETE` with the list.
  - [ ] ❌ After "Submit for review" I can reach the home screen (G-DR-3).

**US-DR-B2 ⚠️:** As a rider, I want to enter my name, date of birth, city, email, photo and home address, with a "use my location" button.
- **Files:** `onboarding.tsx` (personal step), `profile-details.tsx`, `services/locateMe.ts`
- **Acceptance criteria:**
  - [x] The server enforces the age check (18 or older) and the email format.
  - [x] "Use my location" fills only empty fields, and the pin is kept separately.
  - [ ] ❌ A pin on its own can be saved (G-DR-26).
  - [ ] ❌ The address can be cleared (G-DR-27).

**US-DR-B3 ✅:** As a rider, I want to record my vehicle type, number plate and model; a bicycle needs no plate.
- **Files:** `onboarding.tsx` (vehicle step), `app/vehicle.tsx`
- **Endpoint:** `PATCH /me` with `vehicle`
- **Note:** the server defaults `vehicle.type` to `'bike'`, so "Motorcycle" is already selected for a new rider (`driver.model.js:233`).

**US-DR-B4 ⚠️:** As a rider, I want to upload front and back photos plus the number for my licence, RC and Aadhaar (PAN and insurance are optional).
- **Files:** `onboarding.tsx` (documents step), `app/documents.tsx`
- **Endpoints:** `POST /me/uploads/images`, `POST /me/documents`
- **Acceptance criteria:**
  - [x] A photo is submitted as soon as it finishes uploading.
  - [x] The document number is saved when the field loses focus.
  - [ ] ❌ I can take the photo with the camera. Only the photo library is offered (`onboarding.tsx:413-430`, `documents.tsx:63-74`).
  - [ ] ❌ I can enter the expiry date. The app never sends `expiresAt`, although the server accepts it.

**US-DR-B5 ⚠️:** As a rider, I want to give a bank account or UPI ID so I can be paid.
- **Files:** `onboarding.tsx` (bank step), `app/bank-details.tsx`
- **Endpoint:** `PATCH /me` with `payout`
- **Acceptance criteria:**
  - [x] The server validates the IFSC, the UPI ID and a 9–18 digit account number.
  - [x] The server returns only the last 4 digits of the account number.
  - [ ] ❌ Onboarding asks me to confirm the account number (G-DR-24). `bank-details.tsx` already does.

#### C. A refused document and a retake
**US-DR-C1 ✅:** As a rider, I want to see which document was refused and why, and replace just that photo.
- **Files:** `documents.tsx:130-137, 196-202`, `onboarding.tsx:923-929`, the home screen's "Retake your documents" button (`index.tsx:649-657`)
- **Acceptance criteria:**
  - [x] The approver's reason is shown word for word.
  - [x] Resubmitting sets the document back to pending and clears the reason.
  - [ ] ❌ The screen refreshes when I open the app from the decision push (G-DR-9, G-DR-10).

#### D. Pending, rejected and suspended accounts
**US-DR-D1 ⚠️:** As a pending rider, I want to understand why I can't go online and what to do next.
- **Files:** `index.tsx:182-184, 571-579, 649-674`
- **Endpoint:** `GET /me` (`canGoOnline`, `blockedReason`)
- **Acceptance criteria:**
  - [x] A locked notice shows the server's own sentence.
  - [ ] ❌ The button matches the reason I'm blocked (G-DR-13).
  - [ ] ❌ Earnings and Orders don't show error banners (G-DR-14).

**US-DR-D2 ⚠️:** As a suspended rider, I want to see why and reach support.
- **Files:** `app/suspended.tsx`, `_layout.tsx:122, 229-231`
- **Acceptance criteria:**
  - [x] A suspension found at cold start opens this screen.
  - [ ] ❌ A suspension during a shift is detected (G-DR-9).
  - [ ] ❌ The screen uses `GET /me/standing` (G-DR-30).

**US-DR-D3 ⚠️:** As a rejected rider, I want to see the rejection reason. Today it appears only as the `blockedReason` text; there is no dedicated screen, and the button sends me to onboarding (`index.tsx:666-674`).

#### E. Duty on and off
**US-DR-E1 ⚠️:** As a rider, I want to go online and offline, with the server deciding, and to see a refusal when it says no.
- **Files:** `index.tsx:214-292`, `driverStore.ts:876-917`
- **Endpoint:** `POST /me/duty`
- **Acceptance criteria:**
  - [x] The switch waits for the server; it doesn't flip optimistically.
  - [ ] ❌ A refusal (`ON_A_DELIVERY`, `NOT_APPROVED`) is visible to me (G-DR-11).
  - [x] The `dutyNote` about location appears, and clears on the first accepted location fix.

**US-DR-E2 ⚠️:** As an online rider, I want my position reported so the dispatcher can match me with orders.
- **Endpoint:** `PATCH /me/location` (every 15 seconds)
- **Acceptance criteria:**
  - [x] The 15-second report runs while the app is in the foreground.
  - [x] A warning appears after 5 minutes without a report.
  - [ ] ❌ Reports continue with the phone locked (G-DR-2).

#### F. Offers, alert tone and timeout
**US-DR-F1 ⚠️:** As a rider, I want an offer to reach me instantly, through the socket or the 4-second poll, with a loud tone.
- **Files:** `driverStore.ts:1001-1044, 1396-1480`, `services/alertSound.ts`, `services/offerAlerts.ts`, `index.tsx:159-161`
- **Delivery channels:** socket `delivery_offer` and `delivery_offer_closed`; `GET /me/offer`; push on the `delivery-offers` channel
- **Acceptance criteria:**
  - [x] Each order number counts once, so the tone plays once.
  - [ ] ❌ The poll keeps working after a failed accept (G-DR-5).
  - [ ] ❌ Tapping the push opens the offer (G-DR-10).
- **Timeout:** there is no longer a 15-second timeout. Dispatch now broadcasts to every rider in range, and the offer stays open until someone takes it (`request.tsx:10-40`, `foodDispatch.service.js:850-871`).

**US-DR-F2 ⚠️:** As a rider, I want to see before accepting what I'll earn, the restaurant and its address, the pickup distance and ETA, the drop address and distance, the items and any cash to collect.
- **Acceptance criteria:**
  - [x] "Ready by" is shown.
  - [ ] ❌ The pickup ETA is shown (G-DR-6).
  - [x] The customer's name and phone stay hidden until I accept.

#### G. Accept and decline
**US-DR-G1 ⚠️:** As a rider, I want to accept an offer and have the server settle races.
- **Endpoint:** `POST /orders/:n/accept` (an atomic claim; errors are `TAKEN`, `ORDER_CLOSED` or `OFFER_EXPIRED`)
- **Acceptance criteria:**
  - [x] The server's message appears in a toast.
  - [ ] ❌ A failed accept clears the offer from the screen (G-DR-5).
  - [ ] ⚠️ Background tracking starts, but it stops itself straight away (G-DR-1).

**US-DR-G2 ✅:** As a rider, I want to decline an offer. `POST /orders/:n/decline` always succeeds, and the offer is cleared on the phone first.

#### H to K. Pickup, delivery and completion
**US-DR-H1 ⚠️:** As a rider, I want a real road route to the kitchen and a way to open turn-by-turn navigation.
- [x] The map draws the road route.
- [ ] ❌ A button hands off to Google Maps or another maps app (G-DR-15).
- [x] I can call the kitchen.

**US-DR-I1 ⚠️:** As a rider, once the kitchen marks the order ready, I want to enter the kitchen's 4-digit code to mark it collected.
- **Endpoint:** `PATCH /orders/:n/status` with `{status:"picked_up", code}`
- **Acceptance criteria:**
  - [x] The button is disabled until the order is `ready`.
  - [x] A wrong code shows the server's message.
  - [ ] ❌ The code is a real check. The API sends the code to the rider (G-DR-4).
  - [ ] ⚠️ The stage label reflects where I am (G-DR-16).

**US-DR-J1 ⚠️:** As a rider, after pickup I want the map to switch to the drop point and my position relayed to the diner. This works only while the app is in the foreground (G-DR-1).

**US-DR-K1 ✅:** As a rider, I want to enter the customer's PIN to complete the delivery and see what I earned.
- **Endpoint:** `PATCH …/status` with `delivered`
- **Acceptance criteria:**
  - [x] `delivery.earnings` is shown.
  - [ ] ⚠️ Order history doesn't get a duplicate row (G-DR-7).

**US-DR-K2 ✅:** As a rider, I want to give a job back before pickup (`/release`, which fails with `ALREADY_COLLECTED` after pickup) or report a problem at the counter as a support ticket.

#### L. Cash on delivery
**US-DR-L1 ⚠️:** As a rider, I want to know I must collect cash and how much.
- [x] `collectAmount` is shown on the offer, the job and the home screen.
- [ ] ❌ Something confirms that the cash was received. Today the PIN alone marks the order `paid` (G-DR-17).
- [ ] ❌ I can see how much cash I'm holding.

#### M. Earnings and history
**US-DR-M1 ⚠️:** As a rider, I want my earnings for Today, Week and Month, plus a 7-day chart. `monthTrips` is fixed; day boundaries depend on the server's timezone (G-DR-18), and pending riders see an error (G-DR-14).

**US-DR-M2 ⚠️:** As a rider, I want my order history with Active, Completed and Cancelled tabs, "Load more" and a detail page. There is no refresh when the tab comes back into focus and no pull-to-refresh (G-DR-7, G-DR-8).

**US-DR-M3 ❌:** As a rider, I want to know when and how I get paid. The app's copy contradicts itself, and no payout system for riders exists (G-DR-19).

#### N to R. Push, support, profile, deletion, logout
**US-DR-N1 ⚠️:** As a rider, I want offer, approval, document and suspension pushes to take me to the right screen.
- [x] The device is registered at every cold start and at login.
- [ ] ❌ Tapping a push opens the right screen (G-DR-10).
- [ ] ❌ The bell button shows my notifications. Today it is fake (G-DR-20).

**US-DR-O1 ✅:** As a rider, I want support tickets by category, live chat and unread markers, even while I'm suspended. Categories come from the server.

**US-DR-P1 ⚠️:** As a rider, I want to view and edit my personal, vehicle, document and bank details. The profile has a fake ID fallback, a mislabelled count (G-DR-22) and never shows the uploaded photo (G-DR-28).

**US-DR-Q1 ✅:** As a rider, I want to request account deletion in the app, with a grace period and the option to cancel. A suspended rider gets a 403 here and can only use the website.

**US-DR-R1 ⚠️:** As a rider, I want to log out safely. Logout doesn't switch duty off, doesn't revoke the token and is allowed mid-delivery (G-DR-12).

### 4.2 Gaps

| ID | Sev | Where | What happens | Fix |
|---|---|---|---|---|
| G-DR-1 | 🔴 Critical | `services/backgroundLocation.ts:62-76, 90-103` vs `services/secureStore.ts:183-195`, `store/driverStore.ts:1343` | The background task reads the token from the AsyncStorage blob `driver-store`. On a real device that token was moved to SecureStore, so the task sees `null` and calls `stopDeliveryTracking()` on its first batch. Once the phone is pocketed the rider's position stops updating and the diner's map freezes. After `GONE_DARK_MS` (10 min, `foodDispatch.service.js:919, 993-1010`) the server takes the order back ("The rider stopped responding") while the rider is riding to the counter. **Repro:** accept an order, lock the phone, ride for 10+ minutes, then check `food_orders.delivery.driverId`. | Read the token with `getSecret("driver-store.token")`, which works in a headless task. |
| G-DR-2 | 🟠 High | `index.tsx:144-153`, `driverStore.ts:1067, 1159`, `backgroundLocation.ts:100`, `driverMatch.service.js:92-98` | An online rider waiting for orders with the screen off stops reporting position (the 15-second report is a foreground JS interval, and background tracking only runs while carrying a job). After 5 minutes (`LOCATION_MAX_AGE_MS`) they are left out of every search while still showing "online". | Run the foreground location service for the whole time the rider is on duty (this depends on G-DR-1). |
| G-DR-3 | 🟠 High | `onboarding.tsx:394-406, 500, 824-848`; the comment there contradicts `_layout.tsx:122-123` | After "Submit for review", and even after approval ("Go online from the home screen"), the Done step has no button to the home screen, the top bar is hidden, and there is nothing to go back to. The rider must kill and relaunch the app. | Add a "Go to home" button that calls `router.replace("/(tabs)")`. |
| G-DR-4 | 🟠 High (security) | `Backend/src/modules/foodpartners/foodOrder.model.js:1011`; returned by `driverOrder.controller.js:179-185, 249-252, 431-438`; checked at `:299-312` | The kitchen's pickup code, which is meant to prove the rider is at the counter, is included in every accepted-job payload sent to the rider. Anyone with a proxy can mark an order collected without being there. | Remove `pickupCode` from `riderView`. |
| G-DR-5 | 🟠 High | `driverStore.ts:1046-1072, 1031-1034`, `request.tsx:86-93` | When an accept fails ("Another rider took this one"), `offer` is never cleared, and `pollOffer` returns early whenever an offer is held. With the socket down, the rider never receives another offer. | Clear `offer` when the accept fails. |
| G-DR-6 | 🟡 Med | Server `foodDispatch.service.js:312, 868` (sends `etaMinutes` at the top level) vs app `driverStore.ts:98, 1540-1543` (reads `pickup.etaMinutes`) | The pickup ETA is never shown on the offer screen (`request.tsx:147, 195`). | Read `offer.etaMinutes`. |
| G-DR-7 | 🟡 Med | `driverStore.ts:1197-1199, 1416-1428, 1229`, `orders.tsx:73-75` | After delivery the job is added to history again without removing the old copy, which leaves a duplicate key and a phantom "With you" row. Cancelling or releasing doesn't update the history either. | Update the history row by `orderNumber`, and reload the list with `useFocusEffect`. |
| G-DR-8 | 🟡 Med | `orders.tsx:119` vs `order-detail.tsx:74-75` | The order detail says "Pull to refresh on the Orders tab", but that tab has no `RefreshControl`. | Add a `RefreshControl` to the Orders tab. |
| G-DR-9 | 🟡 Med | `utils/api.ts:89`; errors swallowed at `driverStore.ts:969, 1040, 1161`; `_layout.tsx:183-193` | A 403 `ACCOUNT_SUSPENDED` is ignored during the session, and the profile is only re-read at cold start. A rider suspended mid-shift keeps seeing "Waiting for orders", and a rider approved while the app is open stays locked. | Handle `ACCOUNT_SUSPENDED` centrally, and re-read the profile when the app returns to the foreground (AppState `active`). |
| G-DR-10 | 🟡 Med | No `addNotificationResponseReceivedListener` anywhere in `driver/`; the push `kind` values are sent from `dispatch.notifier.js:119,146` and `driverAccount.notifier.js:182,235` | Tapping an approval, document or suspension push does nothing: no navigation and no profile refresh. There is also no push-token rotation listener. | Add a tap handler that routes by `kind`, and re-read the profile. |
| G-DR-11 | 🟡 Med | `index.tsx:218-234, 281-290, 1204` (the overlay, `zIndex 9999`) vs toast `Sheet.tsx:166` (`zIndex 9`) | Tapping Go Offline while carrying a job gets a 409 `ON_A_DELIVERY`, but the rider sees "Going Offline… Rest well" and the error toast expires hidden underneath. | Close the overlay when the call fails. |
| G-DR-12 | 🟡 Med | `useSheet.ts:200-203`, `driverStore.ts:819-862`, `driverAuth.middleware.js` | Logout is allowed mid-delivery and leaves the job assigned. `isOnline` stays true on the server. There is no token revocation (`SESSION_REVOKED` in `api.ts:25` is never sent by the server). | Refuse logout while a job is held, call duty-off before logging out, and add a revocation endpoint. |
| G-DR-13 | 🟡 Med | `index.tsx:666-674` | "Finish your profile" also appears for a rider who has finished and is only waiting for review. | Show it only when `!hasCompletedOnboarding`. |
| G-DR-14 | 🟡 Med | `driver.routes.js:202, 218-219` (`requireApprovedDriver`) vs `earnings.tsx:67-81`, `orders.tsx:127-132` | Pending and rejected riders see "We could not load your earnings/orders", with an `APPROVAL_PENDING` message. | Skip those calls when the rider isn't approved. |
| G-DR-15 | 🟡 Med | App-wide: `constants/lampose.ts:63-69` (`STAGE_CTAS` unused), `MapPanel.tsx:346-348`, `index.tsx:498-507` | There is no hand-off to Google Maps turn-by-turn navigation. The "Navigate" button only re-centres the map. | Add a `google.navigation:q=lat,lng` or `maps:` deep link. |
| G-DR-16 | 🟡 Med | `driverStore.ts:1503-1515` | The stage label follows the kitchen's status, not where the rider is: "Arrived at restaurant" shows while the rider is 5 km away, and "Accepted" can never be reached. | Base the stage on the rider's distance to the restaurant, or on an "arrived" tap. |
| G-DR-17 | 🟡 Med | `driverOrder.controller.js:323-330`, `active.tsx:358-394` | For cash on delivery, the PIN alone marks the order `paid`. Nothing confirms the cash was received, and the rider has no record of cash in hand. | Add a "Cash received" step and a cash ledger. |
| G-DR-18 | 🟡 Med | `driver.controller.js:812, 839`, `earnings.tsx:32` | "Today" is cut at the server's midnight. With the server on UTC, the day resets at 05:30 IST and chart bars carry the wrong labels. | Compute day boundaries in Asia/Kolkata. |
| G-DR-19 | 🟡 Med | `auth.tsx:373`, `onboarding.tsx:713`, `earnings.tsx:191-194`, `services/support.ts:90` | The app says "Instant weekly payouts", "paid every Monday" and "settles weekly", but no rider payout system exists (`constants/lampose.ts:155-169` says so). | Remove the claims, or build rider payouts. |
| G-DR-20 | 🟡 Med | `index.tsx:415-422` | The bell always shows "No new notifications". | Build a notifications list, or remove the bell. |
| G-DR-21 | ⚪ Low | `auth.tsx:480-496, 178` | There is no `textContentType="oneTimeCode"` or `autoComplete="sms-otp"`, and pasting a 6-digit code keeps only the last digit. | Add autofill; spread a pasted code across the boxes. |
| G-DR-22 | ⚪ Low | `profile.tsx:77, 70` | The profile falls back to a hard-coded ID `DR-285792FE`. "N delivered" actually counts every loaded history row, including cancelled and active ones. | Remove the fallback ID; count only delivered orders. |
| G-DR-23 | ⚪ Low | `index.tsx:341, 524, 677-695, 470, 731, 523` | The rating always shows "—"; the promo has fake carousel dots; the chevron on the location pill does nothing; "24x7 support" is claimed; the home screen still says "Online Time" while Earnings says "Current session". | Remove or build each placeholder, and use one label. |
| G-DR-24 | ⚪ Low-Med | `onboarding.tsx:728-746` vs `bank-details.tsx:157-159` | The bank step in onboarding has no "confirm account number" field and doesn't collect the bank name. | Add the confirmation field and the bank name. |
| G-DR-25 | ⚪ Low | `components/ui/Form.tsx:234-236`, `onboarding.tsx:181, 216` | The date field keeps its own state from mount, so a date of birth loaded afterwards shows empty, and typing one digit wipes it. A single-digit day ("5") is refused. | Re-sync the field when its value changes; accept single-digit days. |
| G-DR-26 | ⚪ Low | `profile-details.tsx:85-93` | Capturing only a pin doesn't mark the form as changed, so Save stays disabled. | Include the pin in the change check. |
| G-DR-27 | ⚪ Low | `profile-details.tsx:169-180`, `onboarding.tsx:301-314` | The app never sends `address:null`, so the address can't be removed, although the server supports it. | Send `address:null` when all address fields are cleared. |
| G-DR-28 | ⚪ Low | `primitives.tsx:523-541` | The avatar only ever shows initials, never the uploaded photo. | Show the photo when one exists. |
| G-DR-29 | ⚪ Low | `MapPanel.tsx:85, 449-457, 734-743, 708-713` | A route is re-requested only when 20 s AND 60 m have both passed (the comment says whichever comes first); the camera re-fits on every location fix, undoing the rider's panning; there is a zoom-in button but no zoom-out; the pulse ring drifts off the rider after panning; there are no accessibility roles. | Match the code to the comment; stop re-fitting on every fix; add zoom-out; anchor the ring to the rider; add roles. |
| G-DR-30 | ⚪ Low | `driver.routes.js:157` vs `suspended.tsx:40-43` | The app never calls `GET /me/standing`, and its comment says the backend fix hasn't been made. | Call `GET /me/standing` from the suspended screen. |
| G-DR-31 | ⚪ Low (dead code) | `useSheet.ts:90-129`, `flowStore.ts:37,57,65`, chat state in `driverStore.ts:531-533, 591-594, 1322-1335`, `utils/chatMessages.ts`, `utils/format.ts`, the onboarding Welcome panel (`:789-805, 857-883`) | These are unreachable sheets containing fabricated copy ("error 503"), unused chat state and an unreachable Welcome panel. | Delete. |
| G-DR-32 | ⚪ Low (Play policy) | `backgroundLocation.ts:165-168` | Background location permission is requested straight from Accept, without the prominent in-app disclosure Google Play requires. | Show the disclosure sheet before requesting. |
| G-DR-33 | ⚪ Low | `auth.tsx:453-457`, `onboarding.tsx:698-704, 347-355` | The Terms and Privacy "links" are plain text; onboarding says "Pull down…" but has no refresh; "Continue" goes ahead when the document checklist is empty. | Make the links open the pages; add a refresh control; block Continue until documents are uploaded. |
| G-DR-34 | ⚪ Low | `Sheet.tsx:115` | The toast always shows a success tick, even for errors. | Pick the icon by message type. |
| G-DR-35 | ⚪ Low | `offerAlerts.ts:67`, `app.config.js:76-88` | Users can see a stale "Expires in 15 seconds" on the Android notification channel; the config comment says no background task is defined, which is no longer true. | Update the channel description and the comment. |
| G-DR-36 | ⚪ Low | `onboarding.tsx:556, 878, 114` | "Rajahmundry" is hard-coded; the Aadhaar hint says "voter ID or passport works". | Remove the city; make the hint match the server's "Aadhaar card". |
| G-DR-37 | ⚪ Low | `utils/socketService.ts:56-58`, `index.tsx:159-161` | The socket `unauthorised` event isn't handled; ticket rooms aren't re-joined after a reconnect; the home screen pushes a second `/request` when a new offer replaces the current one. | Handle `unauthorised`; re-join ticket rooms on reconnect; replace the route instead of pushing. |
| G-DR-38 | ⚪ Low | `android/app/src/main/AndroidManifest.xml:55-56` | The app declares `RECORD_AUDIO` and `SYSTEM_ALERT_WINDOW`, which it doesn't need; both affect the Play data-safety form. | Remove both permissions. |

### 4.3 Driver items from the previous audit (`CROSS_APP_AUDIT_FINDINGS.md`)

| Prior # | Finding | Now |
|---|---|---|
| 1 | New riders can never finish sign-up | **Fixed, one gap left.** `auth.tsx:220` now routes by `hasCompletedOnboarding`, and `onboarding` is a protected route. The rider still gets stuck on the Done step (G-DR-3). |
| 10 | Earnings "Month" / `onlineMinutes` | **Mostly fixed.** The home screen still says "Online Time"; timezone issue in G-DR-18. |
| 11 | History: no loading, no pagination | **Fixed.** New issues in G-DR-7 and G-DR-8. |
| 12 | Pending notice gives no way forward | **Fixed.** The button is wrong in one case (G-DR-13). |
| — | "Logout is correct in all four apps" | **Not true for the driver app** (G-DR-12). |
| — | Docs mention a 15-second countdown | **Partly open.** The Android channel text is stale (G-DR-35). |


---

## 5. Cross-app: the food order loop (User App ↔ Food-Partner ↔ driver)

**Path prefixes used below:**

| Prefix | Folder |
|---|---|
| `BE/` | `Backend/src/` |
| `UA/` | `User App/` |
| `FP/` | `Food-Partner/` |
| `DR/` | `driver/` |

**Headline:** the happy path works across all three apps. The serious problems are at the edges:

- An order that no rider takes after the kitchen has started cooking has no way out.
- Marking an order ready silently kills every open rider offer.
- Neither hand-over code proves anything.
- A payment can land on an order the diner has already cancelled.
- There is no rider payout, no record of the cash a rider collects, and no ratings.

### 5.0 The docs no longer match the code (testers: plan against the code)

These three statements in `Backend/README.md` (lines 386–403) and `CLAUDE.md` are out of date:

1. **"For a cash order the dispatcher starts at placement."** In the code, dispatch starts only when the kitchen accepts (`BE/modules/foodpartners/foodCustomerOrder.controller.js:356-360`, `foodOrder.controller.js:332-334`).
2. **"ONE offer at a time, nearest first, 15 s each, 2→5→10 km."** In the code, the offer is broadcast to every rider in range at once, with no per-rider timeout. The radius comes from the kitchen's prep time and is widened twice (`foodDispatch.service.js` header, lines 1–95).
3. **The README says the map has no street tiles.** It is now a Google Map.

Also stale: `dispatch.notifier.js:40` still says "an offer expires in fifteen seconds".

### 5.1 Cross-app user stories

Status key: ✅ works · ⚠️ works with a known gap · ❌ missing.

#### S1 ✅ A diner places a cash order and the kitchen hears it
Gaps: G-FL-11, G-FL-12, G-FL-13, G-FL-19.

- **User story:** As a diner, when I place a cash order, the kitchen is alerted within a second, so my food starts on time.
- **Flow:**
  1. The diner taps pay (`UA/app/food/payment.tsx:152-155`). `placeOrder` in `UA/context/FoodContext.tsx` sends `POST /api/v2/food-partners/orders`.
  2. `placeOrder` (`foodCustomerOrder.controller.js:86-374`) calls `notifyRestaurantOfOrder`.
  3. That sends the socket event `order_placed` to room `restaurant:<id>` (`foodOrder.notifier.js:204-215`), then a push on channel `food-orders` (266-275), then a WhatsApp (241-244).
  4. The kitchen app's `FP/services/orderPump.ts` plays the tone (`alertSound.ts`). A 20-second poll is the fallback.
- **Acceptance criteria:**
  - **Kitchen, socket up:** the tone plays in under 1 second and the order shows "New" under Live.
  - **Kitchen, socket down:** the tone plays within 20 seconds.
  - **Kitchen, app in background:** a push arrives.
  - **Diner:** the app goes to `/food/order/<n>?placed=1` and shows "Cash on delivery".
  - **Rider:** nothing happens until the kitchen accepts.

#### S2 ✅ A diner pays online, and the kitchen sees the order only once it's paid
Gaps: G-FL-5, G-FL-6.

- **User story:** As a diner paying online, the kitchen sees my order only after my payment is confirmed, so nobody cooks an unpaid order.
- **Flow:**
  1. `payment.tsx:163-171` calls `startPayment`, then opens the WebView `UA/app/pay/checkout.tsx`, which loads `GET /food-partners/checkout?t=`.
  2. `checkoutCallback` (`foodPayment.controller.js:448`) verifies the signature, then calls `confirmPayment` (107), which runs the S1 alert.
  3. The webhook `handleFoodOrderWebhook` (507) is the fallback if the redirect doesn't happen.
  4. `visibleToKitchen` (`foodOrder.controller.js:69-75`) hides unpaid online orders from the kitchen.
- **Acceptance criteria:**
  - **Kitchen:** sees nothing until the payment is verified, then behaves exactly as in S1.
  - **Diner:** "Paid online" shows after the redirect. If the diner backs out, the app shows "waiting to be paid for" with a **Pay now** button.

#### S3 ⚠️ A diner abandons checkout or the payment fails
Gaps: G-FL-5, G-FL-6, G-FL-7, G-FL-20.

- **User story:** As a diner whose payment didn't complete, I can pay again later, and my order doesn't hang around forever.
- **Acceptance criteria:**
  - **Diner:** sees "Payment not completed" and a **Pay now** button that reuses the same Razorpay order.
  - **Kitchen and rider:** see nothing.
- **Gaps:**
  - Nothing ever expires the held order.
  - `failed` is never written.
  - A payment captured after the diner cancels still rings the kitchen.

#### S4 ✅ The kitchen accepts and riders get the offer
Gaps: G-FL-9, G-FL-10, G-FL-21.

- **User story:** As a kitchen, when I accept an order with a prep time, nearby riders are offered the delivery straight away.
- **Flow:**
  1. The kitchen accepts (`DashOrders.tsx:339-342`, `setOrderStatus('accepted',{promisedMinutes})`).
  2. `foodOrder.controller.js:332-334` calls `startDispatch` (`foodDispatch.service.js:423`), which calls `broadcastOffers` (291).
  3. That sends `delivery_offer` to room `driver:<id>` plus a push on channel `delivery-offers`.
  4. The rider app's `startOfferPump` (`driverStore.ts:1441`) also polls `/me/offer` every 4 seconds. `receiveOffer` (1001) plays the tone, and the home screen opens `/request`.
- **Acceptance criteria:**
  - **Rider** (online, recent location fix, within radius): the tone plays within 1 second (socket) or 4 seconds (poll). The card shows earnings, ready-by time, kitchen, drop point and cash to collect.
  - **Diner:** within 8 seconds sees "Finding you a delivery partner".
  - **Kitchen:** sees "Finding a delivery partner".

#### S5 ✅ A rider accepts, and the diner and kitchen see who's coming
Gaps: G-FL-2, G-FL-10.

- **User story:** As a diner and as a kitchen, I see who is picking up the order as soon as a rider accepts it.
- **Flow:**
  1. The rider taps accept (`driverStore.ts:1046`), which sends `POST /orders/:n/accept`.
  2. The server claims the order atomically (`foodDispatch.service.js:593`).
  3. The server then sends `delivery_offer_closed` (reason `taken`) to the other riders, sends `dispatch_update` to every party, and pushes the diner "A rider is on the way".
  4. The diner app polls every 5–8 seconds (`[id].tsx:242-255`). The kitchen app reloads when it gets `dispatch_update`.
- **Acceptance criteria:**
  - Exactly one rider wins; every other rider sees "Another rider took this one".
  - **Diner:** sees the rider's name, vehicle and PIN within 8 seconds.
  - **Kitchen:** sees the rider's name immediately.
  - **Winning rider:** lands on `/active` with the customer's name and phone.

#### S6 ✅ The kitchen marks ready, and the rider can collect
Gap: G-FL-1.

- **User story:** As a rider, I'm told as soon as the food is ready so I can collect it.
- **Flow:**
  1. The kitchen marks the order ready (`setOrderStatus('ready')`).
  2. `foodOrder.controller.js:359-362` re-dispatches if the order is still unassigned, then sends `dispatch_update`.
  3. The rider app's `onDispatchUpdate` (`driverStore.ts:1432`) picks it up. The job is also re-read every 30 seconds and when the app returns to the foreground.
- **Acceptance criteria:**
  - **Rider:** `canCollect` becomes true within 1 second (socket) or 30 seconds (poll).
  - **Kitchen:** sees the hand-over code.
  - **Diner:** sees "Leaving the kitchen now".
  - No "ready" push is sent to the rider.

#### S7 ✅ The rider picks up, and the diner sees them moving
Gap: G-FL-3.

- **User story:** As a diner, once the rider picks up my food I can watch them on the map.
- **Flow:**
  1. The rider confirms pickup (`DR/app/active.tsx:167-184`), which sends `PATCH /orders/:n/status {picked_up, code}`.
  2. `driverOrder.controller.js:299-345` checks the code, sends `dispatch_update`, and pushes the diner.
  3. The rider's location goes up via `PATCH /me/location` and is relayed as `driver_location` to room `order:<n>` (`driver.controller.js:772-781`, also `realtime.js:414-425`).
  4. The diner app's `watchOrder` (`support.socket.ts:394-416`) stores the location as `[lng, lat]` (`[id].tsx:150-160`).
- **Acceptance criteria:**
  - **Diner:** sees "On the way to you" within 5 seconds, and the marker moves with each fix. The marker is hidden if the last fix is more than 2 minutes old.
  - **Kitchen:** sees "With the rider".
  - **Rider:** moves to stage 3.

#### S8 ✅ The rider delivers with the PIN
Gap: G-FL-4.

- **User story:** As a rider, entering the diner's PIN completes the delivery and credits my earnings.
- **Flow:**
  1. `driverOrder.controller.js:323-340` marks the order delivered. For cash, it also sets the order paid. The rider is freed.
  2. The diner app shows an arrival card (`[id].tsx:660-716`).
  3. The rider's earnings are refreshed (`driverStore.ts:1181-1197`).
  4. The kitchen's payout becomes payable (`foodPayout.service.js:75-86`).
- **Acceptance criteria:**
  - **Diner:** sees "Delivered · Handed over by X".
  - **Rider:** today's earnings go up by `delivery.earnings` (80% of the fee, minimum ₹25).
  - **Kitchen:** the balance goes up by `partnerPayout`.

#### S9 ⚠️ The kitchen rejects the order
Gaps: G-FL-8, G-FL-15.

- **User story:** As a diner whose order is rejected, I see why and I get my money back.
- **Flow:**
  1. `foodOrder.controller.js:274-300` cancels dispatch.
  2. It sends `delivery_cancelled` to any assigned rider.
  3. `markForRefund` sets `paymentStatus` to `refunded`, meaning the refund is owed.
  4. The diner gets a push.
- **Acceptance criteria:**
  - **Diner:** gets a push, sees the kitchen's reason, and sees "Refund on the way".
  - **Rider:** sees "The restaurant could not take this order."
  - **Admin:** the order appears in the refund queue; the refund itself is issued by hand (`POST /admin/food-orders/:n/refund`).

#### S10 ✅ The diner cancels at "placed" or "accepted"
Gaps: G-FL-14, G-FL-22.

- **User story:** As a diner, I can cancel before cooking starts and get a full refund.
- **Flow:**
  1. The diner cancels (`[id].tsx:963-970`), which sends `PATCH /orders/:n/cancel`.
  2. `cancelMyOrder` (`foodCustomerOrder.controller.js:490-570`) frees the rider (`delivery_cancelled`), closes offers (`delivery_offer_closed` with reason `cancelled`), marks the refund owed, and sends `dispatch_update`.
  3. The kitchen app's `orderPump.ts:304-307` records the order as taken away.
- **Acceptance criteria:**
  - **Diner:** sees "cancelled" and, if prepaid, "You get the full ₹X back".
  - **Kitchen:** the ticket leaves Live with a notice, and no tone plays.
  - **Rider:** the job or offer is cleared.

#### S11 ✅ The diner tries to cancel after cooking has started

- **User story:** As a diner, once the kitchen has started cooking I can't cancel, and the app tells me why.
- **Behaviour:** the cancel button is hidden (`[id].tsx:337`). If the call is made anyway, the server returns `TOO_LATE_TO_CANCEL` (`foodCustomerOrder.controller.js:508-513`).

#### S12 ⚠️/❌ No rider accepts
Gaps: G-FL-1, G-FL-16, G-FL-17. Status is ⚠️ early on and ❌ once the order is being cooked.

- **User story:** As a diner whose order finds no rider, someone sorts it out; my order isn't stuck forever.
- **What each party sees today:**
  - **Diner:** "We have not found a rider yet" plus a reason, and a push.
  - **Kitchen:** "No rider has taken this one yet".
  - **Admin:** the order is flagged "dispatch failed".
- **Gap:** once the order is preparing or ready, nothing retries dispatch, nothing escalates, and nobody can cancel.

#### S13 ⚠️ The rider releases the order or goes quiet
Gap: G-FL-18.

- **User story:** As a diner whose rider gives up or goes silent, a new rider is found without my doing anything.
- **Flow:**
  1. The rider releases (`POST /orders/:n/release`, allowed only before pickup), or `reconcileDeliveries` (`foodDispatch.service.js:954`) drops a rider who has sent no location for 10 minutes.
  2. `releaseRider` runs, then dispatch starts again.
- **Acceptance criteria:**
  - **Diner:** "Finding…" returns within 8 seconds.
  - **Kitchen:** the rider box disappears.
  - **Rider:** if the server released them, the job disappears within 30 seconds.

#### S14 ⚠️/❌ Paying the kitchen and the rider after delivery
Gap: G-FL-23. Kitchen payout is ⚠️; rider payout is ❌.

- **User story:** As a kitchen and as a rider, I get paid for completed orders.
- **Kitchen:** `POST /food-partners/me/payouts/request`, then an admin marks it paid or rejected (`foodPayout.service.js:285, 315`).
- **Rider:** `GET /me/earnings` is a report only. There is no payout and no record of the cash the rider collects.

#### S15 ❌ Rating the kitchen or rider
Gap: G-FL-24.

- **User story:** As a diner, I can rate the kitchen and the rider after delivery.
- **Today:** no endpoint or field exists. `ratingAvg` is never written, and the rider's rating prompt was removed (`DR/app/complete.tsx:18-32`).

#### S16 Killing and reopening each app mid-order

| Party | Status | What happens |
|---|---|---|
| Diner | ✅ | Orders are re-read at launch, polling resumes, and a `food_order` push routes to the order (`usePushRouting.tsx:45-50`). |
| Kitchen | ⚠️ | The order pump restarts from `_layout`. A push tapped from a cold start is not routed (G-FL-25). |
| Rider | ✅ | The job is persisted (`driverStore.ts:1352-1359`), `fetchActiveJob` runs at launch, the order room is re-joined on reconnect, and the poll brings back an open offer within 4 seconds. |
| Backend restart | ✅ | `sweepStalledDispatch` re-books the widen timers within 2 minutes (`server.js:341-366`). |

#### S17 ❌ The diner is told the food is ready
Gap: G-FL-15.

- **User story:** As a diner, I get a notification when my food is ready.
- **Today:** the copy at `[id].tsx:445` promises this notification, but no such push exists.

### 5.2 Gaps between the apps

| ID | Sev | Where (both sides) | What happens / repro | Fix |
|---|---|---|---|---|
| G-FL-1 | 🟠 High | Backend: `foodOrder.controller.js:359-362`, `foodDispatch.service.js:465, 497, 550-560, 611, 854`. Rider app: `DR/store/driverStore.ts:1033` | When the kitchen marks an order ready while dispatch is still searching, dispatch runs again. It excludes every rider already offered the order, **including those whose offer is still open**. That leaves no candidates, so `failSweep` sets the order to `unassigned`. Open offers stay marked `offered`, and no `delivery_offer_closed` is sent. Riders still see a live card, and tapping it returns 409 `OFFER_EXPIRED`. **Repro:** the kitchen accepts, riders A and B are offered and don't respond, the widen step finds nobody, the kitchen marks ready. | When the order is already searching, keep the existing offers instead of failing. Otherwise, close them and emit `delivery_offer_closed`. |
| G-FL-2 | 🟠 High | Rider app: `driverStore.ts:1046-1072, 1033`, `request.tsx:86-93`, `(tabs)/index.tsx:160`. Backend: `foodDispatch.service.js:700-703` (close is only sent on `taken`) | After a failed accept, the rider app keeps the dead offer. Because an offer is held, `pollOffer` stops polling, so a rider without a socket never receives another offer. | Clear the offer on `TAKEN`, `OFFER_EXPIRED`, `ORDER_CLOSED` and `NOT_FOUND`. Emit `delivery_offer_closed` on every one of those paths. |
| G-FL-3 | 🟠 High (security) | Backend: `foodOrder.model.js:1011` (`riderView.pickupCode`). Rider app: `driverStore.ts:105, 1352-1359`. Check: `driverOrder.controller.js:299-311` | The rider's API response already contains the code the kitchen is supposed to read out at pickup. A rider can mark an order picked up without going to the kitchen. | Remove `pickupCode` from `riderView`. |
| G-FL-4 | 🟠 High (security) | `driver.routes.js:224` (no rate limit), `driverOrder.controller.js:306-316` | The 4-digit delivery PIN has no attempt limit. An assigned rider can try all 10,000 codes, mark the order delivered and, for cash, paid. That releases the kitchen's payout and the rider's earnings. | Lock after 5 attempts per order and flag the order. |
| G-FL-5 | 🟡 Med | `foodPayment.controller.js:107-135, 464-483, 507-531`. Diner app: `[id].tsx:337` | A payment captured after the diner cancelled marks the cancelled order `paid` and sends `order_placed`, a push and a WhatsApp to the kitchen. `markForRefund` had already run while the order was unpaid, so no refund was queued. **Repro:** start UPI, go back to the app, cancel, then finish the UPI payment. | In `confirmPayment`, if the order is cancelled or rejected: record the payment, call `markForRefund`, and don't notify. |
| G-FL-6 | 🟡 Med (data leak) | `foodPayment.controller.js:157, 244, 274` | Two payment responses return `order.toJSON()` to the diner. That exposes `partnerPayout`, `commissionRate` and `pickupCode`. | Wrap them in `customerView`. |
| G-FL-7 | ⚪ Low | `server.js` workers; `foodOrder.model.js:182`; `foodPayment.controller.js:400-420` (no `payment.failed` handler) | Unpaid held orders never expire, and `failed` is never written. A payment made days later can reach a kitchen that has since closed. | Auto-cancel held orders after 30 minutes, and handle the `payment.failed` webhook. |
| G-FL-8 | 🟡 Med | `foodPayment.controller.js:557-574` (`refunded` means owed), `foodOrderAdmin.controller.js:1015-1034` (`issueRefund`, no push). Diner app: `foodOrders.api.ts:130-150` (no `razorpay` in the type), `FoodContext.tsx:1018-1025` | The diner sees "Refund on the way" forever. The app never learns the refund was actually sent. | Read `razorpay.refundId` and `refundedAt`, show "Refunded ₹X on <date>", and push the diner from `issueRefund`. |
| G-FL-9 | ⚪ Low | `foodDispatch.service.js:312, 868` vs `driverStore.ts:98, 1541`, `request.tsx:76` | The server sends `etaMinutes` at the top level of the offer, but the app reads `pickup.etaMinutes`, so the pickup ETA is never shown. | Read `job.etaMinutes`. |
| G-FL-10 | 🟡 Med | `driverStore.ts:1003, 1006`; `foodDispatch.service.js:856` | Offers are broadcast to every rider in range, so one rider can be offered two orders at once. The second silently replaces the first while the rider is reading it. | Queue offers, or hold the second until the first is resolved. |
| G-FL-11 | ⚪ Low | `foodOrder.notifier.js:224-228` vs 241-244 | The kitchen's WhatsApp is skipped whenever push isn't configured. | Send the WhatsApp before the push check. |
| G-FL-12 | ⚪ Low | `foodOrder.notifier.js:266` | The kitchen push shows the diner's `grandTotal`, which breaks the rule that kitchens only ever see the food total. | Use `itemsTotal`. |
| G-FL-13 | ⚪ Low | `FP/services/orderPump.ts:320, 340` | The fallback poll rings only when the count of new orders goes up. If one order is accepted and another arrives within the same 20 seconds, the count stays the same and nothing rings. | Compare the set of order numbers, not the count. |
| G-FL-14 | 🟡 Med | `foodOrder.controller.js:189, 249`, `foodCustomerOrder.controller.js:494-528` | A kitchen accept and a diner cancel at the same moment: the last write wins, so an order can be `accepted` with a cancelled event in its history, and dispatch then starts on it. | Use a conditional `findOneAndUpdate` that checks the current status. |
| G-FL-15 | 🟡 Med | `[id].tsx:445`; `dispatch.notifier.js:155-290`; `usePushRouting.tsx:86`; `FoodContext.tsx` (no interval or AppState refresh) | The promised "ready" notification is never sent. The diner app doesn't listen for `dispatch_update`, a push received in the foreground does nothing, and the order card pinned on Home goes stale. | Push when the order is ready, or change the copy. Have a foreground push call `refreshOrder`, and refresh when the app returns to the foreground. |
| G-FL-16 | 🟠 High | `foodDispatch.service.js:891` (only `searching` is swept); `foodCustomerOrder.controller.js:508`; `foodOrder.model.js:69-78`; `foodOrderAdmin.routes.js:77-86`; `foodOrderAdmin.controller.js:234-238` | A paid order no rider takes, once it is preparing or ready, has no way out. Nothing retries, the diner can't cancel, the kitchen can't reject, and the admin has no cancel or re-dispatch endpoint (yet the admin UI says "Cancel or reject it first"). The money can't be refunded. | Add admin cancel and admin re-dispatch endpoints, and have the sweep retry `unassigned` orders with backoff. |
| G-FL-17 | ⚪ Low | `foodDispatch.service.js:435-451`; `[id].tsx:94, 506, 523` | After 3 failed sweeps the reason is written but the state stays `searching`. The diner app shows the reason only for `unassigned`, so it's never seen. | Set the state to `unassigned`. |
| G-FL-18 | ⚪ Low | `foodDispatch.service.js:791, 813`; `driverStore.ts:1432-1438` | When the server takes a rider off an order, the rider gets no `delivery_cancelled` and the diner gets no "your rider changed" push. | Emit to the old rider inside `releaseRider`, and push the diner. |
| G-FL-19 | ⚪ Low | `realtime.js:486-500` | `toOrderParties` emits to each room separately, so a socket that is in two of those rooms gets the event twice. The comment claims socket.io de-duplicates this; it doesn't. | Use `io.to([...rooms]).emit(...)`. |
| G-FL-20 | ⚪ Low | `[id].tsx:92, 455-463`; `foodPayment.controller.js:159` | A cancelled order can still show **Pay now**, which then fails with 409. | Exclude cancelled and rejected orders from `awaitingPayment`. |
| G-FL-21 | ⚪ Low | `realtime.js:276-284` vs `DR/utils/socketService.ts:42` | The rider app doesn't handle the socket's `unauthorised` event and keeps a fixed token, so the socket stays dead until the app restarts. The Food-Partner app handles this correctly (`orderSocket.ts:244-246`). | Listen for `unauthorised`, then reconnect with a fresh token. |
| G-FL-22 | ⚪ Low | `foodCustomerOrder.controller.js:522-527` | A rider accept and a diner cancel at the same moment leave the rider attached to a cancelled order. It corrects itself within 30 seconds. | Use the same conditional update as G-FL-14. |
| G-FL-23 | 🟠 High (product) | `driver.controller.js:800-874`; `driver.routes.js`, `driverAdmin.routes.js`; `foodPayout.service.js:75-86` | There is no rider payout and no ledger of the cash riders collect. A cash order delivered by a Lampose rider counts as payable to the kitchen while the cash sits with the rider. A rider freed after travelling earns nothing. | Build a rider ledger (earnings owed, cash held) and a payout flow. |
| G-FL-24 | 🟡 Med (product) | — | Ratings aren't implemented anywhere. | Build ratings end to end. |
| G-FL-25 | ⚪ Low | `FP/components/dash-orders/DashOrders.tsx:257-275`; the driver app has no tap handler | The kitchen's push-tap handler only mounts once the Orders tab has been opened, and there's no cold-start handling. The rider app has no tap handler at all. | Move the handler to `app/_layout.tsx` and handle cold start. |
| G-FL-26 | 🟡 Med (confirm on device) | `driver.routes.js:198` (240 per 15 minutes) vs `DR/hooks/useDriverLocation.ts:217` (3 s / 5 m), `active.tsx:94`, `(tabs)/index.tsx:146`, `backgroundLocation.ts:186-187` | Every foreground fix is sent, which is about 300 per 15 minutes at scooter speed. Past the limit the server returns 429, so the diner's map stutters and dispatch sees stale locations. | Throttle sends to one every 5–15 seconds. |

### 5.3 How each app handles each status and event

**Order statuses** (`foodOrder.model.js:49-58`)

| Status | User App | Food-Partner | driver |
|---|---|---|---|
| `placed` | placed ✅ | New/Accept ✅ | stage 1 ✅ |
| `accepted` | confirmed ✅ | Start cooking ✅ | stage 1 ✅ |
| `preparing` | preparing ✅ | Mark ready ✅ | stage 1 ✅ |
| `ready` | ready ✅ | Code shown ✅ | stage 2, can collect ✅ |
| `picked_up` | on the way ✅ | With the rider ✅ | stage 3 ✅ |
| `delivered` | ✅ | ✅ | stage 4 ✅ |
| `rejected` | reason shown ✅ | ✅ | cleared by `delivery_cancelled` ✅ |
| `cancelled` | ✅ | notice ✅ | cleared ✅ |

**Dispatch state:** all 4 values are typed in every app. The Food-Partner app never shows `failureReason` (`DashOrders.tsx:529-538`), and the User App shows it only for `unassigned` (G-FL-17).

**Payment status:** `failed` is never written (G-FL-7). `refunded` means both "owed" and "sent" (G-FL-8).

**Socket events**

| Event | Who emits | Who listens | Result |
|---|---|---|---|
| `order_placed` | Backend | Food-Partner | ✅ |
| `dispatch_update` | Backend | Food-Partner, driver; the User App polls instead (by design) | ✅ |
| `delivery_offer` | Backend | driver | ⚠️ G-FL-9 |
| `delivery_offer_closed` | Backend | driver | ⚠️ missing on some paths (G-FL-1, G-FL-2) |
| `delivery_cancelled` | Backend | driver | ⚠️ missing on server release (G-FL-18) |
| `driver_location` | driver, relayed by Backend | User App | ✅ `{lat,lng}` becomes `[lng,lat]` |
| `unauthorised` | Backend | Food-Partner ✅, User App ✅, **driver ❌** | G-FL-21 |

**Longitude/latitude order:** ✅ nothing is swapped anywhere (checked `foodCustomerOrder.controller.js:284-289`, `driver.controller.js:749-751`, `DeliveryMap.tsx:62`, `MapPanel.tsx:55`, `active.tsx:216`).

**Dead code:**
- The User App's pickup-code block at `[id].tsx:765-779` can never render.
- `verifyFoodPayment` (`foodOrders.api.ts:250`) is never called.


---

## 6. Cross-app: the stay loop (User App ↔ Stay Partner) and shared features (all 4 apps)

**The docs are out of date:**
- Support has **four** audiences, not three. There is also `/api/v2/partners/support` (`support/ticket.routes.js:218-226`, `PARTNER_CATEGORIES`).
- The README says web visit requests get "24 hours". The default is actually **5 minutes** (`visitRequest.controller.js:67-68`, `VISIT_REPLY_WINDOW_MINUTES`).

Two channels share the `visitrequests` collection:
- **app**: a signed-in student, no OTP, and the owner answers in Stay Partner.
- **web**: a lampose.com guest verified by SMS OTP, and the owner answers AVAILABLE on WhatsApp.

The User App always uses `POST /customers/stay-requests` (`User App/services/api/stayRequests.api.ts:94-108`).

### 6.1 Stay loop: user stories

| ID | Story | Student side | Owner side | Status |
|---|---|---|---|---|
| US-ST-1 | As a student, I only see listings I can actually request | The feed excludes `removed` and `review` (`listing.controller.js:19,246`). If every room type is paused, the listing is dropped (`:416`). The detail screen returns 404 for `review` (`:510`). Save refuses `review` (`saved.controller.js:86`). A stay request needs `active` (`stayRequest.service.js:211`). | Nothing is filtered on the owner's side (by design) | ⚠️ G-ST-1, G-ST-10, G-ST-19 |
| US-ST-2 | As a student, I can save a listing | `/customers/saved` works. A removed listing comes back with `removed:true`, but the app has no such field, so there's no "listing removed" state. | — | ✅ (Low gap) |
| US-ST-3 | As an owner, when I change a price, room or bed count, students see it | The listing is cached for 60 s (`useListings.ts:31,129`), with no socket or push. The server re-calculates the price when the request is created, so a stale screen can't charge the wrong amount. | `PATCH /partners/properties/:id` runs `syncShareTypes` | ⚠️ G-ST-12 |
| US-ST-4 | As an owner, when I pause a room or I'm full, the listing hides or shows | Fully paused: hidden. No free beds: shown, but marked not requestable. | Pause per room type and per property both work | ⚠️ G-ST-11, G-ST-10 |
| US-ST-5 | As a student, when I send a stay request the owner is alerted immediately | `createStayRequest` validates the listing, the owner, duplicates, in-flight bookings, room type, inventory and intent, and the server sets the deadline (`stayRequest.service.js:186-505`) | An inbox row, the `stay_request_new` socket event and a push (`stayRequest.notifier.js:163-209`). The push opens `/requests/[id]`. | ⚠️ G-ST-15 |
| US-ST-6 | As a student, when the owner accepts I see confirmation, my PIN and address, or a payment step | The socket event `stay_request_updated`, a push, and polling while the request is `pending_owner` (`useStayRequest.ts:172-180`) | `acceptAndBook` claims the bed, writes the `PartnerBooking`, and auto-declines the other requests when the last bed goes (`stayRequest.service.js:536-765`) | ⚠️ The hotel push copy is wrong (it says "free to visit…", `stayRequest.notifier.js:230-235`) |
| US-ST-7 | As a student, if I'm declined or the last bed goes, I'm told why | `notifyStudentDeclined` separates `INVENTORY_TAKEN` from an owner decline | — | ✅ |
| US-ST-8 | As a student, I can withdraw a request before the owner answers | The update is guarded, and the coupon is released (`stayRequest.service.js:811-869`) | Gets an inbox row, a socket event and a push | ✅ |
| US-ST-9 | As a student and an owner, when a request expires both of us see it | A 5 s worker (app channel only) sends a socket event and a push (`stayRequest.service.js:944-983`) | **No push, socket event or inbox update.** The owner only finds out by polling, and the inbox still says "N minutes to answer". | ⚠️ G-ST-18 |
| US-ST-10 | As a web guest, I request a visit by OTP and the owner answers AVAILABLE on WhatsApp | Only verified guests are messaged. The owner's number comes from the property, and the price is re-calculated (`visitRequest.controller.js:322-360`). | Stay Partner shows "Room type —" and no PIN (G-ST-17). The server's `accept` doesn't refuse web rows (`stayRequest.service.js:536-545`); only the UI hides the button. | ⚠️ |
| US-ST-11 | As a student at a Bachelor or Co-live place (₹199 visit) or a hotel, I pay, pick a slot and get the address | The payment WebView, then `markVisitPaid`, then the slot, then `confirmSchedule` (`visitPayment.controller.js:166-345`) | Notified | ❌ at the edges: G-ST-2, G-ST-3, G-ST-4 |
| US-ST-12 | As a student, I see when the owner checks me in or out, cancels, or refunds | A push and a socket event (`partnerDomains.controller.js:431,533,566,624`) | — | ⚠️ These never reach the in-app inbox (G-ST-14). Refund and coupon push taps are broken (G-SH-6). |
| US-ST-13 | As an owner, I'm told when a student cancels a booking | — | `customerBooking.controller.js:360-418` releases the bed, opens a refund and notifies the owner | ✅ (but the request stays `confirmed`, which causes G-ST-2 and G-ST-3) |
| US-ST-14 | As a returning student, I can request the same property again | 409 `ALREADY_BOOKED`, forever | — | ❌ G-ST-5 |

### 6.2 Stay loop: gaps

| ID | Sev | Where (both sides) | What happens and how to reproduce | Fix |
|---|---|---|---|---|
| G-ST-1 | 🟠 High (privacy) | `Backend/src/modules/listings/listing.formatter.js:163` (**checked**: `ownerMobile: doc.ownerMobile`), served with no login by `GET /api/v2/listings` and `/:id` (`listing.controller.js:364,526`). `User App/services/api/types.ts:132-133` | **The public feed exposes every owner's phone number.** This breaks the rule that the owner's number never reaches a client, and it lets anyone skip the ₹199 assisted visit. **Repro:** `curl /api/v2/listings \| jq '.data[].ownerMobile'` | Remove `ownerMobile` from `formatListing`, and from `BackendListing` (along with the dead `address` at `:134`). |
| G-ST-2 | 🟠 High | `stayRequest.service.js:338-345, 520-524, 556-598, 824-828`; `visitPayment.controller.js:383-388, 558-563, 628-633`; `User App/hooks/useOngoing.ts:95-121` | **An unpaid confirmation that lapses never frees the bed and blocks the student forever.** Nothing expires `payment.dueBy`. The in-flight check treats "confirmed and not paid" as blocking forever, and the student can't withdraw. **Repro:** Bachelor listing, owner accepts, wait past `payWindowHours`. Any new request gets 409 `BOOKING_IN_PROGRESS`, and paying gets 410 `CONFIRMATION_LAPSED`. | Add a worker that expires these requests, calls `releaseBed`, cancels the `PartnerBooking`, and notifies both sides. Leave expired requests out of the in-flight check, in `useOngoing` too. |
| G-ST-3 | 🟠 High | Owner cancel `partnerDomains.controller.js:575-624`; student cancel `customerBooking.controller.js:360-395`; `visitPayment.controller.js:373-388` | **After a booking is cancelled, the request can still be paid.** Only `PartnerBooking` is updated. **Repro:** owner accepts a Bachelor request, then cancels the booking. The student still pays ₹199, picks a slot, and `confirmSchedule` releases the address for a cancelled booking. The student also stays blocked. | When a booking is cancelled, cancel the linked request and void its payment. Refuse payment and slot selection when the booking is cancelled. |
| G-ST-4 | 🟠 High | `visitPayment.controller.js:322-330`, `stayRequest.notifier.js:532-540`, `assistedSlot.controller.js:265-268` | **After a hotel stay is paid, the guest is pushed "pick a date and time for your visit".** The slot picker then refuses with 400 `NOT_APPLICABLE`. The owner is never told the guest paid. | Branch the notification on `payment.purpose`, and notify the owner when a `stay_booking` is paid. |
| G-ST-5 | 🟡 Med | `stayRequest.service.js:286-297` | Any `confirmed` request at a property blocks new ones forever, even after the booking was cancelled or checked out. **Repro:** a PG booking is accepted then cancelled or completed; requesting again gives 409 "You already have a confirmed booking". | Block only while the linked `PartnerBooking` is `upcoming`, `arriving` or `in_house`. |
| G-ST-10 | 🟡 Med | `visitRequest.controller.js:328` vs `stayRequest.service.js:211, 388-405` | The web visit flow only refuses `review` listings. Removed, paused and full listings still WhatsApp the owner. | Reuse the `status==='active'` check and `findRequestableOption`. |
| G-ST-11 | 🟡 Med | `partnerDomains.controller.js:1305, 1321-1323`; `portfolio.controller.js:450-451` | Switching bookings "off" and back "on" only sets `acceptingBookings=true`. The dashboard says the owner is available while every room type stays paused and every listing stays hidden. Nothing on the student side reads `acceptingBookings`. | Derive the dashboard state from the share types, or re-enable the paused ones when switching back on. |
| G-ST-12 | 🟡 Med | `inventory.service.js:113-166, 356-358`; `addCustomer.controller.js:585, 609` | Renaming a room-type label deletes its share-type row. The new row starts at occupancy 0 and available. Pending requests fail with `INVENTORY_GONE`, and checking out releases nothing. The owner can also freely edit `shareType` on a booking. | Give share types a stable id that survives a rename. Lock the share type on bookings that came from a request. |
| G-ST-14 | 🟡 Med | `notification.controller.js:47-160` | The student's alerts inbox is built only from `visitrequests`. Owner cancellations, check-in and check-out, refunds, coupons and visit payments arrive only by push or socket, and push is null on simulators and when permission is refused. | Add a `customer_notifications` collection that the notifiers write to. |
| G-ST-15 | 🟡 Med | `stayRequest.service.js:236-246`, `stayRequest.notifier.js:60-64`, `stayRequest.controller.js:149` | If the owner has no registered push device, the app request always expires unseen. There is no WhatsApp or SMS fallback. | When the push result is `NO_DEVICES`, fall back to the WhatsApp template. |
| G-ST-17 | 🟡 Med | `portfolio.controller.js:144-208` (`toOwnerJSON`) vs `visitRequest.model.js:698+` (`toOwner`); `RequestDetailScreen.tsx:408,439,455` | The owner's view of a web request is missing `sharing`, `expiresAt`, `entryPin`, `channel`, `seenAt` and `decidedAt`, so those fields show "—". | Use one serializer for both channels. |
| G-ST-18 | ⚪ Low-Med | `visitRequest.controller.js:170-177, 1001-1013`; `visitRequest.routes.js:39-42`; `stayRequest.notifier.js:436-446` | When a web request expires, the owner is told "we have let the customer know", but nothing is sent. On the app channel, expiry never notifies the owner. The student inbox copy says "24 hours" but the window is 5 minutes (`notification.controller.js:58-60`). | Send the guest the expiry message, notify the owner, and correct the copy. |
| G-ST-19 | ⚪ Low-Med | `listing.controller.js:19, 246` vs `stayRequest.service.js:211`; `property.controller.js:172` | The feed uses a denylist (hide these statuses) but requests use an allowlist (only `active`). The v2 create endpoint stores any `status`, so an odd status shows in the feed and then fails with `PROPERTY_UNAVAILABLE`. | Filter the feed on `status:'active'`. |
| G-ST-20 | ⚪ Low-Med (security) | `visitRequest.routes.js:75, 79`; `visitPayment.controller.js:794-813`; `visitRequest.controller.js:897-899` | Writes with no login trust the request id as the only credential. `/payment/failed` overwrites `paymentId` even on a paid request, with no rate limit. `/assisted/slot` sets the slot and sends WhatsApp to the owner. `GET /:id` returns `entryPin`, the name and the address. ObjectIds can be guessed (timestamp plus counter). | For app rows, require the customer to be signed in and match. Refuse `/failed` once paid, and rate-limit it. |

### 6.3 Shared features: how the four apps compare

**Support tickets**

| | User App | Stay Partner | Food-Partner | driver |
|---|---|---|---|---|
| Blocked, suspended or rejected account can still reach support | ❌ 403 (`customerAuth.middleware.js:104-110`) | ❌ 403 (`partnerAuth.middleware.js:106-111`) | ❌ 403 ACCOUNT_REJECTED | ✅ `requireDriverForSupport` |
| Message type accepts `author:'partner'` | ❌ (`types.ts:358`, `types/support.ts:80`) | ✅ | n/a | n/a |
| Live `support_message` | ✅ | ✅ | ✅ | ✅ |
| Tapping a `support.*` push opens the thread | ❌ dropped by `isOurs` | ❌ needs a `requestId` | ❌ only handles `food_order` | ❌ no tap handler |
| Android `support` notification channel exists | ❌ | ❌ | ❌ | ❌ |
| A food order can be attached to a ticket | ❌ (`food/order/[id].tsx:988`; no food category) | n/a | ✅ | ✅ |

**Account deletion**

| | User App | Stay Partner | Food-Partner | driver |
|---|---|---|---|---|
| `ACCOUNT_GONE` signs the user out | ✅ | ✅ | ✅ | ✅ |
| The eraser also revokes sessions | ✅ | ✅, but **properties stay listed** (G-SH-9) | ❌ | ❌ |

**Push notifications**

| | User App | Stay Partner | Food-Partner | driver |
|---|---|---|---|---|
| Register path | `/customers/devices` | `/partners/devices` | `/food-partners/me/devices` | `/drivers/me/devices` |
| Logout calls the server | ✅ | ❌ (the route exists but is never called) | ❌ no route | ❌ no route |
| Tapping a push from a cold start is routed | ✅ | ✅ (requests only) | ❌ | ❌ |
| Push kinds handled | 9 of 15 | 6 request kinds | `food_order` | none |

**"Use my location" address fill**

| | User App | Stay Partner | Food-Partner | driver |
|---|---|---|---|---|
| Fills only empty fields | ✅ | ✅ | ❌ overwrites (`LocationRow/index.tsx:43-55`) | ✅ |

**Sessions and login**

| | User App | Stay Partner | Food-Partner | driver |
|---|---|---|---|---|
| Token lifetime | 7 days, no refresh | same | same | same |
| `sessionVersion` revocation | ✅ | ✅ | ❌ | ❌ |
| Handles `SESSION_REVOKED` | ✅ | ❌ | ✅ | ✅ |
| Shows a blocked or suspended screen | ❌ | ❌ | ✅ | ✅ |
| The socket re-checks the account | ✅ | ✅ | ❌ | ❌ |
| Retries failed GETs | ✅ | ✅ | ❌ | ❌ |
| Play review account kept away from real users | ❌ (G-SH-13) | ✅ | ✅ | ✅ |

**Forced app updates:** ❌ in all four apps. `User App/app/(entry)/update.tsx:30` is a design-only screen with `onAction={() => {}}`. None of the apps uses `expo-updates`, and the backend has no version endpoint.

**Offline handling:** none of the apps uses NetInfo. The User App and Stay Partner retry GETs. Food-Partner and the driver app do not.

**Dead code:** Stay Partner still ships the fixture `lib/complaints.ts:29`, subscribed at `TodayTabScreen.tsx:228`. The `/partners/complaints` backend routes are still mounted (`partner.routes.js:347-351`).

### 6.4 Shared-feature gaps

| ID | Sev | Where | What happens | Fix |
|---|---|---|---|---|
| G-SH-6 | 🟡 Med | Backend kinds: `refund.paid`, `coupon.earned`, `visit.*`, `support.*` (`stayRequest.notifier.js:321-326, 391-397, 532-600`; `support.notifier.js:137, 168`). User App: `push.ts:71-102, 121-122`; `usePushRouting.tsx:71-74` | Tapping `refund.paid` or `coupon.earned` opens `/confirm/[id]` with an empty id, which is a broken screen. Support pushes do nothing when tapped. `visit.slot_reminder` opens the confirm screen instead of the slot picker. | Add a route for each kind, and let `isOurs` accept `reference`. |
| G-SH-7 | 🟡 Med | `support.notifier.js:119, 137-138`; push channel setup in all four apps | No app creates the `support` Android channel. No app routes support pushes. When the owner replies (`author:'partner'`), the student never gets a push. | Create the channel in all four apps, route the pushes, and push partner replies. |
| G-SH-8 | 🟡 Med (security) | `addCustomer.controller.js:685-726`; `Stay Partner/services/api/addCustomer.api.ts:170-178` | `DELETE /partners/bookings/:id` hard-deletes **any** booking, including request-sourced, in-house or paid ones. It frees no bed and notifies no one. Only the UI limits it to manual bookings. | Allow it only when `source==='manual'` and the booking isn't occupying a bed. Otherwise send it through cancel. |
| G-SH-9 | 🟡 Med (privacy) | `accountDeletion.eraser.js:95-117` | Erasing an owner leaves their properties listed with the real `ownerMobile` (made public by G-ST-1). App requests fail with 422, and web requests still WhatsApp that number. | Have the eraser remove the owner's properties and pause their share types. |
| G-SH-13 | 🟡 Med | `customer.controller.js:96-111`; there is no review guard in `visits/`, `foodCustomerOrder.controller.js` or `support/` | The Play-review customer, which uses a shared fixed OTP, can send stay requests to real owners and place orders at real kitchens. | Refuse any write from the review account that would reach a real counterparty. |
| G-SH-16 | 🟡 Med (privacy) | `Stay Partner/context/AuthContext.tsx:203-205`, `User App/context/AuthContext.tsx:265`, `driver/store/driverStore.ts:826-835` | After a sign-out caused by an expired token, the app unregisters the device using the dead token. That call fails, so the handset keeps receiving the account's pushes on the lock screen. | Add an unauthenticated `DELETE /devices` keyed by push token. |
| G-SH-21 | ⚪ Low-Med (security) | `customer.model.js:115`, `partner.model.js:245` only; `foodPartner.routes.js:136-140`; `realtime.js:152-167` | Food-Partner and the driver app have no `sessionVersion`. A password reset or erasure doesn't kill existing sessions or sockets. | Add `sessionVersion` to both identities. |
| G-SH-22 | ⚪ Low-Med | `customerAuth.middleware.js:104-110`, `partnerAuth.middleware.js:106-111`, `ticket.routes.js:156-164, 218-226` | Blocked customers and partners are told to "contact support", but the support routes block them too. Neither app has an `ACCOUNT_BLOCKED` screen. | Use a support-specific guard like the driver's, and add a blocked screen. |
| G-SH-23 | ⚪ Low | `User App/app/support/new.tsx:20, 185` vs `ticket.controller.js:323-325` | The app says "The owner will see this too" for 4 categories, but only `property` is actually linked to the owner. | Fix the copy, or link all four. |
| G-SH-25 | ⚪ Low | `User App/app/food/order/[id].tsx:988`, `support.audiences.js:50` | A diner can't attach a food order to a support ticket, and there is no food category. | Pass `orderNumber` and add a food category. |
| G-SH-26 | ⚪ Low | `User App/app/(entry)/update.tsx:30` | Forced updates are not implemented in any app. | Add a version endpoint and a check at app start. |
| — | ⚪ Low | `accountDeletion.audiences.js:35-40` | A customer's `activeWork` ignores a pending visit request and a refund that is waiting for bank details. | Include both in `activeWork`. |


---

