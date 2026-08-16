# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

Monorepo for the Lampose platform (PG/room rental). Six independent sub-projects, each with its own `package.json` — there is no root package.json or workspace tooling; `cd` into a sub-project before running anything.

| Directory | What it is | Stack |
| --- | --- | --- |
| `Backend/` | **The one backend** for every client (`lampose-main-backend`) | Express + Mongoose, port 5001 |
| `Frontend/` | Public marketing site (lampose.com) | React 18 + Vite, JSX, hand-rolled motion engine |
| `Admin/` | Admin console | React 19 + Vite + TypeScript, Tailwind 4, oxlint |
| `Onboard/` | Field-agent property onboarding app (onboard.lampose.com) | React 18 + Vite, JSX |
| `User App/` | Customer mobile app ("Lumina") | Expo 54 / expo-router / React Native |
| `Stay Partner/` | Property-owner mobile app | Expo 54 / expo-router / React Native |

**There is one backend.** Never stand up a second server for a new client — add a module under `Backend/src/modules/` instead. The mobile apps are not yet wired to the backend; their APIs are planned to be added to the same process.

`Backend/README.md` is the authoritative, detailed reference for the backend (architecture, route map, env vars, failure modes, deploy). Read it before non-trivial backend work — the summary below only covers what you need to navigate.

## Commands

**Backend** (`cd Backend`):
- `npm run dev` — `node --watch server.js`. The boot banner prints the route map and which integrations (DB, SMS, Twilio) are live — read it before debugging.
- `npm run verify` — the closest thing to a test suite: 78 checks that boot the app and replay every call the three web frontends make. Cleans up after itself in MongoDB and Cloudinary. Deliberately skips full `POST /api/v1/properties` (would send a real WhatsApp message) and skips live scraping unless `--scrape`.
- `npm run smoke` — fast health check incl. CORS preflights; `SMOKE_URL=https://api.lampose.com npm run smoke` against a deployment.
- `npm run inspect:db` / `inspect:properties` — collection shapes and tallies.
- Setup: `cp .env.example .env`, `npm install`, `npm run browsers` (Playwright Chromium, only for the lead scraper).

**Frontend / Onboard**: `npm run dev`, `npm run build`, `npm run preview`. No lint, no types, no tests.

**Admin**: `npm run dev`, `npm run build` (`tsc -b && vite build` — the typecheck), `npm run lint` (oxlint).

**User App / Stay Partner**: `npm start` (Expo; Stay Partner's start is `--offline`), `npm run typecheck` (`tsc --noEmit`). The `dev`/`build`/`serve` scripts are Replit-specific artifacts.

## Connecting clients to the backend

The backend listens on **5001** (`PORT` overrides). Watch the fallbacks — two clients default to the wrong port:

| Client | Env var | Fallback if unset |
| --- | --- | --- |
| Frontend | `VITE_API_BASE_URL` | `http://localhost:5000/api` (**wrong port**) |
| Admin | `VITE_API_BASE_URL` | `http://localhost:5001/api` |
| Onboard | `VITE_API_URL` (note: different name, points at `…/api/properties`) | `http://localhost:5000/api/properties` (**wrong port**) |

## Backend architecture (the parts that span files)

- `server.js` is boot/banner/shutdown only; `app.js` builds the Express app (split so `scripts/` can boot it). `routes/index.js` is the **one mount point** — the version registry plus unversioned legacy aliases.
- `src/modules/<domain>/` — one folder per business domain; files are named by role (`<domain>.model.js`, `.controller.js`, `.routes.js`, `.routes.v1.js`/`.v2.js`, `.util.js`, `.service.js`, `.store.js`). Folders are organisation, not boundaries — modules import each other's files directly. Model/collection names live inside the files, so folder renames never touch the database. (`scriper.model.js` keeps its historical misspelling; the `scriper_*` collections are named after it.)
- **Two API versions, both correct.** v1 = onboarding surface: `POST /api/v1/properties` does *not* create a property — it stores a `verificationrequest` and starts a WhatsApp approval chain (owner replies YES, then a `VERIFICATION_TEAM_NUMBERS` member confirms). v2 = public site + leads panel: `POST /api/v2/properties` writes immediately behind a bearer token. They cannot share a path; `/properties` without a version prefix is deliberately a 404.
- **Two identity systems** that share nothing: v1 admin console (`admins` collection, token not verified server-side) vs v2 leads panel (`scriper_users`, JWT verified on every guarded route). Never make one verify the other's tokens. The Onboard app logs in via v2 (`/api/v2/auth/onboarding-login`) but identifies writes with the `x-employee-email` header, which the v1 single-use permission gate reads.
- **One WhatsApp webhook, two workflows** (`/api/whatsapp/webhook`): dispatch is by the reply word, never the route — `YES`/`NO` → v1 property verification; `AVAILABLE`/`NOT AVAILABLE` → v2 visit availability. `AVAILABLE` is deliberately not `YES`; don't "simplify" that. Dispatch lives at the top of `src/modules/verification/verification.routes.js`.
- **Visit-request safety orderings** (do not reorder): owner is contacted only after the customer's SMS OTP verifies; the owner's phone number is read from the `properties` document, never the request body; every price is re-derived server-side by `stayIntent.util.js`.
- **Nothing exits the process.** Every missing dependency (Mongo, SMS, Twilio, JWT_SECRET, Playwright) degrades to a named 503 on just the affected routes; Mongo-down additionally puts v1 on an in-memory fallback store. Keep this property when adding features: no credential fallbacks in source, degrade loudly per-route.
- `requestLogger` is the first middleware (before CORS) so blocked origins and 404s are visible; passwords/tokens are redacted, base64 images collapsed.

## Backend sharp edges

- `OTP_SMS_TEMPLATE` in `.env` must stay quoted (a bare `#` truncates it) and must match the DLT registration character-for-character.
- `BODY_LIMIT` is 25mb because Onboard posts base64 images in JSON bodies.
- Testing real WhatsApp locally needs a tunnel (`cloudflared tunnel --url http://localhost:5001 --protocol http2`) and repointing the Twilio webhook — set it back to production afterwards or real owner replies get lost.
- Deploy (`Backend/deploy/`): don't add `Access-Control-Allow-Origin` in nginx (the app sets it; duplicates break every browser), and point uptime checks at `/api/health/live`, not `/api/health` (the latter 503s when Mongo is down).
