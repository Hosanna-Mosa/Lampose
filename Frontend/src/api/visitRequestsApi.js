import { apiClient } from './apiClient';
import { saveSession } from '../auth/session';

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
  /**
   * Start a request.
   *
   * Sends a code to the visitor; the owner is not told yet. When the browser
   * holds a session for the same number, the server skips the code and
   * answers `otpRequired: false` — carried through on the returned object so
   * the dialog knows whether to ask for one.
   */
  async start({
    listingId, name, phone, email, sharing, intent, consentedTerms, consentWhatsApp,
  }) {
    try {
      const res = await apiClient.post('/visit-requests', {
        listingId, name, phone, email, sharing, intent, consentedTerms, consentWhatsApp,
      });
      return { ...res.data, otpRequired: res.otpRequired !== false };
    } catch (err) {
      throw wrap(err);
    }
  },

  /**
   * Tell the owner.
   *
   * With a code when one was sent, without when the session already proved
   * the number — the server checks a code only if the request is not verified
   * yet, so the same call serves both. A session comes back on success and is
   * kept, which is what makes the NEXT request skip the code.
   */
  async verify(id, otp) {
    try {
      const res = await apiClient.post(`/visit-requests/${id}/verify`, otp ? { otp } : {});
      saveSession(res.session);
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

  /* ── The ₹199 assisted visit ────────────────────────────────────────────
     Bachelor and co-live only, and the one payment on the flow. The owner
     confirms, the customer pays ₹199 (₹100 representative + ₹99 Lampose
     fee), then picks the slot ON WHATSAPP — the site never takes the slot,
     so a customer who paid via the WhatsApp link and one who paid here have
     the same next step.

     Nothing here is trusted by the server on the client's word: the order is
     created server-side and the callback is verified against an HMAC only the
     server can compute. A browser saying "it worked" proves nothing. */

  /** Start the ₹199 checkout. Returns the order plus the publishable key id. */
  async startVisitPayment(id) {
    try {
      const res = await apiClient.post(`/visit-requests/${id}/payment/order`);
      return { ok: true, data: res?.data ?? res };
    } catch (error) {
      return { ok: false, code: error?.code, message: error?.message };
    }
  },

  /** Hand Razorpay's values back for checking. */
  async confirmVisitPayment(id, { razorpayPaymentId, razorpaySignature }) {
    try {
      const res = await apiClient.post(`/visit-requests/${id}/payment/verify`, {
        razorpayPaymentId,
        razorpaySignature,
      });
      return { ok: true, data: res?.data ?? res };
    } catch (error) {
      return { ok: false, code: error?.code, message: error?.message };
    }
  },
};

export default visitRequestsApi;
