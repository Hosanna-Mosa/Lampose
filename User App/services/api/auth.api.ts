import { api, unwrap, type ApiEnvelope } from './client';
import { endpoints } from './endpoints';
import type { BackendCustomer, BackendOtpChallenge, BackendSession } from './types';

/**
 * Sign in, sign up, and the profile behind them.
 *
 * ## They are the same two calls
 *
 * `startAuth` then `verifyAuth`. A number the server has seen before signs
 * in; one it has not creates an account. The app knows which tab the student
 * pressed and uses it to choose the words — the server does not need telling,
 * and does not answer whether a number is already known. An endpoint that
 * reported that would be a way to test a list of numbers against Lampose's
 * customer base.
 *
 * ## The token is not returned to the caller to pass around
 *
 * `verifyAuth` hands back a session, and `AuthContext` pushes it into the
 * client with `setAuthToken` — after which every other call in the app
 * carries it without asking. See the note on `authToken` in client.ts.
 *
 * ## `token: null` on the auth calls
 *
 * Explicit, and it matters. Verifying a code while a dead token is still in
 * memory would send an Authorization header the server then has to ignore,
 * and a 401 from it would trip the session-expired handler in the middle of
 * signing in.
 */

/* ------------------------------------------------------------------ *
 * The code
 * ------------------------------------------------------------------ */

export type StartAuthInput = {
  /** Ten digits or E.164. The server normalises and rejects non-mobiles. */
  phone: string;
  signal?: AbortSignal;
};

/**
 * A number in, an SMS out.
 *
 * The reply carries the masked number to show above the code boxes, how many
 * digits to draw, and the cooldown — all from the server, because the server
 * is what enforces them. A client that decided its own cooldown would either
 * be stricter than necessary or ask for a code that gets refused.
 */
export async function startAuth({ phone, signal }: StartAuthInput): Promise<BackendOtpChallenge> {
  const envelope = await api.post<ApiEnvelope<BackendOtpChallenge>>(
    endpoints.customerAuthStart,
    { phone },
    { signal, token: null },
  );
  return unwrap(envelope);
}

export async function resendAuthCode(phone: string, signal?: AbortSignal): Promise<BackendOtpChallenge> {
  const envelope = await api.post<ApiEnvelope<BackendOtpChallenge>>(
    endpoints.customerAuthResend,
    { phone },
    { signal, token: null },
  );
  return unwrap(envelope);
}

/* ------------------------------------------------------------------ *
 * The session
 * ------------------------------------------------------------------ */

export type VerifyAuthInput = {
  phone: string;
  otp: string;
  /**
   * The sign-up fields, sent on the same call that proves the number.
   *
   * They are applied server-side only after the code is correct — a profile
   * written when the code was requested would let anyone rename a stranger's
   * account by typing their number into a sign-up form. Absent fields are
   * left alone rather than blanked, so signing in again never wipes a name.
   */
  name?: string;
  email?: string;
  /** Mirrored off the device so a reinstall does not re-ask the entry question. */
  category?: string | null;
  signal?: AbortSignal;
};

export async function verifyAuth({
  phone,
  otp,
  name,
  email,
  category,
  signal,
}: VerifyAuthInput): Promise<BackendSession> {
  const envelope = await api.post<ApiEnvelope<BackendSession>>(
    endpoints.customerAuthVerify,
    {
      phone,
      otp,
      /* Only sent when there is something to send. An empty string is a value
         the server would have to decide what to do with; absent is not. */
      ...(name?.trim() ? { name: name.trim() } : null),
      ...(email?.trim() ? { email: email.trim() } : null),
      ...(category ? { category } : null),
    },
    { signal, token: null },
  );
  return unwrap(envelope);
}

/* ------------------------------------------------------------------ *
 * The profile
 * ------------------------------------------------------------------ */

/**
 * Who the stored token belongs to.
 *
 * Called once on launch to revalidate a restored session against the server,
 * which is the only thing that knows whether it is still good.
 */
export async function fetchMe(signal?: AbortSignal): Promise<BackendCustomer> {
  const envelope = await api.get<ApiEnvelope<BackendCustomer>>(endpoints.customerMe, { signal });
  return unwrap(envelope);
}

export type UpdateMeInput = {
  name?: string;
  /** An empty string clears it — this is the editor, and removing is an edit. */
  email?: string;
  category?: string;
  signal?: AbortSignal;
};

export async function updateMe({ signal, ...patch }: UpdateMeInput): Promise<BackendCustomer> {
  const envelope = await api.patch<ApiEnvelope<BackendCustomer>>(
    endpoints.customerMe,
    patch,
    { signal },
  );
  return unwrap(envelope);
}
