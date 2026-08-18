/* ══════════════════════════════════════════════════════════════════════════
   The signed-in field agent's session — and nothing else.

   This file used to also OWN AN API URL: a hardcoded
   `https://api.leads.lampose.com/api/auth/onboarding-login`, overridable
   per-browser through a localStorage key that a "Configure" box in the login
   modal wrote to. That is why production CORS was unfixable from the server
   side: two agents on the same build could be posting to two different hosts,
   neither of them the host the rest of the site used, and no allowlist entry
   could cover a value that lived in someone's browser.

   The network half now lives in services/api.js, which derives every URL from
   the single VITE_API_BASE_URL. What is left here is storage: read and write
   the token and the employee profile. It imports nothing from api.js, which
   is what keeps the two from forming a cycle.
   ══════════════════════════════════════════════════════════════════════════ */

const STORAGE_TOKEN_KEY = 'lampose_auth_token';
const STORAGE_USER_KEY = 'lampose_auth_user';
const STORAGE_EMP_EMAIL_KEY = 'lampose_employee_email';

/* The key the old per-browser override was kept under. Cleared on load
   rather than merely ignored: a browser that still holds it is a browser
   that was pinned to the wrong host, and leaving the value behind means the
   next person to debug this finds it in devtools and reasonably concludes it
   is still in use. */
const LEGACY_AUTH_URL_KEY = 'lampose_custom_auth_url';
try {
  if (localStorage.getItem(LEGACY_AUTH_URL_KEY)) {
    console.info('[auth] clearing the old per-browser auth URL override; the API base URL now comes from .env');
    localStorage.removeItem(LEGACY_AUTH_URL_KEY);
  }
} catch {
  /* Storage can be unavailable in a private window; nothing here is essential. */
}

/** Saved JWT/session token, or null. */
export function getAuthToken() {
  return localStorage.getItem(STORAGE_TOKEN_KEY) || null;
}

/** The employee email, even when the profile object did not survive. */
export function getSavedEmployeeEmail() {
  return localStorage.getItem(STORAGE_EMP_EMAIL_KEY) || '';
}

/** The signed-in employee profile, or null. */
export function getCurrentUser() {
  try {
    const raw = localStorage.getItem(STORAGE_USER_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && !parsed.email) {
      parsed.email = localStorage.getItem(STORAGE_EMP_EMAIL_KEY) || '';
    }
    return parsed;
  } catch (error) {
    console.error('Failed to parse saved user profile:', error);
    return null;
  }
}

/** Store the token and employee profile after a successful sign-in. */
export function setAuthSession(token, employee) {
  if (token) localStorage.setItem(STORAGE_TOKEN_KEY, token);
  if (employee) {
    localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(employee));
    if (employee.email) {
      localStorage.setItem(STORAGE_EMP_EMAIL_KEY, employee.email);
    }
  }
}

/** Clear the session on logout. */
export function logout() {
  localStorage.removeItem(STORAGE_TOKEN_KEY);
  localStorage.removeItem(STORAGE_USER_KEY);
  localStorage.removeItem(STORAGE_EMP_EMAIL_KEY);
}
