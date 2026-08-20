/* ══════════════════════════════════════════════════════════════════════════
   The visitor's session.

   One day long, and opened as a side effect of proving a phone number on a
   visit request — there is no sign-in screen on this site and no password
   anywhere in it. The whole purpose is that the SECOND request costs no SMS:
   the first one verifies a code, and for the next day the same browser is
   already known.

   Stored in `localStorage` rather than a cookie because the API is a separate
   origin and the token travels in an `Authorization` header, not on the
   request automatically. That choice is why the life is a day rather than the
   app's week — see the note beside `webJwtExpiresIn` on the server.

   Nothing here is trusted for anything. It decides what the page DRAWS; every
   answer that matters is re-checked by the server against the database on
   each request. A tampered blob gets a 401 and lands the visitor back on the
   form, which is exactly where a signed-out visitor belongs.
   ══════════════════════════════════════════════════════════════════════════ */

const KEY = 'lampose.session';

/* Signed out a minute early. A token that expires between the check and the
   request arriving reads to the visitor as the form failing for no reason;
   they would rather be asked for a code than shown an error. */
const SKEW_MS = 60 * 1000;

/** The `exp` claim, in ms, without verifying anything — the server does that. */
const expiryOf = (token) => {
  try {
    const [, payload] = String(token).split('.');
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof claims.exp === 'number' ? claims.exp * 1000 : 0;
  } catch {
    return 0;
  }
};

/**
 * The live session, or null.
 *
 * Anything unreadable, unparseable or expired is cleared on the way out, so a
 * corrupt entry fixes itself on the next page load instead of throwing on
 * every render.
 */
export const getSession = () => {
  let raw;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return null;   // private mode, or storage disabled entirely
  }
  if (!raw) return null;

  try {
    const session = JSON.parse(raw);
    if (!session || typeof session.token !== 'string') throw new Error('shape');
    if (expiryOf(session.token) - SKEW_MS <= Date.now()) throw new Error('expired');
    return session;
  } catch {
    clearSession();
    return null;
  }
};

export const isSignedIn = () => getSession() !== null;

/** What the form shows instead of asking again: who we think you are. */
export const sessionUser = () => {
  const session = getSession();
  return session ? session.customer || null : null;
};

/**
 * Keep the session handed back by a verified request.
 *
 * Silently does nothing when there is no token — the server returns
 * `session: null` when auth is unconfigured or the number is blocked, and
 * neither is a reason to break the visit request that just succeeded.
 */
export const saveSession = (session) => {
  if (!session || !session.token) return null;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({
      token: session.token,
      customer: session.customer || null,
    }));
  } catch {
    /* Storage full or blocked. The request still went through; the visitor
       just enters a code again next time. */
    return null;
  }
  return session;
};

export const clearSession = () => {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* nothing to do — there is no state to fix if we cannot reach storage */
  }
};

/** For the request header. Empty object when signed out, so it spreads away. */
export const authHeader = () => {
  const session = getSession();
  return session ? { Authorization: `Bearer ${session.token}` } : {};
};
