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
const DEV_FALLBACK = 'http://localhost:5001/api';

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
export const uploadPropertyImages = async (items = [], onStage = () => {}) => {
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
export const uploadPropertyDocuments = async (items = [], onStage = () => {}) => {
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
    const token = data.data?.token || data.token || 'session_token';
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
    const token = data.data?.token || data.token || 'session_token';
    const employee = readEmployee(data, inputEmail);
    setAuthSession(token, employee);
    return { success: true, token, user: employee };
  }

  return { success: false, error: data?.error || data?.message || 'Failed to create account.' };
};
