import { api, unwrap, type ApiEnvelope } from './client';
import { endpoints } from './endpoints';
import type {
  BackendOtpChallenge, BackendPartner, BackendPartnerSession, PartnerAddress,
} from './types';

/**
 * Register, log in, and the profile behind them.
 *
 * ## They are the same two calls
 *
 * A number Lampose has seen before signs in; one it has not creates an account.
 * There is no separate `register` function here and there is not going to be
 * one — the server deliberately never reports which case it is, because an
 * endpoint that did would let anybody test a list of numbers against Lampose's
 * owners. The app picks its wording from the screen the person is on.
 *
 * ## The profile is sent with the code, or after it — never before
 *
 * `verifyAuth` takes an optional name and email so a registration can be
 * completed in one round trip. The server applies them only once the code is
 * correct. Anything sent before that point would let somebody rename a
 * stranger's account by typing their number into a form.
 */

export type StartAuthInput = { phone: string };

/**
 * A number in, a code out by SMS.
 *
 * `token: null` is deliberate on all three auth calls: it sends no
 * Authorization header at all. Proving a number while a dead session is still
 * in memory should not carry that session — the server would accept it and the
 * two identities would be confused for one.
 */
export async function startAuth(
  input: StartAuthInput,
  signal?: AbortSignal,
): Promise<BackendOtpChallenge> {
  const envelope = await api.post<ApiEnvelope<BackendOtpChallenge>>(
    endpoints.partnerAuthStart,
    { phone: input.phone },
    { signal, token: null },
  );
  return unwrap(envelope);
}

export async function resendAuthCode(
  input: StartAuthInput,
  signal?: AbortSignal,
): Promise<BackendOtpChallenge> {
  const envelope = await api.post<ApiEnvelope<BackendOtpChallenge>>(
    endpoints.partnerAuthResend,
    { phone: input.phone },
    { signal, token: null },
  );
  return unwrap(envelope);
}

export type VerifyAuthInput = {
  phone: string;
  otp: string;
  /** Registration only. Absent on a sign-in, and absence never clears a field. */
  name?: string;
  email?: string;
  businessName?: string;
};

export async function verifyAuth(
  input: VerifyAuthInput,
  signal?: AbortSignal,
): Promise<BackendPartnerSession> {
  const envelope = await api.post<ApiEnvelope<BackendPartnerSession>>(
    endpoints.partnerAuthVerify,
    {
      phone: input.phone,
      otp: input.otp,
      ...(input.name ? { name: input.name } : null),
      ...(input.email ? { email: input.email } : null),
      ...(input.businessName ? { businessName: input.businessName } : null),
    },
    { signal, token: null },
  );
  return unwrap(envelope);
}

export type LoginWithPasswordInput = { email: string; password: string };

/**
 * Email and password, for accounts that have been given one.
 *
 * ## Not a replacement for the code above it
 *
 * Nearly every owner has no password at all, and the server fails closed for
 * them — so this route cannot sign in the accounts that `startAuth` serves.
 * It exists for the accounts somebody has deliberately provisioned: a store
 * reviewer who cannot receive an Indian SMS, a demo handset, support
 * reproducing a fault.
 *
 * ## It never registers
 *
 * `verifyAuth` may create an account, because proving a phone number proves
 * the person holds it. Typing an email proves nothing, so this one only ever
 * signs in — a wrong address and a wrong password give the same refusal, and
 * neither creates anything.
 *
 * `token: null` for the same reason as the three calls above: a dead session
 * still in memory must not travel with a fresh sign-in.
 */
export async function loginWithPassword(
  input: LoginWithPasswordInput,
  signal?: AbortSignal,
): Promise<BackendPartnerSession> {
  const envelope = await api.post<ApiEnvelope<BackendPartnerSession>>(
    endpoints.partnerAuthLogin,
    { email: input.email.trim().toLowerCase(), password: input.password },
    { signal, token: null },
  );
  return unwrap(envelope);
}

/** Who this token belongs to. The session's own validity check on boot. */
export async function fetchMe(signal?: AbortSignal): Promise<BackendPartner> {
  const envelope = await api.get<ApiEnvelope<BackendPartner>>(endpoints.partnerMe, { signal });
  return unwrap(envelope);
}

export type UpdateMeInput = {
  name?: string;
  email?: string;
  businessName?: string;
  /**
   * The owner's own address. `null` clears it; a partial object edits what is
   * already there rather than replacing it, so changing a landmark cannot
   * blank the pincode.
   *
   * Sent as `{lat, lng}` because that is what a device's location API returns;
   * the server stores `[lng, lat]` and hands it back that way.
   */
  address?: {
    kind?: PartnerAddress['kind'];
    label?: string;
    line1?: string;
    line2?: string;
    landmark?: string;
    city?: string;
    state?: string;
    pincode?: string;
    instructions?: string;
    location?: { lat: number; lng: number } | null;
  } | null;
};

/**
 * What the profile-setup screen writes, and every later edit of it.
 *
 * PATCH rather than PUT: the body is the fields being changed, not a whole
 * replacement partner, and sending a partial document to PUT is how a missing
 * key ends up read as "clear this". An explicitly sent empty string DOES clear
 * — that is how somebody removes a business name they no longer trade under.
 */
export async function updateMe(
  input: UpdateMeInput,
  signal?: AbortSignal,
): Promise<BackendPartner> {
  const envelope = await api.patch<ApiEnvelope<BackendPartner>>(
    endpoints.partnerMe,
    input,
    { signal },
  );
  return unwrap(envelope);
}
