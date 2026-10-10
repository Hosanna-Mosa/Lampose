// Centralized environment-driven API configuration.
// All base URLs are derived from VITE_API_URL (see frontend/.env).

const API_URL = import.meta.env.VITE_API_URL || '/api';

// Root of the backend API, e.g. http://localhost:5000/api (trailing slash stripped)
export const API_URL_ROOT = API_URL.replace(/\/+$/, '');

export const SCRAPER_BASE = `${API_URL_ROOT}/scraper`;
export const AUTH_BASE = `${API_URL_ROOT}/auth`;
export const USERS_BASE = `${API_URL_ROOT}/users`;
/* Properties are the one resource that must be addressed by VERSION. The
   unversioned `/api/properties` alias is v1 — the onboarding chain, which
   WhatsApps the owner and writes nothing until they reply — while this
   panel's form is the v2 direct write. `/auth`, `/users` and `/scraper`
   alias to v2, so they are safe either way; this path is spelled out so it
   reaches v2 whether VITE_API_URL ends in `/api` or `/api/v2`. */
export const PROPERTIES_PATH = /\/v2$/.test(API_URL_ROOT) ? '/properties' : '/v2/properties';
export const PROPERTIES_BASE = `${API_URL_ROOT}${PROPERTIES_PATH}`;

