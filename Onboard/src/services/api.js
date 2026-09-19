/* ══════════════════════════════════════════════════════════════════════════
   ██  THE ONE PLACE THIS APP TALKS TO THE NETWORK.  ██
   ══════════════════════════════════════════════════════════════════════════

   Every request the onboarding site makes goes through the `api` instance
   below. No component, and no other service, is allowed to call fetch() or
   axios directly — if you need a new endpoint, add a function here.

   WHERE THE URL COMES FROM

   One variable, in .env, read in one place:

       VITE_API_BASE_URL=https://api.lampose.com/api

   That is the API ROOT — the part ending in /api — not a single endpoint.
   Every path below is derived from it, so changing that one line repoints
   the entire site: listings, uploads, permissions and login together.

   This used to be three different base URLs in three files, which is what
   made the production CORS failures so hard to read:

     services/api.js       VITE_API_URL   -> .../api/properties
     services/auth.js      a hardcoded    -> https://api.leads.lampose.com/...
                           default, PLUS a per-browser localStorage override
     App.jsx               its own copy of import.meta.env.VITE_API_URL

   So the site was authenticating against one host and posting properties to
   another. A browser that had ever opened the "Auth Backend URL" box was
   pinned to a third. Only one of those hosts could be on the API's CORS
   allowlist at a time, so login and save could never both work.
   ══════════════════════════════════════════════════════════════════════════ */
import axios from 'axios';

import {
  getAuthToken,
  getCurrentUser,
  getSavedEmployeeEmail,
  logout,
  setAuthSession,
} from './auth.js';

/* ── Base URL ──────────────────────────────────────────────────────────── */

/**
 * Normalise whatever is in .env into the API root.
 *
 * Tolerant on purpose, because all three of these have been in a deployed
 * .env at some point and every one of them should keep working:
 *
 *   https://api.lampose.com/api              -> unchanged
 *   https://api.lampose.com/api/properties   -> /properties dropped
 *   https://api.lampose.com                  -> /api appended
 *
 * The endpoint-shaped value is the legacy `VITE_API_URL`. It is accepted so
 * an existing deployment does not break the moment this ships, but the
 * variable to set going forward is VITE_API_BASE_URL.
 */
const normaliseBase = (value) => {
  const trimmed = String(value || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';

  const withoutEndpoint = trimmed.replace(/\/(properties|auth|permissions)$/i, '');
  return /\/api$/i.test(withoutEndpoint) ? withoutEndpoint : `${withoutEndpoint}/api`;
};

const CONFIGURED_BASE = normaliseBase(
  import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL,
);

/* A dev machine with no .env still runs. A production build with no .env is
   a deployment mistake, and silently falling back to localhost turns it into
   "the site loads but nothing saves" — so it is said out loud instead. */
const DEV_FALLBACK = 'http://localhost:8026/api';

if (!CONFIGURED_BASE) {
  const message =
    'VITE_API_BASE_URL is not set. Add it to Onboard/.env — for example '
    + 'VITE_API_BASE_URL=https://api.lampose.com/api';
  if (import.meta.env.PROD) console.error(`❌ [api] ${message}`);
  else console.warn(`⚠️ [api] ${message} Falling back to ${DEV_FALLBACK}`);
}

/** The API root every request below is built from. */
export const API_BASE_URL = CONFIGURED_BASE || DEV_FALLBACK;

/* Printed once on load. When a CORS error appears in the console, the very
   next question is always "which host was it actually calling" — this is the
   answer, without needing a rebuild to find out. */
console.info(`🔗 [api] base URL: ${API_BASE_URL}`);

/* ── The client ────────────────────────────────────────────────────────── */

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000, // Cloudinary uploads of several photos are not fast
});

/**
 * How long a WRITE is given before the client gives up.
 *
 * Deliberately generous, because `POST /properties` does not answer until the
 * owner's WhatsApp verification has been handed to Twilio — the backend
 * awaits that send, and the reply to the browser comes after it. At 60s a
 * slow Twilio round-trip made the form report a failure for a property that
 * had been saved and a message that had already gone out.
 */
const WRITE_TIMEOUT = 180000;

/**
 * Identity on every request.
 *
 * `x-employee-email` is what the v1 permission gate reads to decide whether
 * this agent may edit or delete a given listing, so it goes on everything
 * rather than being remembered at each call site. Both it and the bearer
 * token are named in the backend's CORS `allowedHeaders`; adding a new header
 * here without adding it there makes every request fail preflight.
 */
api.interceptors.request.use((requestConfig) => {
  const email = getCurrentUser()?.email || getSavedEmployeeEmail() || '';
  if (email) requestConfig.headers['x-employee-email'] = email;

  const token = getAuthToken();
  if (token) requestConfig.headers.Authorization = `Bearer ${token}`;

  requestConfig.headers['X-Client'] = 'onboard-web';
  return requestConfig;
});

/**
 * A dead session is cleared here, once, rather than at every call site.
 *
 * The token lasts seven days. When it lapses the browser still holds a name
 * and an email, so the header goes on showing the agent as signed in while
 * every request comes back 401 — a state the screens read as "the backend is
 * down", because from a call site the two are indistinguishable. They are not
 * the same thing at all: one needs the server started, the other needs the
 * agent to sign in again.
 *
 * The sign-in call itself is exempt. A 401 there means "wrong password",
 * which is an answer to a question that was asked, not a session that ran
 * out, and clearing storage on it would be clearing nothing.
 */
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error?.config?.url || '';
    const isSignIn = /\/auth\/(onboarding-login|login|register)$/i.test(url);
    if (error?.response?.status === 401 && !isSignIn) logout();
    return Promise.reject(error);
  },
);

/**
 * Every function here resolves rather than throws, and always to an object
 * with `success`. The screens branch on `res.success` and show `res.error`;
 * a rejected promise would mean adding a try/catch to every call site to
 * reach the same place.
 */
const ok = (response) => response.data;

/**
 * Classify a failure, so the screens branch on a `kind` instead of grepping
 * the prose of an error message for the word "network".
 *
 *   server   the API answered, and said no. Its reason is the useful one.
 *   timeout  we gave up waiting. The request WAS delivered.
 *   network  no response came back: server down, DNS, or a CORS rejection.
 *            `onboardProperty` refines this into 'offline' or 'uncertain'.
 *   client   the request was never built properly. A bug on this side.
 *
 * The distinction that matters is `reached`: whether the request got far
 * enough that the server may have acted on it. A write that timed out has
 * almost certainly been carried out — the property is saved and the owner has
 * been messaged — so telling the agent "nothing was saved, press Submit
 * again" produces a duplicate listing and a second WhatsApp to the owner.
 * That is the failure this field exists to prevent.
 */
const fail = (error) => {
  /* The server's own explanation beats a transport message: "Owner mobile is
     required" is actionable, "Request failed with status code 400" is not. */
  if (error.response) {
    return {
      success: false,
      ...error.response.data,
      kind: 'server',
      status: error.response.status,
      reached: true,
    };
  }

  const timedOut = error.code === 'ECONNABORTED' || /timeout/i.test(error.message || '');
  if (timedOut) {
    return {
      success: false,
      kind: 'timeout',
      reached: true,
      error:
        `${API_BASE_URL} did not answer in time. The request was sent, so it may `
        + 'already have been carried out.',
    };
  }

  /* No response at all. Server down, DNS, offline — or a CORS rejection,
     which looks identical from here because the browser refuses to let this
     code see the response. Note that a CORS rejection does NOT mean the
     server ignored the request: it may well have run it and had its reply
     withheld from the page. So this is `reached: false` only in the sense
     that we have no evidence either way, and callers doing a write must
     treat it as "unknown". */
  if (error.request) {
    return {
      success: false,
      kind: 'network',
      reached: false,
      error:
        `Could not reach ${API_BASE_URL}. The server may be down, or this site's `
        + 'origin may not be on its CORS allowlist.',
    };
  }

  return { success: false, kind: 'client', reached: false, error: error.message };
};

/* ── Properties ────────────────────────────────────────────────────────── */

export const fetchProperties = (params = {}) =>
  api.get('/properties', { params }).then(ok).catch(fail);

export const fetchPropertyById = (id) =>
  api.get(`/properties/${id}`).then(ok).catch(fail);

/**
 * Is the API answering at all?
 *
 * Used to disambiguate a failed write. In Node you can read ECONNREFUSED and
 * know the connection was never made; in a BROWSER you cannot — a refused
 * connection, a DNS failure and a CORS-rejected response are all flattened
 * into the same opaque ERR_NETWORK, because letting the page tell them apart
 * would itself leak cross-origin information.
 *
 * Those cases have opposite consequences, so instead of guessing, ask.
 */
const isApiReachable = () =>
  api
    .get('/health/live', { timeout: 5000 })
    .then(() => true)
    .catch(() => false);

/**
 * Create a property.
 *
 * The one write on this site with a side effect that cannot be taken back:
 * the backend hands the owner a WhatsApp approval message before it replies,
 * so a resubmit is not free — it messages a real person a second time. When
 * the reply goes missing, this works out whether the server is actually down
 * (nothing happened, retrying is safe) or up (the write probably landed) so
 * the form can say which, rather than offering one guess for both.
 */
export const onboardProperty = async (propertyData) => {
  const result = await api
    .post('/properties', propertyData, { timeout: WRITE_TIMEOUT })
    .then(ok)
    .catch(fail);

  if (result?.success || result?.kind !== 'network') return result;

  const alive = await isApiReachable();
  return alive
    ? {
      ...result,
      kind: 'uncertain',
      reached: true,
      error:
        `${API_BASE_URL} is up but the reply to this save never arrived, so it may `
        + 'already have been carried out.',
    }
    : {
      ...result,
      kind: 'offline',
      reached: false,
      error: `${API_BASE_URL} is not answering at all, so nothing was saved.`,
    };
};

export const updateProperty = (id, changes) =>
  api.put(`/properties/${id}`, changes).then(ok).catch(fail);

export const deleteProperty = (id) =>
  api.delete(`/properties/${id}`).then(ok).catch(fail);

/* ── Photo upload ──────────────────────────────────────────────────────── */

/**
 * Push the chosen photos to Cloudinary through the backend and return the
 * final URL list, in the order the agent arranged them.
 *
 * `items` is the form's own list: `{ file }` for a newly picked photo and
 * `{ url }` for one already hosted (a preset, or a link that was pasted).
 * Both kinds keep their position — an agent who put the bedroom first meant
 * it, and a batch upload that only returns the new ones must not reshuffle
 * the rest.
 *
 * Tries the batch endpoint first and falls back to one request per file. The
 * fallback is not defensive coding for its own sake: the batch route is the
 * newer of the two, and an onboarding session that fails at the last step
 * loses a form the agent filled in while standing in someone's doorway.
 *
 * @param {(File|{file?: File, url?: string})[]} items
 * @param {(stage: string) => void} [onStage] Progress, for the submit button.
 */
export const uploadPropertyImages = async (items = [], onStage = () => { }) => {
  const list = items
    .map((item) => (item instanceof File ? { file: item } : item))
    .filter((item) => item && (item.file || item.url));

  const files = list.filter((item) => item.file);
  if (files.length === 0) return list.map((item) => item.url).filter(Boolean);

  onStage(`Uploading ${files.length} photo(s) to Cloudinary CDN...`);

  /* Batch. Only accepted when the count matches, because the URLs are
     matched back to their slots by position — a short array would silently
     pair photos with the wrong listing slots. */
  try {
    const form = new FormData();
    files.forEach((item) => form.append('images', item.file));

    const data = await api
      .post('/properties/upload-images', form)
      .then(ok)
      .catch(fail);

    if (data?.success && Array.isArray(data.urls) && data.urls.length === files.length) {
      let next = 0;
      return list.map((item) => (item.file ? data.urls[next++] : item.url)).filter(Boolean);
    }
  } catch (error) {
    console.warn('[api] batch upload unavailable, uploading one at a time:', error?.message);
  }

  // One at a time.
  const urls = [];
  for (let i = 0; i < list.length; i += 1) {
    const item = list[i];
    if (!item.file) {
      if (item.url) urls.push(item.url);
      continue;
    }

    onStage(`Uploading photo ${i + 1} of ${list.length} to Cloudinary...`);
    const form = new FormData();
    form.append('image', item.file);

    // eslint-disable-next-line no-await-in-loop
    const data = await api.post('/properties/upload-image', form).then(ok).catch(fail);
    if (data?.success && data.url) urls.push(data.url);
  }
  return urls;
};

/**
 * Photos for one sharing option/layout at a time — "1 BHK" gets its own set,
 * "2 BHK" gets its own, distinct from the whole-property gallery.
 *
 * Reuses `uploadPropertyImages` per label rather than a new endpoint: each
 * label's set is its own batch-then-single-fallback upload, so a label with
 * no photos staged is simply skipped rather than sent as an empty request.
 *
 * @param {Record<string, {file?: File, url?: string}[]>} mapOfLabelToItems
 * @param {(stage: string) => void} [onStage]
 * @returns {Promise<Record<string, string[]>>} label -> uploaded URLs, only
 *   for labels that actually had something to upload.
 */
export const uploadSharingImages = async (mapOfLabelToItems = {}, onStage = () => { }) => {
  const out = {};
  const labels = Object.keys(mapOfLabelToItems);

  for (let i = 0; i < labels.length; i += 1) {
    const label = labels[i];
    const items = mapOfLabelToItems[label] || [];
    if (!items.length) continue;

    onStage(`Uploading photos for "${label}" (${i + 1}/${labels.length})...`);
    // eslint-disable-next-line no-await-in-loop
    const urls = await uploadPropertyImages(items, () => { });
    if (urls.length) out[label] = urls;
  }

  return out;
};

/**
 * Replace a listing's photos.
 *
 * Send the WHOLE list in the order it should appear — the endpoint writes
 * exactly what it is given, so a deletion is "the list without that one" and
 * a reorder is the same list rearranged. That is deliberate: a PATCH-style
 * add/remove API would make the cover photo depend on the order requests
 * happened to arrive in.
 *
 * Allowed for the employee who onboarded the listing without any permission
 * request, because a photo is not a price. Anything else about a listing still
 * needs an administrator's grant.
 */
export const updatePropertyImages = (id, images) =>
  api.put(`/properties/${id}/images`, { images }).then(ok).catch(fail);

/* ── Document upload ───────────────────────────────────────────────────── */

/**
 * Push the ownership and premises paperwork through the same upload route the
 * photos use, and return `{ kind, docType, url, name }` for each.
 *
 * ## A warning about where these end up
 *
 * The backend uploads with Cloudinary's default access, which is public-read.
 * The URLs are unguessable, and that is NOT the same as private: anyone who
 * comes by one — a forwarded link, a browser history, a leaked database dump —
 * can fetch a PAN card. The listing projection is careful never to include
 * `documents`, so they are not served to the public site, but the objects
 * themselves are not access-controlled.
 *
 * Making them properly private means uploading with `access_mode:
 * 'authenticated'` and serving signed URLs, which is a backend change. Until
 * then, treat these as sensitive and do not paste the URLs anywhere.
 *
 * @param {{kind: string, docType?: string, file: File}[]} items
 * @param {(stage: string) => void} [onStage]
 */
export const uploadPropertyDocuments = async (items = [], onStage = () => { }) => {
  const list = items.filter((item) => item && item.file);
  if (list.length === 0) return [];

  const out = [];
  for (let i = 0; i < list.length; i += 1) {
    const item = list[i];
    onStage(`Uploading document ${i + 1} of ${list.length}...`);

    const form = new FormData();
    form.append('image', item.file);

    // eslint-disable-next-line no-await-in-loop
    const data = await api.post('/properties/upload-image', form).then(ok).catch(fail);
    if (data?.success && data.url) {
      out.push({
        kind: item.kind,
        docType: item.docType || '',
        url: data.url,
        name: item.file.name || '',
      });
    }
  }
  return out;
};

/* ── Leads ─────────────────────────────────────────────────────────────── */

/**
 * Add a lead by hand.
 *
 * Goes to the leads panel's own v2 surface rather than the admin console's
 * route, because this site signs in as a `scriper_users` account — the same
 * identity the panel uses — and the console's create is Super-Admin-only.
 *
 * The lead is created UNASSIGNED on purpose: sales adds it here, an admin
 * hands it to a calling agent afterwards. A 409 back means the business is
 * already in the list, which is an answer worth showing rather than an error
 * to swallow — somebody may already be calling them.
 */
export const createLead = (lead) =>
  api.post('/scraper/leads', lead).then(ok).catch(fail);

/* ── Permissions ───────────────────────────────────────────────────────── */

export const ACTION_LABELS = {
  edit: 'Edit this listing',
  delete: 'Delete this listing',
};

/** Email of the employee whose rights are being resolved. */
export const activeEmployeeEmail = () =>
  getCurrentUser()?.email || getSavedEmployeeEmail() || '';

/**
 * What this employee may currently do with this listing. Returns a
 * `permissions` map keyed by action, each with `allowed` and the status of
 * the latest request, so the UI can explain *why* a button is locked.
 */
export const fetchPropertyAccess = (propertyId) => {
  const employeeEmail = activeEmployeeEmail();
  if (!propertyId || !employeeEmail) {
    return Promise.resolve({ success: false, error: 'Missing property or employee identity.' });
  }
  return api
    .get('/permissions/access', { params: { propertyId, employeeEmail } })
    .then(ok)
    .catch(fail);
};

/** Ask an administrator for permission. The record starts life as pending. */
export const requestPermission = ({ property, action, reason }) => {
  const employeeEmail = activeEmployeeEmail();
  if (!employeeEmail) {
    return Promise.resolve({ success: false, error: 'You must be signed in to request permission.' });
  }

  return api
    .post('/permissions', {
      propertyId: property._id,
      employeeEmail,
      action,
      reason,
      property: {
        name: property.name,
        place: property.place,
        category: property.category,
        ownerName: property.ownerName,
        ownerMobile: property.ownerMobile,
      },
    })
    .then(ok)
    .catch(fail);
};

/* ── Authentication ────────────────────────────────────────────────────── */

/**
 * Normalise whatever shape the backend replies with into one employee
 * object. The onboarding-login route has answered under several different
 * envelopes over its life and the screens should not know that.
 */
const readEmployee = (data, fallbackEmail) => {
  const raw = data?.data?.employee || data?.employee || data?.data?.user || data?.user || {};
  return {
    userId: raw.userId || raw.id || raw._id || `emp_${Date.now()}`,
    name: raw.name || (fallbackEmail ? fallbackEmail.split('@')[0] : 'Employee'),
    email: raw.email || fallbackEmail,
    role: raw.role || 'EMPLOYEE',
    avatar: raw.avatar || '',
  };
};

/** Sign a field agent in and store the session. */
export const loginUser = async ({ email, password }) => {
  const inputEmail = String(email || '').trim();
  console.info(`🔐 [api] POST ${API_BASE_URL}/auth/onboarding-login  (${inputEmail})`);

  const data = await api
    .post('/auth/onboarding-login', { email: inputEmail, password })
    .then(ok)
    .catch(fail);

  if (data?.success || data?.valid || data?.data?.token) {
    /*
     * No token, no session. This used to fall back to the literal string
     * `'session_token'`, which is the worst of both worlds: the app stores a
     * session and shows the agent signed in, and then every single request
     * carries `Bearer session_token` — which the API cannot decode, so it
     * answers 401 forever. A sign-in that visibly succeeded and then refused
     * to load anything is much harder to diagnose than one that simply says
     * it failed, which is what happens now.
     */
    const token = data.data?.token || data.token;
    if (!token) {
      console.warn('   ❌ sign-in returned no token');
      return {
        success: false,
        valid: false,
        error: 'Signed in, but the server did not issue a session token. Try again.',
      };
    }

    const employee = readEmployee(data, inputEmail);
    setAuthSession(token, employee);
    console.info(`   ✅ signed in: ${employee.name} (${employee.email})`);
    return { success: true, valid: true, token, user: employee, data: data.data || data };
  }

  console.warn('   ❌ sign-in refused:', data?.error || data?.message);
  return {
    success: false,
    valid: false,
    error: data?.error || data?.message || 'Invalid email or password.',
  };
};

/**
 * Create an account.
 *
 * This existed as an import in AuthModal long before it existed as a
 * function — the sign-up tab threw "registerUser is not a function" the
 * moment it was submitted. It posts to the same v2 auth router the login
 * does; whether self-registration is actually permitted is the backend's
 * call, and its refusal is surfaced rather than guessed at here.
 */
export const registerUser = async ({ name, email, mobile, password, role }) => {
  const inputEmail = String(email || '').trim();

  const data = await api
    .post('/auth/register', { name, email: inputEmail, mobile, password, role })
    .then(ok)
    .catch(fail);

  if (data?.success || data?.data?.token) {
    /* Same trap as `loginUser` — see the note there. */
    const token = data.data?.token || data.token;
    if (!token) {
      return {
        success: false,
        error: 'Account created, but the server did not issue a session token. Sign in to continue.',
      };
    }

    const employee = readEmployee(data, inputEmail);
    setAuthSession(token, employee);
    return { success: true, token, user: employee };
  }

  return { success: false, error: data?.error || data?.message || 'Failed to create account.' };
};

/* ── Restaurant onboarding ─────────────────────────────────────────────────
 *
 * The food-partner surface, written by a LAMPOSE EMPLOYEE rather than by the
 * restaurant.
 *
 * This is the same arrangement as the property form above: an onboarding agent
 * sits with the owner, fills the form in on their behalf, and the write is
 * authorised by the agent's own `scriper_users` token and attributed with
 * `x-employee-email`. The owner is never asked for a one-time code and never
 * asked to choose a password in front of the agent — the account is created
 * without a credential and cannot be signed into until one is set, which is
 * what `verifyPassword` returning false for a missing hash guarantees.
 *
 * WHAT IS UPLOADED, AND WHEN
 *
 * The PAN card and the FSSAI certificate go to Cloudinary BEFORE the
 * application is posted, because `POST /applications` stores a document row
 * only when it carries a URL — the backend refuses to record that a scan
 * exists on the strength of a file name. So the order is: upload the scans,
 * then post the form with what came back.
 *
 * They go to `/uploads/onboarding-images`, which is the staff-guarded twin of
 * the app's own `/uploads/images`. A separate route rather than a widened
 * guard: the food-partner upload accepts a restaurant's session or an owner's
 * phone proof, and neither is what an employee holds.
 */

/** One `File` to Cloudinary, as the `kind` the backend files it under. */
const uploadRestaurantFile = async ({ file, kind }) => {
  if (!file) return null;

  const form = new FormData();
  form.append('images', file);
  form.append('kind', kind);

  /* No `Authorization` here: the request interceptor puts the agent's staff
     token on it, which is exactly what this route's guard verifies. */
  const data = await api
    .post('/v2/food-partners/uploads/onboarding-images', form, { timeout: WRITE_TIMEOUT })
    .then(ok)
    .catch(fail);

  const first = data?.success && Array.isArray(data.data) ? data.data[0] : null;
  if (!first || !first.url) {
    const reason = data?.error || data?.message || 'the upload did not come back with a URL';
    throw new Error(`Could not upload the ${kind} file — ${reason}`);
  }

  return {
    url: first.url,
    publicId: first.publicId || first.public_id || '',
    fileName: first.fileName || file.name || '',
  };
};

/**
 * The whole application: the licences, the menu photographs and the form.
 *
 * Resolves like everything else in this file — to an object with `success` —
 * so the wizard branches on one thing. An upload that fails is reported as a
 * failure of the SUBMIT, with the file named, because that is what the agent
 * has to fix; nothing has been written at that point, so pressing the button
 * again is safe and is what the message asks for.
 *
 * @param {object} form        the wizard's state, already shaped by `buildApplicationPayload`
 * @param {(stage: string) => void} [onStage]
 */
/* ══════════════════════════════════════════════════════════════════════════
   Aadhaar mobile verification
   ══════════════════════════════════════════════════════════════════════════

   The restaurant form asks for the owner's Aadhaar and the mobile it is
   registered against, and will not let the agent past step 3 until a code
   sent to that mobile has been typed back. The owner is standing there; this
   is the one field on the form whose truth the agent cannot simply read off a
   card.

   REUSED, not rebuilt. `/v2/food-partners/auth/otp/start` and `/verify` are
   the public, rate-limited pair the Food-Partner app's own signup uses, and
   they already solve exactly this problem — prove a number before any account
   exists. A second implementation would be a second set of expiry, lock-out
   and resend rules to keep in step with the first.

   `verify` answers with a short-lived signed proof. It travels to
   `POST /applications` in the BODY, as `aadhaar.verificationToken`, because
   the Authorization header on that call already carries the AGENT's staff
   token — the application is signed by two identities at once and they cannot
   share one header. The backend re-checks the proof against the Aadhaar
   number on the application and stamps `aadhaar.verifiedAt` itself; nothing
   this file sends can set that field.
   ══════════════════════════════════════════════════════════════════════════ */

/** Send a one-time code to the Aadhaar-registered mobile. */
export const startAadhaarOtp = (phone) =>
  api.post('/v2/food-partners/auth/otp/start', { phone: String(phone || '').replace(/\D/g, '') })
    .then(ok)
    .catch(fail);

/** Check the code. On success `data.verificationToken` is the proof. */
export const verifyAadhaarOtp = ({ phone, otp }) =>
  api.post('/v2/food-partners/auth/otp/verify', {
    phone: String(phone || '').replace(/\D/g, ''),
    otp: String(otp || '').trim(),
  })
    .then(ok)
    .catch(fail);

export const submitRestaurantApplication = async (form, onStage = () => { }) => {
  try {
    /* ── 1. The licences ─────────────────────────────────────────────────── */

    /* Two scans, both mandatory on the form: the PAN card and the FSSAI
       certificate. The GST certificate and the cancelled cheque were dropped
       from the console — their NUMBERS are still collected and validated, but
       an agent standing in a kitchen is not going to be handed a bank
       statement, and a document row that names a file nobody uploaded is
       worse than no row (see `sanitiseApplication`). */
    const docJobs = [
      { kind: 'pan', file: form.files.pan, number: form.panNumber },
      { kind: 'fssai', file: form.files.fssai, number: form.fssaiNumber, expiry: form.fssaiExpiry },
    ].filter((job) => job.file);

    const verificationDocuments = [];
    for (let i = 0; i < docJobs.length; i += 1) {
      const job = docJobs[i];
      onStage(`Uploading ${job.kind.toUpperCase()} document (${i + 1} of ${docJobs.length})...`);
      // eslint-disable-next-line no-await-in-loop
      const uploaded = await uploadRestaurantFile({ file: job.file, kind: job.kind });
      verificationDocuments.push({
        kind: job.kind,
        number: job.number || '',
        expiry: job.expiry || null,
        url: uploaded.url,
        publicId: uploaded.publicId,
        fileName: uploaded.fileName,
      });
    }

    /* ── 2. The dish photographs ─────────────────────────────────────────── */

    /* Sent as `products` already flattened, so the two menu-building modes —
       typed categories and an uploaded sheet — converge here and the upload
       loop below does not have to know which one the agent used. */
    const products = form.products.slice();
    const withPhotos = products.filter((product) => product.photoFile);

    for (let i = 0; i < withPhotos.length; i += 1) {
      const product = withPhotos[i];
      onStage(`Uploading item photo ${i + 1} of ${withPhotos.length}...`);
      // eslint-disable-next-line no-await-in-loop
      const uploaded = await uploadRestaurantFile({ file: product.photoFile, kind: 'product' });
      product.productImage = { url: uploaded.url, publicId: uploaded.publicId };
    }

    /* ── 3. The application ──────────────────────────────────────────────── */

    onStage('Submitting the application...');

    const body = {
      ...form.restaurant,
      verificationDocuments,
      products: products.map(({ photoFile, ...product }) => product),
    };

    return await api
      .post('/v2/food-partners/applications', body, { timeout: WRITE_TIMEOUT })
      .then(ok)
      .catch(fail);
  } catch (error) {
    /* An upload threw rather than resolved, which is the one path in this
       function that is not already an `ok`/`fail` shape. Nothing was written,
       so it is safe to say so and safe to retry. */
    return {
      success: false,
      kind: 'upload',
      reached: false,
      error: error.message || 'A file could not be uploaded.',
    };
  }
};
