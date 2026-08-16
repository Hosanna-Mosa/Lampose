import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import type { AppConfig, AuthStatus, AuthUser, SendFailure } from '@/types/auth';

/**
 * Phone and a one-time code. There are no passwords in this product.
 *
 * A password is a thing to forget, reset over email, and be locked out of at
 * the exact moment a bed is about to go. The number is also the thing an owner
 * needs in order to call, so asking for it is not an extra step — it is the
 * step, and the heading on the login screen says so.
 *
 * Three rules encoded here rather than left to the screens:
 *
 *  - Browsing never requires auth. The default state is `guest`, and a failed
 *    token check enters the app as a guest rather than blocking it.
 *  - The resend cooldown resets on a resend, never on a wrong code. A cooldown
 *    that punishes typing mistakes is the fastest way to make someone give up.
 *  - A lockout is on the code, not on the person — changing the number stays
 *    available throughout.
 */

const SESSION_KEY = '@lampose/session';
const OTP_LENGTH: AppConfig['otpLength'] = 6;

/** Mock only. The real code never reaches the client. */
const MOCK_CODE = '123456';

export const RESEND_COOLDOWN_SECONDS = 30;
export const MAX_ATTEMPTS = 3;
export const LOCK_MINUTES = 10;
/** After this many sends, offer WhatsApp rather than a fourth SMS. */
export const MAX_SMS_SENDS = 3;

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: 'wrong'; attemptsLeft: number }
  | { ok: false; reason: 'locked'; unlocksAtLabel: string };

type AuthContextValue = {
  status: AuthStatus;
  user: AuthUser | null;
  config: AppConfig;

  /** The number a code was sent to, kept so the OTP screen can show it. */
  pendingPhone: string | null;
  isSubmitting: boolean;
  sendFailure: SendFailure | null;

  /** Seconds until a resend is allowed. Zero means it is enabled. */
  resendIn: number;
  sendCount: number;
  attemptsLeft: number;
  lockedUntilLabel: string | null;

  sendCode: (phone: string, channel?: 'sms' | 'whatsapp') => Promise<boolean>;
  resendCode: (channel?: 'sms' | 'whatsapp') => Promise<boolean>;
  /** `profile` is supplied by the sign-up path, so the name lands in the same write. */
  verifyCode: (code: string, profile?: { name?: string; email?: string }) => Promise<VerifyResult>;
  changeNumber: () => void;

  completeProfile: (params: { name: string; email?: string }) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('hydrating');
  const [user, setUser] = useState<AuthUser | null>(null);

  const [pendingPhone, setPendingPhone] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sendFailure, setSendFailure] = useState<SendFailure | null>(null);

  const [resendIn, setResendIn] = useState(0);
  const [sendCount, setSendCount] = useState(0);
  const [attemptsLeft, setAttemptsLeft] = useState(MAX_ATTEMPTS);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);

  const config = useMemo<AppConfig>(
    () => ({ serverTimeOffsetMs: 0, otpLength: OTP_LENGTH }),
    [],
  );

  // Restore the session. A failure here is not a blocker: the app opens as a
  // guest, because browsing does not require auth.
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(SESSION_KEY)
      .then((stored) => {
        if (!active) return;
        if (stored) {
          try {
            setUser(JSON.parse(stored) as AuthUser);
            setStatus('signedIn');
            return;
          } catch {
            // A corrupt session is a guest session, not an error screen.
          }
        }
        setStatus('guest');
      })
      .catch(() => {
        if (active) setStatus('guest');
      });
    return () => {
      active = false;
    };
  }, []);

  // The resend cooldown. It is driven from the send, never from an attempt.
  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((value) => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const persist = useCallback(async (next: AuthUser) => {
    setUser(next);
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(next));
  }, []);

  const doSend = useCallback(
    async (phone: string, channel: 'sms' | 'whatsapp') => {
      setIsSubmitting(true);
      setSendFailure(null);
      try {
        await new Promise((resolve) => setTimeout(resolve, 600));
        setPendingPhone(phone);
        setStatus('awaitingCode');
        setSendCount((count) => count + 1);
        setResendIn(RESEND_COOLDOWN_SECONDS);
        // A fresh code gets a fresh set of attempts.
        setAttemptsLeft(MAX_ATTEMPTS);
        setLockedUntil(null);
        return true;
      } catch {
        setSendFailure(channel === 'sms' ? 'smsProvider' : 'offline');
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [],
  );

  const sendCode = useCallback(
    (phone: string, channel: 'sms' | 'whatsapp' = 'sms') => doSend(phone, channel),
    [doSend],
  );

  const resendCode = useCallback(
    (channel: 'sms' | 'whatsapp' = 'sms') => {
      if (!pendingPhone || resendIn > 0) return Promise.resolve(false);
      return doSend(pendingPhone, channel);
    },
    [pendingPhone, resendIn, doSend],
  );

  const verifyCode = useCallback(
    async (code: string, profile?: { name?: string; email?: string }): Promise<VerifyResult> => {
      if (lockedUntil && Date.now() < lockedUntil) {
        return { ok: false, reason: 'locked', unlocksAtLabel: labelFor(lockedUntil) };
      }

      setIsSubmitting(true);
      try {
        await new Promise((resolve) => setTimeout(resolve, 500));

        if (code !== MOCK_CODE) {
          const left = attemptsLeft - 1;
          setAttemptsLeft(left);
          if (left <= 0) {
            const until = Date.now() + LOCK_MINUTES * 60_000;
            setLockedUntil(until);
            return { ok: false, reason: 'locked', unlocksAtLabel: labelFor(until) };
          }
          // Note what does NOT happen here: the resend cooldown is untouched.
          return { ok: false, reason: 'wrong', attemptsLeft: left };
        }

        const base: AuthUser = user ?? {
          id: `usr-${pendingPhone ?? 'unknown'}`,
          name: '',
          phone: pendingPhone ?? '',
        };
        // One write, so there is never a frame where the user is signed in
        // without the name they just typed.
        await persist({
          ...base,
          name: profile?.name?.trim() || base.name,
          email: profile?.email?.trim() || base.email,
        });
        setStatus('signedIn');
        return { ok: true };
      } finally {
        setIsSubmitting(false);
      }
    },
    [attemptsLeft, lockedUntil, pendingPhone, user, persist],
  );

  const changeNumber = useCallback(() => {
    // Available even while the code is locked — the lock is on the code.
    setPendingPhone(null);
    setSendFailure(null);
    setResendIn(0);
    setSendCount(0);
    setAttemptsLeft(MAX_ATTEMPTS);
    setLockedUntil(null);
    setStatus('guest');
  }, []);

  const completeProfile = useCallback(
    async ({ name, email }: { name: string; email?: string }) => {
      const base: AuthUser = user ?? {
        id: `usr-${pendingPhone ?? 'unknown'}`,
        name: '',
        phone: pendingPhone ?? '',
      };
      await persist({ ...base, name, email: email?.trim() ? email.trim() : undefined });
    },
    [user, pendingPhone, persist],
  );

  const signOut = useCallback(async () => {
    await AsyncStorage.removeItem(SESSION_KEY);
    setUser(null);
    setPendingPhone(null);
    setStatus('guest');
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      config,
      pendingPhone,
      isSubmitting,
      sendFailure,
      resendIn,
      sendCount,
      attemptsLeft,
      lockedUntilLabel: lockedUntil ? labelFor(lockedUntil) : null,
      sendCode,
      resendCode,
      verifyCode,
      changeNumber,
      completeProfile,
      signOut,
    }),
    [
      status,
      user,
      config,
      pendingPhone,
      isSubmitting,
      sendFailure,
      resendIn,
      sendCount,
      attemptsLeft,
      lockedUntil,
      sendCode,
      resendCode,
      verifyCode,
      changeNumber,
      completeProfile,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** A lock is stated as a clock time, never as "try again later". */
function labelFor(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
