import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';

import {
  ApiError,
  setAuthToken,
  setSessionExpiredHandler,
} from '@/services/api/client';
import { Platform } from 'react-native';

import { registerDevice, unregisterDevice } from '@/services/api/devices.api';
import { clearPushState, getPushToken } from '@/services/push/push';
import { API_BASE_URL_CONFIGURED } from '@/services/api/config';
import {
  fetchMe,
  resendAuthCode,
  startAuth,
  updateMe,
  verifyAuth,
  type UpdateMeInput,
} from '@/services/api/auth.api';
import type { BackendOtpChallenge, BackendPartner } from '@/services/api/types';
import {
  clearSession,
  loadSession,
  savePartner,
  saveSession,
} from '@/services/session';

/**
 * The partner's session, and the two-step sign-in that creates it.
 *
 * ## Register and log in are one flow
 *
 * There is no `register` here. A number the backend has seen before signs in;
 * one it has not creates an account — the server deliberately never says which,
 * because an endpoint that did would let anybody test a list of numbers against
 * Lampose's owners. The login screen and a future "register" screen are the
 * same two calls with different copy.
 *
 * ## Three states, not two
 *
 *   loading    the token is being read off disk and checked against `/me`
 *   signedOut  no token, or the server rejected the one we had
 *   signedIn   a token the server accepted this launch
 *
 * A fourth thing is tracked separately and is NOT a session state:
 * `profileComplete`. A partner who proved their number but never filled in
 * their name is fully signed in — they just have not finished setting up, and
 * the router sends them to profile setup rather than to the dashboard.
 * Modelling that as a session state would mean signing somebody out to ask
 * their name.
 *
 * ## The stored profile is never believed
 *
 * It paints the first frame; `/me` replaces it. A cached profile that were
 * trusted would keep an account looking signed-in after the server had blocked
 * it, which is precisely the window in which somebody is blocked.
 */

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

/** Why a code could not be sent. Each one gets different copy on the screen. */
export type SendFailure = 'network' | 'rateLimited' | 'badNumber' | 'unavailable' | null;

export type VerifyResult =
  | { ok: true; profileComplete: boolean }
  | { ok: false; reason: 'wrong'; attemptsLeft: number }
  | { ok: false; reason: 'locked'; unlocksAtLabel: string }
  | { ok: false; reason: 'expired' }
  | { ok: false; reason: 'failed'; message: string };

type AuthValue = {
  status: AuthStatus;
  partner: BackendPartner | null;
  /** True once a name exists. The router gates profile-setup on this. */
  profileComplete: boolean;

  /** The number a code is currently out to, and how the server masked it. */
  pendingPhone: string | null;
  pendingPhoneMasked: string | null;
  otpLength: number;
  /** Seconds until another code may be asked for. Counts down locally. */
  resendIn: number;

  isSubmitting: boolean;
  sendFailure: SendFailure;
  failureMessage: string | null;

  sendCode: (phone: string) => Promise<'sent' | 'pending' | 'failed'>;
  resendCode: () => Promise<'sent' | 'failed'>;
  verifyCode: (otp: string, profile?: UpdateMeInput) => Promise<VerifyResult>;
  changeNumber: () => void;

  saveProfile: (input: UpdateMeInput) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

/** The server sets the real cooldown; this is only the pre-response guess. */
const DEFAULT_OTP_LENGTH = 6;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const client = useQueryClient();

  const [status, setStatus] = useState<AuthStatus>('loading');
  const [partner, setPartner] = useState<BackendPartner | null>(null);

  const [pendingPhone, setPendingPhone] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<BackendOtpChallenge | null>(null);
  const [resendIn, setResendIn] = useState(0);

  const [isSubmitting, setSubmitting] = useState(false);
  const [sendFailure, setSendFailure] = useState<SendFailure>(null);
  const [failureMessage, setFailureMessage] = useState<string | null>(null);

  /* Guards the cooldown interval so a second send does not start a second
     timer counting the same number down twice as fast. */
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  const startCooldown = useCallback((seconds: number) => {
    if (tick.current) clearInterval(tick.current);
    setResendIn(Math.max(0, Math.ceil(seconds)));
    tick.current = setInterval(() => {
      setResendIn((current) => {
        if (current <= 1) {
          if (tick.current) clearInterval(tick.current);
          tick.current = null;
          return 0;
        }
        return current - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => () => {
    if (tick.current) clearInterval(tick.current);
  }, []);

  /*
   * This device's push token, held so sign-out hands back the same one that
   * was registered. A ref rather than state: nothing renders from it, and a
   * re-render mid-sign-out must not lose the value that says which handset to
   * deregister.
   */
  const pushToken = useRef<string | null>(null);

  /**
   * Put this handset on the account's list.
   *
   * Matters more here than on the student's side: an owner has minutes to
   * answer, and an owner with no registered device simply never learns a
   * request arrived. Every one of them then expires.
   *
   * Cannot throw and is never awaited by sign-in — an owner who declined
   * notifications still gets every screen in the app.
   */
  const attachDevice = useCallback(async () => {
    const token = await getPushToken();
    if (!token) return;
    pushToken.current = token;
    await registerDevice(token, Platform.OS === 'ios' ? 'ios' : 'android');
  }, []);

  /** Drops the session everywhere it is held: memory, disk, client, cache. */
  const dropSession = useCallback(async () => {
    /*
     * The device comes off the account BEFORE the token is cleared — the
     * endpoint is behind a session, so the other order is an unauthenticated
     * call that silently does nothing and leaves this handset receiving the
     * previous owner's requests.
     */
    if (pushToken.current) {
      await unregisterDevice(pushToken.current).catch(() => {});
      pushToken.current = null;
    }
    await clearPushState();

    setAuthToken(null);
    setPartner(null);
    setStatus('signedOut');
    await clearSession();
    /* A cache full of the previous partner's properties and their customers'
       phone numbers must not survive a sign-out. */
    client.clear();
  }, [client]);

  /* Boot: read the token, then ask the server whether it still works. */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const stored = await loadSession();

      if (!stored.token) {
        if (!cancelled) setStatus('signedOut');
        return;
      }

      /* Painted immediately so a returning partner sees their name rather than
         a spinner. Replaced by `/me` a moment later — see the file header. */
      setAuthToken(stored.token);
      if (stored.partner && !cancelled) setPartner(stored.partner);

      /* Nowhere to verify against. Treated as signed in on the strength of the
         stored token, because signing somebody out over a missing environment
         variable would hide the actual problem behind a login screen. Every
         request will fail loudly with API_NOT_CONFIGURED regardless. */
      if (!API_BASE_URL_CONFIGURED) {
        if (!cancelled) setStatus(stored.partner ? 'signedIn' : 'signedOut');
        return;
      }

      try {
        const fresh = await fetchMe();
        if (cancelled) return;
        setPartner(fresh);
        setStatus('signedIn');
        await savePartner(fresh);

        /* Re-registered on every launch, not only at sign-in. A push token is
           reissued on reinstall and can be rotated by the OS, so an owner who
           signed in months ago would otherwise stop being reachable with
           nothing anywhere to say why — and every request they get would
           quietly expire. */
        attachDevice().catch(() => {});
      } catch (error) {
        if (cancelled) return;

        /*
         * Only the server rejecting the token signs somebody out.
         *
         * A dropped connection is not a dead session, and treating it as one
         * would sign an owner out every time they opened the app in a lift —
         * losing them a session they cannot get back without SMS reception.
         */
        if (error instanceof ApiError && !error.isNetwork && error.status === 401) {
          await dropSession();
          return;
        }
        setStatus(stored.partner ? 'signedIn' : 'signedOut');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dropSession]);

  /* The client reports a dead token once, centrally, rather than every screen
     handling its own 401. */
  useEffect(() => {
    setSessionExpiredHandler(() => {
      void dropSession();
    });
    return () => setSessionExpiredHandler(null);
  }, [dropSession]);

  /** Classifies a send failure into the four the screens have copy for. */
  const classify = (error: unknown): SendFailure => {
    if (!(error instanceof ApiError)) return 'network';
    if (error.isNetwork) return 'network';
    if (error.status === 429) return 'rateLimited';
    if (error.code === 'BAD_PHONE') return 'badNumber';
    if (error.code === 'SMS_NOT_CONFIGURED' || error.status === 503) return 'unavailable';
    if (error.code === 'OTP_SEND_FAILED') return 'badNumber';
    return 'unavailable';
  };

  const sendCode = useCallback<AuthValue['sendCode']>(async (phone) => {
    setSubmitting(true);
    setSendFailure(null);
    setFailureMessage(null);

    try {
      const result = await startAuth({ phone });
      setPendingPhone(phone);
      setChallenge(result);
      startCooldown(result.resendInSeconds);
      return 'sent';
    } catch (error) {
      /*
       * A cooldown is not a failure to be held on the form.
       *
       * 429 RESEND_TOO_SOON means the server sent a code moments ago — so one
       * is already in their messages, and keeping them on the number screen to
       * wait it out for a code they can read right now would be perverse. The
       * flow advances; the OTP screen shows the remaining cooldown.
       */
      if (error instanceof ApiError && error.status === 429 && error.code === 'RESEND_TOO_SOON') {
        const payload = error.payload as { data?: BackendOtpChallenge; retryAfter?: number } | null;
        setPendingPhone(phone);
        if (payload?.data) setChallenge(payload.data);
        startCooldown(payload?.retryAfter ?? 30);
        return 'pending';
      }

      setSendFailure(classify(error));
      setFailureMessage(error instanceof ApiError ? error.displayMessage : null);
      return 'failed';
    } finally {
      setSubmitting(false);
    }
  }, [startCooldown]);

  const resendCode = useCallback<AuthValue['resendCode']>(async () => {
    if (!pendingPhone) return 'failed';
    setSubmitting(true);
    setSendFailure(null);
    setFailureMessage(null);

    try {
      const result = await resendAuthCode({ phone: pendingPhone });
      setChallenge(result);
      startCooldown(result.resendInSeconds);
      return 'sent';
    } catch (error) {
      if (error instanceof ApiError && error.status === 429) {
        const payload = error.payload as { retryAfter?: number } | null;
        startCooldown(payload?.retryAfter ?? 30);
      }
      setSendFailure(classify(error));
      setFailureMessage(error instanceof ApiError ? error.displayMessage : null);
      return 'failed';
    } finally {
      setSubmitting(false);
    }
  }, [pendingPhone, startCooldown]);

  const verifyCode = useCallback<AuthValue['verifyCode']>(async (otp, profile) => {
    if (!pendingPhone) return { ok: false, reason: 'failed', message: 'Start again from your number.' };

    setSubmitting(true);
    try {
      const session = await verifyAuth({ phone: pendingPhone, otp, ...profile });

      setAuthToken(session.token);
      setPartner(session.partner);
      setStatus('signedIn');
      await saveSession(session.token, session.partner);

      /* Fired, not awaited: asking for notification permission opens an OS
         dialog, and holding the sign-in transition behind it leaves somebody
         watching a spinner underneath a system prompt. */
      attachDevice().catch(() => {});

      setPendingPhone(null);
      setChallenge(null);

      return { ok: true, profileComplete: session.partner.profileComplete };
    } catch (error) {
      if (!(error instanceof ApiError)) {
        return { ok: false, reason: 'failed', message: 'Something went wrong. Please try again.' };
      }

      const payload = (error.payload ?? {}) as { attemptsLeft?: number; unlocksAt?: string };

      if (error.code === 'OTP_LOCKED') {
        const at = payload.unlocksAt ? new Date(payload.unlocksAt) : null;
        return {
          ok: false,
          reason: 'locked',
          /* A clock time, so the screen can say "try again after 9:41" rather
             than "later". A wait you cannot see the end of is abandoned. */
          unlocksAtLabel: at
            ? at.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
            : 'shortly',
        };
      }
      if (error.code === 'OTP_EXPIRED') return { ok: false, reason: 'expired' };
      if (error.code === 'OTP_WRONG') {
        return { ok: false, reason: 'wrong', attemptsLeft: payload.attemptsLeft ?? 0 };
      }
      return { ok: false, reason: 'failed', message: error.displayMessage };
    } finally {
      setSubmitting(false);
    }
  }, [pendingPhone]);

  const changeNumber = useCallback(() => {
    setPendingPhone(null);
    setChallenge(null);
    setSendFailure(null);
    setFailureMessage(null);
    if (tick.current) clearInterval(tick.current);
    tick.current = null;
    setResendIn(0);
  }, []);

  const saveProfile = useCallback<AuthValue['saveProfile']>(async (input) => {
    const updated = await updateMe(input);
    setPartner(updated);
    await savePartner(updated);
  }, [attachDevice]);

  const signOut = useCallback(async () => {
    await dropSession();
  }, [dropSession]);

  const value = useMemo<AuthValue>(() => ({
    status,
    partner,
    profileComplete: Boolean(partner?.profileComplete),

    pendingPhone,
    pendingPhoneMasked: challenge?.phoneMasked ?? null,
    otpLength: challenge?.otpLength ?? DEFAULT_OTP_LENGTH,
    resendIn,

    isSubmitting,
    sendFailure,
    failureMessage,

    sendCode,
    resendCode,
    verifyCode,
    changeNumber,
    saveProfile,
    signOut,
  }), [
    status, partner, pendingPhone, challenge, resendIn,
    isSubmitting, sendFailure, failureMessage,
    sendCode, resendCode, verifyCode, changeNumber, saveProfile, signOut,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
