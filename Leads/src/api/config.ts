// Centralized environment-driven API configuration.
// All base URLs are derived from VITE_API_URL (see frontend/.env).

const API_URL = import.meta.env.VITE_API_URL || '/api';

// Root of the backend API, e.g. http://localhost:5000/api (trailing slash stripped)
export const API_URL_ROOT = API_URL.replace(/\/+$/, '');

export const SCRAPER_BASE = `${API_URL_ROOT}/scraper`;
export const AUTH_BASE = `${API_URL_ROOT}/auth`;
export const USERS_BASE = `${API_URL_ROOT}/users`;
export const PROPERTIES_BASE = `${API_URL_ROOT}/properties`;

