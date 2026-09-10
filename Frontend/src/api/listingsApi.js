import { apiClient, API_BASE_URL } from './apiClient';

/* ══════════════════════════════════════════════════════════════════════════
   Listings service.

   There is no local fallback. A bundled snapshot standing in for the database
   is worse than an error: the page looks like it is working, so a dead API,
   a blocked origin or a disconnected database all read as "these are the
   listings" — which is how a stale grid went unnoticed. Every failure here
   is raised, classified, and shown.
   ══════════════════════════════════════════════════════════════════════════ */

/* Why the request failed, in the terms the visitor needs:
     offline  — the browser has no network at all
     server   — nothing answered at the API origin (down, wrong port, CORS)
     database — the server answered, but it cannot reach MongoDB
     api      — the server answered with some other error
   `fetch` rejects with a TypeError for a network failure *and* for a CORS
   rejection; the browser will not tell a script which, so both land on
   `server` and the message names the API it could not reach. */
export class ListingsError extends Error {
  constructor(kind, message, { status = null, cause = null } = {}) {
    super(message);
    this.name = 'ListingsError';
    this.kind = kind;
    this.status = status;
    this.endpoint = API_BASE_URL;
    this.cause = cause;
  }
}

const classify = err => {
  if (err instanceof ListingsError) return err;

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return new ListingsError('offline',
      'Your device is offline, so the listings could not be requested.',
      { cause: err });
  }

  if (err?.name === 'TypeError' || /failed to fetch|networkerror|load failed/i.test(err?.message || '')) {
    return new ListingsError('server',
      `No response from the API at ${API_BASE_URL}. The backend may be stopped, `
      + 'listening on a different port, or refusing this origin.',
      { cause: err });
  }

  if (err?.code === 'DB_DISCONNECTED' || err?.status === 503) {
    return new ListingsError('database',
      err.message || 'The server is running but not connected to the database.',
      { status: err.status ?? 503, cause: err });
  }

  return new ListingsError('api',
    err?.message || 'The listings service returned an error.',
    { status: err?.status ?? null, cause: err });
};

/**
 * The categories this site is willing to show.
 *
 * This site used to ask for everything and let `data/categories.js` derive the
 * tabs from whatever came back — which was right while every row in the
 * collection was a place to live. The onboarding panel can now file a shop, an
 * office or a godown under COMMERCIAL, and left alone this page would grow a
 * tab labelled "COMMERCIAL" full of premises nobody can rent a bed in.
 *
 * Stated positively rather than as an exclusion list, so a future non-stay
 * category is left out by default instead of appearing here until somebody
 * remembers to add it. The codes are defined in
 * Backend/src/shared/constants/categories.js.
 */
const STAY_CATEGORIES = 'PG_HOSTEL,BACHELOR,HOTEL,COLIVE';

export const listingsApi = {
  /**
   * Fetch every STAY listing in the database, newest first.
   * Throws a ListingsError — never substitutes local data.
   */
  async getListings(params = {}) {
    try {
      /* A caller that names its own category wins: the category pages pass one
         and must keep getting exactly it. This only fills in the default. */
      const response = await apiClient.get('/listings', { category: STAY_CATEGORIES, ...params });
      const rows = Array.isArray(response?.data) ? response.data
        : Array.isArray(response) ? response
          : null;
      if (!rows) {
        throw new ListingsError('api',
          'The listings service responded in an unexpected format.');
      }
      return rows;
    } catch (err) {
      throw classify(err);
    }
  },

  /**
   * Fetch a single listing by ID.
   * Returns null when the listing genuinely does not exist; throws otherwise.
   */
  async getListingById(id) {
    try {
      const response = await apiClient.get(`/listings/${id}`);
      if (response?.data) return response.data;
      if (response?.id) return response;
      throw new ListingsError('api',
        'The listings service responded in an unexpected format.');
    } catch (err) {
      if (err?.status === 404) return null;
      throw classify(err);
    }
  },

  /**
   * Ask the backend which link is broken. Used only to sharpen an error the
   * page is already showing, so it never throws — an unreachable health probe
   * simply means the diagnosis stands as it was.
   */
  async diagnose() {
    try {
      const res = await fetch(`${API_BASE_URL}/health`);
      const body = await res.json().catch(() => ({}));
      if (body?.database) {
        return body.database.connected ? 'api' : 'database';
      }
      return res.ok ? 'api' : 'server';
    } catch {
      return 'server';
    }
  },
};

export default listingsApi;
