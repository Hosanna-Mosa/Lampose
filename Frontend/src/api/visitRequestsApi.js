import { apiClient } from './apiClient';

/* ══════════════════════════════════════════════════════════════════════════
   Visit requests.

   Unlike the listings service, a failure here is nearly always something the
   visitor can act on — a wrong code, a number they mistyped, a request they
   already made today. So the API's own `message` and `code` are carried
   through verbatim rather than being reclassified into "the server is down":
   the backend has already written the sentence the form should show.
   ══════════════════════════════════════════════════════════════════════════ */

export class VisitRequestError extends Error {
  constructor(message, { code = null, status = null, retryAfter = null, attemptsLeft = null } = {}) {
    super(message);
    this.name = 'VisitRequestError';
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
    this.attemptsLeft = attemptsLeft;
  }
}

const wrap = err => {
  if (err instanceof VisitRequestError) return err;

  // No response at all — the one case the backend cannot narrate for us.
  if (err?.name === 'TypeError' || /failed to fetch|networkerror|load failed/i.test(err?.message || '')) {
    return new VisitRequestError(
      'We could not reach Lampose. Check your connection and try again.',
      { code: 'NETWORK' }
    );
  }

  return new VisitRequestError(
    err?.message || 'Something went wrong. Please try again.',
    {
      code: err?.code || err?.body?.code || null,
      status: err?.status ?? null,
      retryAfter: err?.body?.retryAfter ?? null,
      attemptsLeft: err?.body?.attemptsLeft ?? null,
    }
  );
};

export const visitRequestsApi = {
  /** Start a request. Sends a code to the visitor; the owner is not told yet. */
  async start({
    listingId, name, phone, email, sharing, intent, consentedTerms, consentWhatsApp,
  }) {
    try {
      const res = await apiClient.post('/visit-requests', {
        listingId, name, phone, email, sharing, intent, consentedTerms, consentWhatsApp,
      });
      return res.data;
    } catch (err) {
      throw wrap(err);
    }
  },

  /** Check the code. On success the owner has been messaged. */
  async verify(id, otp) {
    try {
      const res = await apiClient.post(`/visit-requests/${id}/verify`, { otp });
      return res.data;
    } catch (err) {
      throw wrap(err);
    }
  },

  async resend(id) {
    try {
      const res = await apiClient.post(`/visit-requests/${id}/resend`);
      return res.data;
    } catch (err) {
      throw wrap(err);
    }
  },

  /** Polled by the waiting card. */
  async status(id) {
    try {
      const res = await apiClient.get(`/visit-requests/${id}`);
      return res.data;
    } catch (err) {
      throw wrap(err);
    }
  },
};

export default visitRequestsApi;
