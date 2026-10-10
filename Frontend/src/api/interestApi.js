import { apiClient } from './apiClient';

/* ══════════════════════════════════════════════════════════════════════════
   "Notify me when it is launched" — `POST /api/v2/interest`.

   The address lands in the leads panel as a `source: 'Website'` lead, so a
   sign-up reaches the people who follow leads up. The endpoint answers the
   same way for an address already on the list, and is rate-limited per IP
   (5 an hour), so a 429 is a real answer a visitor can see.

   `page` is where the form was shown: 'food-partner' or
   'food-partner-onboarding'.
   ════════════════════════════════════════════════════════════════════════ */

const friendlyMessage = err => {
  if (err?.name === 'TypeError' || /failed to fetch|networkerror|load failed/i.test(err?.message || '')) {
    return 'We could not reach Lampose. Check your connection and try again.';
  }
  if (err?.status === 429) {
    return err?.body?.message || 'Too many sign-ups from this connection. Please try again later.';
  }
  if (err?.status === 503) {
    return 'Sign-ups are briefly unavailable. Please try again in a few minutes.';
  }
  return err?.body?.error || err?.body?.message || 'Something went wrong. Please try again.';
};

export const interestApi = {
  async signUp(email, page) {
    try {
      return await apiClient.post('/v2/interest', { email: email.trim(), page });
    } catch (err) {
      const error = new Error(friendlyMessage(err));
      error.status = err?.status ?? null;
      error.code = err?.code || null;
      throw error;
    }
  },
};

export default interestApi;
