import { apiClient } from './apiClient';
import { clearSession, saveSession } from '../auth/session';

/* ══════════════════════════════════════════════════════════════════════════
   Signing in: a phone number and a code, and nothing else.

   The same account the mobile app signs into — `app_customers`, the same
   three endpoints, the same codes over the same DLT-registered SMS route.
   Somebody who asked for a visit on their phone and then opens the website on
   a laptop is the same person to us, and signing in on one does not create a
   second anybody.

   ## The version is written into the path

   `/customers` has no unversioned alias and deliberately never got one — see
   the header of `Backend/routes/index.js`. `/listings` and `/visit-requests`
   above are the legacy spellings kept working for callers that predate
   versioning; a new one gets the explicit path.

   ## The website says what it is, and the server decides the life

   `client: 'web'` on the verify call. It buys `auth.webJwtExpiresIn`, which is
   the single knob for how long a browser stays signed in and today equals the
   app's week — so somebody who signs in here is still signed in next time,
   the same way the app behaves. The claim set is identical either way; only
   the life is the server's to choose, and the page never guesses it.

   ## Failures are the server's sentences

   Every refusal here is something the visitor can act on: a wrong code, a
   cooldown, a locked code. The backend has already written the sentence and
   carries the machine-readable half on `code`, so both travel through
   untouched rather than being flattened into "something went wrong".
   ══════════════════════════════════════════════════════════════════════════ */

export class AuthError extends Error {
  constructor(message, { code = null, status = null, retryAfter = null, attemptsLeft = null, unlocksAt = null } = {}) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
    this.attemptsLeft = attemptsLeft;
    this.unlocksAt = unlocksAt;
  }
}

const wrap = err => {
  if (err instanceof AuthError) return err;

  /* No response at all — the one case the backend cannot narrate for us. */
  if (err?.name === 'TypeError' || /failed to fetch|networkerror|load failed/i.test(err?.message || '')) {
    return new AuthError(
      'We could not reach Lampose. Check your connection and try again.',
      { code: 'NETWORK' },
    );
  }

  const body = err?.body || {};
  return new AuthError(err?.message || 'Something went wrong. Please try again.', {
    code: err?.code || body.code || null,
    status: err?.status ?? null,
    retryAfter: body.retryAfter ?? null,
    attemptsLeft: body.attemptsLeft ?? null,
    unlocksAt: body.unlocksAt ?? null,
  });
};

/** The envelope every v2 route answers with. */
const unwrap = res => res?.data ?? res;

const customerAuthApi = {
  /**
   * A number in, an SMS out.
   *
   * The reply carries the masked number to print above the code box, how many
   * digits to expect, the cooldown and the attempt allowance — all from the
   * server, because the server is what enforces them. A page that decided its
   * own cooldown would either be stricter than necessary or ask for a code
   * that gets refused.
   */
  async start(phone) {
    try {
      return unwrap(await apiClient.post('/v2/customers/auth/start', { phone }));
    } catch (err) {
      throw wrap(err);
    }
  },

  async resend(phone) {
    try {
      return unwrap(await apiClient.post('/v2/customers/auth/resend', { phone }));
    } catch (err) {
      throw wrap(err);
    }
  },

  /**
   * The code, and the session it opens.
   *
   * `name` rides along on this same call rather than a later one: the server
   * applies it only after the code is correct, so a profile written when the
   * code was REQUESTED would let anybody rename a stranger's account by typing
   * their number into a form. It only ever fills a blank — signing in again
   * never wipes a name that is already there.
   */
  async verify({ phone, otp, name }) {
    try {
      const session = unwrap(await apiClient.post('/v2/customers/auth/verify', {
        phone,
        otp,
        ...(name?.trim() ? { name: name.trim() } : null),
        client: 'web',
      }));
      saveSession(session);
      return session;
    } catch (err) {
      throw wrap(err);
    }
  },

  /**
   * Who the stored token belongs to, according to the server.
   *
   * The only thing that can tell a live session from one the server has
   * finished with: a JWT's own `exp` says nothing about an account that was
   * blocked, deleted, or signed out everywhere (`ver`). `apiClient` already
   * drops the session on a 401, so a caller only has to decide what to draw.
   */
  async me() {
    try {
      return unwrap(await apiClient.get('/v2/customers/me'));
    } catch (err) {
      throw wrap(err);
    }
  },

  /**
   * The name on the account.
   *
   * Behind the session, so it is only callable once a code has been checked —
   * which is the point: this is the panel that confirms a name AFTER signing
   * in, and an endpoint that could set one without a session would be a way
   * to rename a stranger.
   *
   * An empty name is refused by the server rather than stored: owners see it
   * on a request, and "" on a request is a request nobody can answer.
   */
  async updateName(name) {
    try {
      return unwrap(await apiClient.patch('/v2/customers/me', { name }));
    } catch (err) {
      throw wrap(err);
    }
  },

  /**
   * Local only, and there is no endpoint to call.
   *
   * The token is a stateless JWT — nothing server-side is tracking this one,
   * so there is nothing to revoke and a round trip would be theatre. Worth
   * knowing if "sign out everywhere" is ever wanted on the web: the account
   * carries a `sessionVersion` and bumping it is what does that.
   */
  signOut() {
    clearSession();
  },
};

export default customerAuthApi;
