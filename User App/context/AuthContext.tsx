import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { getSecret, setSecret, deleteSecret } from '../services/secureStore';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import {
  ApiError,
  disconnectSupportSocket,
  fetchMe,
  logoutAuth,
  resendAuthCode,
  setAuthToken,
  setSessionExpiredHandler,
  startAuth,
  updateMe,
  verifyAuth,
} from '@/services';
import { Platform } from 'react-native';

import { registerDevice, unregisterDevice } from '@/services/api/devices.api';
import { clearPushState, getPushToken } from '@/services/push/push';
import type { AppConfig, AuthStatus, AuthUser, SendFailure } from '@/types/auth';
import type { BackendReferralOutcome } from '@/services/api/types';
import {
  isDemoCredentials, enterDemo, exitDemo, demoCustomer, DEMO_TOKEN,
} from '@/services/demoMode';

/**
 * Phone and a one-time code. There are no passwords in this product.
 *
 * A password is a thing to forget, reset over email, and be locked out of at
 * the exact moment a bed is about to go. The number is also the thing an owner
 * needs in order to call, so asking for it is not an extra step — it is the
 * step, and the heading on the login screen says so.
 *
 * ## This talks to the server now
 *
 * It used to be a simulation: a 600ms `setTimeout`, a hardcoded `MOCK_CODE`
 * of '123456', and a "session" that was whatever the device had written to
 * AsyncStorage. Nothing was verified and nothing existed server-side, so two
 * things followed that are easy to miss — an owner receiving a visit request
 * had no reason to believe the number attached to it, and a student who
 * reinstalled lost an account that had never been anywhere else.
 *
 * The codes are real, sent over the DLT-registered SMS route to the number
 * typed in, and the account lives in `app_customers`.
 *
 * ## Three rules, encoded here rather than left to the screens
 *
 *  - **Browsing never requires auth.** The default state is `guest`, and a
 *    failed token check enters the app as a guest rather than blocking it.
 *  - **The resend cooldown resets on a resend, never on a wrong code.** A
 *    cooldown that punishes typing mistakes is the fastest way to make
 *    somebody give up. The server enforces the same rule against its own
 *    clock; the number below comes from its response rather than being
 *    guessed here, so the two can never disagree.
 *  - **A lockout is on the code, not on the person.** Changing the number
 *    stays available throughout, and asking for a new code clears it.
 *
 * ## What is stored on the device
 *
 * The token and a copy of the profile — the copy so the app can paint a name
 * on the first frame rather than after a round trip. The server is asked who
 * the token belongs to on every launch, and its answer wins.
 */

const SESSION_KEY = '@lampose/session';

/*
 * The token is stored APART from the rest of the session.
 *
 * `SESSION_KEY` holds `{ token, user }`, and the profile half is only a
 * first-frame convenience — `/me` overwrites it on every launch. The token is
 * the half that is a credential, so it goes to the Keychain / Keystore under
 * its own key and the blob keeps only the profile.
 */
const TOKEN_KEY = '@lampose/session.token';

/**
 * Six, until the server says otherwise.
 *
 * The DLT-registered template promises a six-digit code and the registered
 * text cannot be changed on a whim, so this follows it. `startAuth` returns
 * the real length and it replaces this the moment a code is requested — the
 * constant only has to be right for the frame before that.
 */
const DEFAULT_OTP_LENGTH: AppConfig['otpLength'] = 6;

/** Until the server's own cooldown arrives on the first send. */
const DEFAULT_RESEND_SECONDS = 60;

export const RESEND_COOLDOWN_SECONDS = DEFAULT_RESEND_SECONDS;
export const MAX_ATTEMPTS = 5;
/** After this many sends the server refuses more, so a fourth is not offered. */
export const MAX_SMS_SENDS = 3;

export type VerifyResult =
  | { ok: true; referralMessage?: string }
  | { ok: false; reason: 'wrong'; attemptsLeft: number }
  | { ok: false; reason: 'locked'; unlocksAtLabel: string }
  | { ok: false; reason: 'expired'; message: string }
  | { ok: false; reason: 'failed'; message: string };

/**
 * What `sendCode` tells the screen to do next.
 *
 * Three outcomes, not two, because "refused" splits into two cases that need
 * opposite handling:
 *
 *   sent      a code is on its way. Go to the code screen.
 *   pending   refused because one was sent moments ago and the cooldown has
 *             not run out — so a valid code IS in the student's messages.
 *             Also go to the code screen; stopping them on the form to wait
 *             out a timer for a code they already have is nonsense.
 *   failed    nothing was sent and nothing is coming. Stay, and show why.
 */
export type SendResult = 'sent' | 'pending' | 'failed';

/** The sign-up fields, held between the form screen and the code screen. */
export type PendingProfile = { name?: string; email?: string; referralCode?: string };

type StoredSession = { token: string; user: AuthUser };

type AuthContextValue = {
  status: AuthStatus;
  user: AuthUser | null;
  config: AppConfig;

  /** The number a code was sent to, kept so the OTP screen can show it. */
  pendingPhone: string | null;
  /** "•••••43210", from the server. Safer to show than the raw number. */
  pendingPhoneMasked: string | null;
  isSubmitting: boolean;
  sendFailure: SendFailure | null;
  /** The server's own sentence, when it wrote one worth showing. */
  failureMessage: string | null;

  /** Seconds until a resend is allowed. Zero means it is enabled. */
  resendIn: number;
  sendCount: number;
  attemptsLeft: number;
  lockedUntilLabel: string | null;

  /**
   * Sends a code, and carries the sign-up fields until it is confirmed.
   *
   * `profile` is held here rather than passed to the code screen as a route
   * param — the two are separate screens now, and a student's name in a
   * navigation URL is both untidy and visible in the address bar on web.
   */
  sendCode: (phone: string, profile?: PendingProfile) => Promise<SendResult>;
  resendCode: () => Promise<SendResult>;
  /** The held profile lands in the same write that proves the number. */
  verifyCode: (code: string) => Promise<VerifyResult>;
  /** Demo sign-in for Play Console review. See `services/demoMode.ts`. */
  signInWithPassword: (email: string, password: string) => Promise<{ ok: boolean; message?: string }>;
  changeNumber: () => void;

  completeProfile: (params: { name: string; email?: string }) => Promise<void>;
  /** Mirrors the device's category onto the account, for a reinstall. */
  syncCategory: (category: string) => void;
  signOut: () => Promise<void>;

  /**
   * Browsing needs no account; the moment somebody actually acts does.
   *
   * A screen calls this INSTEAD of running the action directly — `action` runs
   * at once for a signed-in student, exactly as it always did. For a guest, it
   * is held rather than run, and the phone flips to sign-in. `resumePendingIntent`
   * is what plays it back: the button that was tapped, the request that was
   * being sent, the ticket that was being filed, whichever it was — the same
   * screen the guest was already on, not a fresh trip to Home. That screen
   * never unmounted; auth is `push`ed on top of it, not `replace`d, precisely
   * so its state (a chosen sharing type, a filled-in cart) is still there when
   * `router.back()` returns to it.
   */
  requireSignIn: (action: () => void) => void;
  /**
   * Called once, right after a sign-in succeeds. `true` means it played back
   * a held action and the screen should skip its own post-login navigation;
   * `false` means there was nothing held, and an ordinary sign-in (or the
   * `next` param) decides where to go.
   */
  resumePendingIntent: () => boolean;
  /** The "Skip" control on the sign-in screen. Browsing needs no account. */
  continueAsGuest: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('hydrating');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const [pendingPhone, setPendingPhone] = useState<string | null>(null);
  const [pendingPhoneMasked, setPendingPhoneMasked] = useState<string | null>(null);
  const [pendingProfile, setPendingProfile] = useState<PendingProfile | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sendFailure, setSendFailure] = useState<SendFailure | null>(null);
  const [failureMessage, setFailureMessage] = useState<string | null>(null);

  const [otpLength, setOtpLength] = useState<AppConfig['otpLength']>(DEFAULT_OTP_LENGTH);
  const [resendIn, setResendIn] = useState(0);
  const [sendCount, setSendCount] = useState(0);
  const [attemptsLeft, setAttemptsLeft] = useState(MAX_ATTEMPTS);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);

  const config = useMemo<AppConfig>(
    () => ({ serverTimeOffsetMs: 0, otpLength }),
    [otpLength],
  );

  /* ── Persistence ───────────────────────────────────────────────────── */

  /*
   * This device's push token, held so sign-out can hand back the same one it
   * registered.
   *
   * A ref rather than state: nothing renders from it, and a re-render in the
   * middle of signing out must not be able to lose the value that says which
   * handset to deregister.
   */
  const pushToken = useRef<string | null>(null);

  /**
   * Put this handset on the account's list.
   *
   * Runs on every sign-in and every session restore, not once ever — a push
   * token identifies an app INSTALLATION and is reissued on reinstall or
   * rotated by the OS. The backend upserts by token, so repeating it is free.
   *
   * Deliberately not awaited by its caller and unable to throw: a student who
   * declined notifications, or is running in Expo Go where push does not
   * exist, must still be signed in. The app works without it; the phone just
   * does not buzz.
   */
  const attachDevice = useCallback(async () => {
    const token = await getPushToken();
    if (!token) return;
    pushToken.current = token;
    await registerDevice(token, Platform.OS === 'ios' ? 'ios' : 'android');
  }, []);

  const persist = useCallback(async (session: StoredSession | null) => {
    if (!session) {
      /*
       * The device comes off the account BEFORE the token is cleared.
       *
       * The endpoint is behind a session, so doing it after `setAuthToken(null)`
       * would be an unauthenticated call that silently does nothing — and the
       * handset would keep receiving this account's alerts. On a shared phone
       * that is the next person reading somebody else's booking notifications
       * off the lock screen.
       */
      if (pushToken.current) {
        await unregisterDevice(pushToken.current).catch(() => {});
        pushToken.current = null;
      }
      await clearPushState();

      /*
       * The support socket goes with it, for the same reason.
       *
       * The server put that connection in `customer:<id>` from the token it
       * was opened with and never re-checks it, so one left open outlives the
       * session that authorised it — on a shared handset that is the next
       * person's app holding a live line to the previous student's deposit
       * dispute. Clearing the HTTP token below does nothing to a socket that
       * is already connected.
       */
      disconnectSupportSocket();

      /*
       * Revoked server-side, before the token is cleared locally — for the
       * same reason the device comes off the account first: an unauthenticated
       * call to a session-gated route does nothing. Best-effort: a phone with
       * no connection must still be able to leave, so a failure here does not
       * block the local sign-out below.
       */
      await logoutAuth().catch(() => {});

      setUser(null);
      setToken(null);
      /* Cleared in the client FIRST. A request that fires between these two
         lines would otherwise carry a token the app has decided to forget. */
      /* Demo mode ends with the session it belonged to. */
      exitDemo();

      setAuthToken(null);
      await Promise.all([
        AsyncStorage.removeItem(SESSION_KEY),
        deleteSecret(TOKEN_KEY),
      ]);
      return;
    }
    /*
     * A real session forcibly ends demo mode, even if something left it on.
     *
     * `enterDemo()` sets a module-level flag that nothing but `signOut`
     * otherwise clears — and it does not ask whether a real session already
     * exists before replacing it. Without this, a signed-in student who ever
     * opened the demo password screen (or a device that had one open before)
     * would have every future request answered by fake data from
     * `services/demoMode.ts` for the rest of that real session.
     */
    exitDemo();
    setUser(session.user);
    setToken(session.token);
    setAuthToken(session.token);
    /* The token to the keystore, everything else to AsyncStorage with the
       token stripped out — so what sits in the plaintext store from here on
       cannot sign anybody in. */
    const { token: sessionToken, ...withoutToken } = session;
    await Promise.all([
      setSecret(TOKEN_KEY, sessionToken),
      AsyncStorage.setItem(SESSION_KEY, JSON.stringify(withoutToken)),
    ]);

    /* Fired, not awaited. Asking for notification permission opens an OS
       dialog, and blocking the sign-in transition behind it would leave
       somebody looking at a spinner under a system prompt. */
    attachDevice().catch(() => {});
  }, [attachDevice]);

  /* ── Restore, then revalidate ──────────────────────────────────────────
     The stored copy paints the first frame; the server decides whether the
     session is still real. A token can be revoked or an account deleted long
     before the JWT's own expiry, and only /me knows. */
  useEffect(() => {
    let active = true;

    (async () => {
      let stored: StoredSession | null = null;
      try {
        const [raw, secureToken] = await Promise.all([
          AsyncStorage.getItem(SESSION_KEY),
          getSecret(TOKEN_KEY),
        ]);
        if (raw) {
          const parsed = JSON.parse(raw) as StoredSession;
          /* `??` and not `||`: on an install written by an older build the
             token is still INSIDE the blob and the keystore is empty, so the
             inline copy is what keeps that person signed in. The next save
             writes it to the keystore and drops it from the blob. */
          stored = { ...parsed, token: secureToken ?? parsed.token };
        }
      } catch {
        // A corrupt session is a guest session, not an error screen.
      }

      if (!active) return;

      if (!stored?.token) {
        setStatus('guest');
        return;
      }

      // Optimistic: the app opens signed in and corrects itself if wrong.
      setUser(stored.user);
      setToken(stored.token);
      setAuthToken(stored.token);
      setStatus('signedIn');

      try {
        const me = await fetchMe();
        if (!active) return;
        await persist({ token: stored.token, user: toAuthUser(me) });
      } catch (error) {
        if (!active) return;
        /* Offline is not signed out. A student on a train keeps the session
           they had; only the server actually rejecting it ends one, and the
           client's session handler below covers that case. */
        if (error instanceof ApiError && error.isNetwork) return;
        if (error instanceof ApiError && error.status >= 500) return;
        await persist(null);
        setStatus('guest');
      }
    })();

    return () => {
      active = false;
    };
  }, [persist]);

  /* The client reports a token the server has stopped accepting, from
     wherever in the app it was noticed. Registered once. */
  useEffect(() => {
    setSessionExpiredHandler(() => {
      void persist(null);
      setStatus('guest');
    });
    return () => setSessionExpiredHandler(null);
  }, [persist]);

  /* ── The resend cooldown ────────────────────────────────────────────────
     Driven from the send, never from an attempt. */
  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((value) => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  /* ── Sending a code ────────────────────────────────────────────────────── */

  /**
   * Turns a failure into the one of three things the screen can say.
   *
   * Every branch names whose fault it is. A student on patchy 4G who is told
   * "invalid request" assumes their data pack died and stops trying.
   */
  const readFailure = useCallback((error: unknown): SendFailure => {
    if (!(error instanceof ApiError)) return 'offline';
    if (error.isNetwork) return 'offline';
    if (error.status === 429) return 'rateLimited';
    return 'smsProvider';
  }, []);

  const doSend = useCallback(
    async (phone: string, resending: boolean): Promise<SendResult> => {
      setIsSubmitting(true);
      setSendFailure(null);
      setFailureMessage(null);
      try {
        const challenge = resending ? await resendAuthCode(phone) : await startAuth({ phone });

        setPendingPhone(phone);
        setPendingPhoneMasked(challenge.phoneMasked);
        setOtpLength(challenge.otpLength === 4 ? 4 : 6);
        setStatus('awaitingCode');
        setSendCount((count) => count + 1);
        setResendIn(challenge.resendInSeconds || DEFAULT_RESEND_SECONDS);
        // A fresh code gets a fresh set of attempts, and clears any lock.
        setAttemptsLeft(challenge.maxAttempts || MAX_ATTEMPTS);
        setLockedUntil(null);
        return 'sent';
      } catch (error) {
        setSendFailure(readFailure(error));
        if (error instanceof ApiError) {
          setFailureMessage(error.displayMessage);
          const payload = error.payload as { retryAfter?: number } | null;

          /*
           * `RESEND_TOO_SOON` and `RATE_LIMITED` both carry a `retryAfter`
           * and mean opposite things, so they are told apart by the code
           * rather than by the field they share.
           *
           * The first is the server's per-number cooldown: a code went out in
           * the last minute, so one is sitting in the student's messages
           * right now and the screen should move on to accept it. The second
           * is the route limiter — nothing was sent, and moving on would put
           * somebody in front of six empty boxes with no code coming.
           */
          if (error.code === 'RESEND_TOO_SOON') {
            if (typeof payload?.retryAfter === 'number') setResendIn(payload.retryAfter);
            setPendingPhone(phone);
            setStatus('awaitingCode');
            return 'pending';
          }

          if (typeof payload?.retryAfter === 'number') setResendIn(payload.retryAfter);
        }
        return 'failed';
      } finally {
        setIsSubmitting(false);
      }
    },
    [readFailure],
  );

  /**
   * SMS only, and there is no `channel` parameter any more.
   *
   * It used to take one, and the sign-in screen offered WhatsApp after three
   * failed sends. There was nothing behind that button: the Twilio number in
   * this system messages property OWNERS on templates approved for
   * verification and visit availability, and codes go over the
   * DLT-registered SMS gateway. Removing the argument is what stops the
   * choice being offered again by a future call site.
   */
  const sendCode = useCallback(
    (phone: string, profile?: PendingProfile) => {
      /* Held until the code comes back correct, then written in the same
         request that proves the number. Cleared on `changeNumber`. */
      setPendingProfile(profile ?? null);
      return doSend(phone, false);
    },
    [doSend],
  );

  const resendCode = useCallback((): Promise<SendResult> => {
    if (!pendingPhone || resendIn > 0) return Promise.resolve('failed');
    return doSend(pendingPhone, true);
  }, [pendingPhone, resendIn, doSend]);

  /* ── Verifying ─────────────────────────────────────────────────────────── */

  /* The category chosen on the entry screen, mirrored onto the account at
     sign-in so a reinstall does not ask again. A ref because it is written by
     a different provider and only ever read at the moment of the call. */
  const categoryRef = useRef<string | null>(null);
  const syncCategory = useCallback((category: string) => {
    categoryRef.current = category;
  }, []);

  /*
   * DEMO ONLY — this never reaches the network.
   *
   * There is no password route for customers on the server and there is not
   * meant to be one: a student signs in with a number and a code. The pair is
   * checked here, against `services/demoMode.ts`, and a wrong one is refused
   * with the same sentence either way so the form cannot be used to learn
   * which addresses Lampose has.
   *
   * `persist` is deliberately NOT called: the demo session must not survive a
   * relaunch, and `DEMO_TOKEN` written to storage would be sent on the next
   * launch's `/me` and rejected, signing the reviewer out mid-review.
   */
  const signInWithPassword = useCallback(
    async (email: string, password: string): Promise<{ ok: boolean; message?: string }> => {
      if (!isDemoCredentials(email, password)) {
        return { ok: false, message: 'That email address and password do not match.' };
      }
      enterDemo();
      setAuthToken(DEMO_TOKEN);
      setUser(toAuthUser(demoCustomer));
      setStatus('signedIn');
      return { ok: true };
    },
    [],
  );

  const verifyCode = useCallback(
    async (code: string): Promise<VerifyResult> => {
      if (!pendingPhone) {
        return { ok: false, reason: 'failed', message: 'Ask for a code first.' };
      }
      if (lockedUntil && Date.now() < lockedUntil) {
        return { ok: false, reason: 'locked', unlocksAtLabel: labelFor(lockedUntil) };
      }

      setIsSubmitting(true);
      setFailureMessage(null);
      try {
        const session = await verifyAuth({
          phone: pendingPhone,
          otp: code,
          name: pendingProfile?.name,
          email: pendingProfile?.email,
          category: categoryRef.current,
          referralCode: pendingProfile?.referralCode,
        });

        await persist({ token: session.token, user: toAuthUser(session.customer) });
        setStatus('signedIn');
        setPendingPhone(null);
        setPendingPhoneMasked(null);
        setPendingProfile(null);
        setSendCount(0);
        setResendIn(0);
        return { ok: true, referralMessage: referralMessageFor(session.referral) };
      } catch (error) {
        if (!(error instanceof ApiError)) {
          return { ok: false, reason: 'failed', message: 'Something went wrong. Please try again.' };
        }

        const payload = error.payload as { attemptsLeft?: number; unlocksAt?: string } | null;

        if (error.code === 'OTP_LOCKED') {
          const until = payload?.unlocksAt ? Date.parse(payload.unlocksAt) : Date.now() + 10 * 60_000;
          setLockedUntil(until);
          setAttemptsLeft(0);
          return { ok: false, reason: 'locked', unlocksAtLabel: labelFor(until) };
        }

        if (error.code === 'OTP_WRONG') {
          /* Note what does NOT happen here: the resend cooldown is untouched. */
          const left = typeof payload?.attemptsLeft === 'number'
            ? payload.attemptsLeft
            : Math.max(0, attemptsLeft - 1);
          setAttemptsLeft(left);
          return { ok: false, reason: 'wrong', attemptsLeft: left };
        }

        if (error.code === 'OTP_EXPIRED') {
          /* Its own reason, not the generic bucket below — wrong and locked
             each get a distinct box on screen, and "the code simply ran out
             the clock" deserves the same rather than reading as an unnamed
             failure. */
          return { ok: false, reason: 'expired', message: error.displayMessage };
        }

        /* A bad email on the sign-up path, a disconnected database — anything
           left has a sentence the server wrote and needs the student to do
           something other than retype a digit. */
        return { ok: false, reason: 'failed', message: error.displayMessage };
      } finally {
        setIsSubmitting(false);
      }
    },
    [pendingPhone, pendingProfile, lockedUntil, attemptsLeft, persist],
  );

  const changeNumber = useCallback(() => {
    // Available even while the code is locked — the lock is on the code.
    setPendingPhone(null);
    setPendingPhoneMasked(null);
    setPendingProfile(null);
    setSendFailure(null);
    setFailureMessage(null);
    setResendIn(0);
    setSendCount(0);
    setAttemptsLeft(MAX_ATTEMPTS);
    setLockedUntil(null);
    setStatus(user ? 'signedIn' : 'guest');
  }, [user]);

  /* ── The profile ───────────────────────────────────────────────────────── */

  const completeProfile = useCallback(
    async ({ name, email }: { name: string; email?: string }) => {
      const updated = await updateMe({ name, ...(email !== undefined ? { email } : null) });
      if (!token) return;
      await persist({ token, user: toAuthUser(updated) });
    },
    [token, persist],
  );

  const signOut = useCallback(async () => {
    /* Revoked server-side too now — see the `logoutAuth` call inside `persist`. */
    await persist(null);
    setPendingPhone(null);
    setPendingPhoneMasked(null);
    setStatus('guest');
  }, [persist]);

  /*
   * A ref, not state — nothing ever renders off this value, and only two
   * places touch it (the screen that holds an action, and the sign-in screen
   * that plays it back), both reachable through this same provider. State
   * would re-render the whole tree for a value nobody displays.
   */
  const pendingIntentRef = useRef<(() => void) | null>(null);

  const requireSignIn = useCallback(
    (action: () => void) => {
      if (status === 'signedIn') {
        action();
        return;
      }
      pendingIntentRef.current = action;
      router.push('/(entry)/auth');
    },
    [status],
  );

  const resumePendingIntent = useCallback((): boolean => {
    const action = pendingIntentRef.current;
    if (!action) return false;
    pendingIntentRef.current = null;
    /* Back to the screen `requireSignIn` was called from — it never unmounted,
       so whatever it was holding (a chosen sharing type, a filled cart) is
       still there for `action` to read. Falls back to nothing if somehow
       there is no screen behind this one; `action` still runs. */
    if (router.canGoBack()) router.back();
    action();
    return true;
  }, []);

  const continueAsGuest = useCallback(() => {
    setStatus('guest');
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      config,
      pendingPhone,
      pendingPhoneMasked,
      isSubmitting,
      sendFailure,
      failureMessage,
      resendIn,
      sendCount,
      attemptsLeft,
      lockedUntilLabel: lockedUntil ? labelFor(lockedUntil) : null,
      sendCode,
      resendCode,
      verifyCode,
      signInWithPassword,
      changeNumber,
      completeProfile,
      syncCategory,
      signOut,
      requireSignIn,
      resumePendingIntent,
      continueAsGuest,
    }),
    [
      status,
      user,
      config,
      pendingPhone,
      pendingPhoneMasked,
      isSubmitting,
      sendFailure,
      failureMessage,
      resendIn,
      sendCount,
      attemptsLeft,
      lockedUntil,
      sendCode,
      resendCode,
      verifyCode,
      signInWithPassword,
      changeNumber,
      requireSignIn,
      resumePendingIntent,
      continueAsGuest,
      completeProfile,
      syncCategory,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * The server's customer, as the app's user.
 *
 * `name` and `email` come back as empty strings for a customer who has not
 * given them — the collection's default. They become `undefined` here,
 * because every screen tests them for truthiness and an empty string that
 * renders as a blank line is the thing those tests exist to avoid.
 */
function toAuthUser(customer: {
  id: string;
  phone: string;
  name: string;
  email: string;
  category: string | null;
}): AuthUser {
  return {
    id: customer.id,
    name: customer.name || '',
    phone: customer.phone,
    email: customer.email || undefined,
    category: (customer.category as AuthUser['category']) ?? undefined,
  };
}

/** A lock is stated as a clock time, never as "try again later". */
function labelFor(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

/**
 * One sentence for whatever the referral code did, or `undefined` when no
 * code was submitted at all — `session.referral` is entirely absent in that
 * case, not a status worth mentioning.
 *
 * Every failure branch still reads as a plain explanation rather than an
 * error: the code is a bonus on top of signing up, and a student who typed
 * one wrong should not read "FAILED" over an account that was created fine.
 */
function referralMessageFor(referral: BackendReferralOutcome | undefined): string | undefined {
  if (!referral) return undefined;
  switch (referral.status) {
    case 'applied':
      return `Signed up via ${referral.propertyName ?? 'your referral'} — you've unlocked ₹${referral.discountRupees ?? 0} off your first food order.`;
    case 'expired':
      return 'That referral code has expired, so it was not applied — your account is set up either way.';
    case 'used':
      return 'That referral code has already been used, so it was not applied — your account is set up either way.';
    case 'phone_mismatch':
      return 'That referral code was issued to a different number, so it was not applied — your account is set up either way.';
    case 'already_referred':
      return undefined; // Signing in again on an already-credited account — nothing new to say.
    case 'invalid':
    default:
      return "That referral code isn't valid, so it was not applied — your account is set up either way.";
  }
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
