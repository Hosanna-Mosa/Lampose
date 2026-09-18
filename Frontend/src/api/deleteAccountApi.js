import { apiClient } from './apiClient';

/* ══════════════════════════════════════════════════════════════════════════
   "Delete my Lampose Delivery Partner account", from the open web.

   Two calls, and a one-time code between them:

     start    a number in, a code out by SMS
     confirm  the code back, and the account is marked for deletion

   The code is the whole point. This page is public — Google Play requires
   that a rider be able to ask for deletion without the app and without
   signing in — so the only thing the form can be given is a phone number,
   and a phone number is a string somebody typed. Nothing is marked until a
   code sent to that handset comes back.

   Nothing here carries a token, a key or a secret, and nothing needs to: the
   endpoints are open by design and hold nothing worth stealing. The only
   thing they will ever say about a number is the same sentence they say about
   every number.
   ════════════════════════════════════════════════════════════════════════ */

export class DeleteAccountError extends Error {
  constructor(message, { code = null, status = null } = {}) {
    super(message);
    this.name = 'DeleteAccountError';
    this.code = code;
    this.status = status;
  }
}

const wrap = err => {
  if (err instanceof DeleteAccountError) return err;

  if (err?.name === 'TypeError' || /failed to fetch|networkerror|load failed/i.test(err?.message || '')) {
    return new DeleteAccountError(
      'We could not reach Lampose. Check your connection and try again.',
      { code: 'NETWORK' },
    );
  }

  return new DeleteAccountError(err?.message || 'Something went wrong. Please try again.', {
    code: err?.code || err?.body?.code || null,
    status: err?.status ?? null,
  });
};

const unwrap = res => res?.data ?? res;

const BASE = '/v2/drivers/account/deletion';

export const deleteAccountApi = {
  /**
   * The numbers the page prints, from the server that enforces them.
   *
   * Asked for rather than written into the copy: a page promising 30 days
   * against a server that waits 14 is the disagreement worth one request to
   * prevent. A failure here is not worth showing anybody — the page falls
   * back to the same figures and carries on.
   */
  async policy() {
    try {
      return unwrap(await apiClient.get(`${BASE}/policy`));
    } catch (err) {
      throw wrap(err);
    }
  },

  /**
   * Send the code.
   *
   * The reply is identical whether or not the number is registered, so there
   * is nothing here to branch on and nothing to report back about whose number
   * it is. `alreadyRequested` is the exception, and it is only ever true for
   * somebody who has already proved this number once.
   */
  async start(phone) {
    try {
      return unwrap(await apiClient.post(`${BASE}/start`, { phone }));
    } catch (err) {
      throw wrap(err);
    }
  },

  /** The code back, plus the optional things the form collected. */
  async confirm({ phone, code, email, reason }) {
    try {
      return unwrap(await apiClient.post(`${BASE}/confirm`, {
        phone,
        code,
        ...(email?.trim() ? { email: email.trim() } : null),
        ...(reason?.trim() ? { reason: reason.trim() } : null),
      }));
    } catch (err) {
      throw wrap(err);
    }
  },
};

export default deleteAccountApi;
