/* ══════════════════════════════════════════════════════════════════════════
   The visitor's session.

   The JWT the server issued, and a copy of the customer it belongs to, kept
   the way the mobile app keeps its own: one entry, written once, read on
   every page load so somebody who signed in last week is still signed in.

   Opened two ways, and they are the same session either way — signing in from
   the bar (`auth/AuthProvider.jsx`), or proving a number on a visit request,
   which is the only way this site had before there was a sign-in screen. Both
   end in `saveSession`, both last `auth.webJwtExpiresIn`, and neither creates
   a second identity: it is one `app_customers` account, the same one the
   phone app signs into.

   Stored in `localStorage` rather than a cookie because the API is a separate
   origin and the token travels in an `Authorization` header rather than
   riding along automatically. That is also why signing out matters more here
   than on a phone — `localStorage` outlives the tab, so the bar carries a
   Sign out and it is one tap.

   Nothing here is trusted for anything. It decides what the page DRAWS; every
   answer that matters is re-checked by the server against the database on
   each request. A tampered blob gets a 401, which `apiClient` turns into a
   cleared session and a signed-out bar, which is exactly where a visitor
   holding a token the server will not take belongs.
   ══════════════════════════════════════════════════════════════════════════ */

const KEY = 'lampose.session';

/* ------------------------------------------------------------------ *
 * Who to tell when it changes
 * ------------------------------------------------------------------ */

/*
 * Every write to the session goes through `saveSession` or `clearSession`, so
 * this is the one place that can say "it changed" — and the bar, the visit
 * dialog and anything else drawn from a session all have to hear it.
 *
 * Without this they drifted, and the drift was visible: the visit dialog used
 * to call `clearSession()` on "Not you?", which emptied storage while the
 * navbar went on showing the name until the next page load. Adding a
 * subscriber per symptom would have fixed one screen at a time; the writes
 * are what every symptom has in common.
 *
 * Fired in a microtask rather than inline. `getSession` clears a corrupt or
 * expired entry as it reads, and components read it while rendering — a
 * listener that called `setState` synchronously from there would be updating
 * one component during another's render.
 */
const listeners = new Set();

const announce = () => {
  queueMicrotask(() => {
    listeners.forEach((listener) => {
      try {
        listener();
      } catch {
        /* One bad subscriber must not stop the others hearing about it. */
      }
    });
  });
};

/** Listen for sign-in, sign-out and expiry. Returns the unsubscribe. */
export const onSessionChange = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

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
    announce();
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
  /* Outside the try: storage being unreachable does not make it less true
     that this browser is now signed out, and the bar still has to say so. */
  announce();
};

/** For the request header. Empty object when signed out, so it spreads away. */
export const authHeader = () => {
  const session = getSession();
  return session ? { Authorization: `Bearer ${session.token}` } : {};
};
