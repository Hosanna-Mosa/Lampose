import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import customerAuthApi from '../api/customerAuthApi';
import { clearSession, getSession, onSessionChange, saveSession } from './session';

/* ══════════════════════════════════════════════════════════════════════════
   Who the visitor is, for the whole site.

   Phone and a one-time code. There are no passwords in this product: a
   password is a thing to forget, reset over email, and be locked out of at
   the exact moment a bed is about to go — and the number is what an owner
   needs in order to call, so asking for it is not an extra step, it is the
   step.

   The same account the mobile app signs into. Nothing here is a second
   identity system; `customerAuthApi` calls the same three endpoints the app
   calls, and the session it opens is the one `session.js` has always stored.

   ## Three rules, kept here rather than left to the dialog

    · **Browsing never requires signing in.** The default is `guest`, and a
      token the server rejects lands the visitor in the site as a guest rather
      than on an error. Nothing on lampose.com is behind this.
    · **The resend cooldown resets on a resend, never on a wrong code.** A
      cooldown that punishes typing mistakes is the fastest way to lose
      somebody. The seconds come from the server's reply rather than being
      counted here, so the two cannot disagree.
    · **A lockout is on the CODE, not on the person.** "Use another number"
      stays live while locked, and asking for a new code clears it.

   ## What the server decides, and this does not

   The code length, the cooldown, how many attempts are left, when a lock
   lifts. All of them arrive in a response. The constants below are only what
   is drawn in the frame before the first reply.
   ══════════════════════════════════════════════════════════════════════════ */

const DEFAULT_OTP_LENGTH = 6;
const DEFAULT_RESEND_SECONDS = 60;
const DEFAULT_MAX_ATTEMPTS = 5;

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [status, setStatus] = useState('hydrating');
  const [user, setUser] = useState(null);

  const [pendingPhone, setPendingPhone] = useState(null);
  const [pendingPhoneMasked, setPendingPhoneMasked] = useState(null);
  const [otpLength, setOtpLength] = useState(DEFAULT_OTP_LENGTH);
  const [resendIn, setResendIn] = useState(0);
  const [attemptsLeft, setAttemptsLeft] = useState(DEFAULT_MAX_ATTEMPTS);
  const [lockedUntil, setLockedUntil] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  /*
   * Whether the sign-in panel is up, held here rather than in the navbar.
   *
   * It started in the bar, which is where it is opened from most of the time.
   * But the visit dialog needs to open it too — signing out of there has to
   * land somewhere, and the bar behind a modal cannot be tapped — and a
   * second copy of the panel driven by a second piece of state is how two
   * dialogs end up on screen at once. One flag, one panel, anybody may ask.
   *
   * The panel itself is rendered by the shell, not by this file: this
   * provider is imported BY the panel, and importing it back would be a
   * cycle.
   */
  const [signInOpen, setSignInOpen] = useState(false);
  const openSignIn = useCallback(() => setSignInOpen(true), []);
  const closeSignIn = useCallback(() => setSignInOpen(false), []);

  /* ── Opening, and then checking ────────────────────────────────────────
     The stored copy paints the first frame; the server decides whether the
     session is still real. A token can be revoked, blocked or signed out
     everywhere long before its own `exp`, and only /me knows that. */
  useEffect(() => {
    let active = true;

    (async () => {
      const stored = getSession();
      if (!stored) {
        setStatus('guest');
        return;
      }

      /* Optimistic: the page opens signed in and corrects itself if wrong. */
      setUser(stored.customer || null);
      setStatus('signedIn');

      try {
        const me = await customerAuthApi.me();
        if (!active) return;
        setUser(me);
        saveSession({ token: stored.token, customer: me });
      } catch (err) {
        if (!active) return;
        /* Offline is not signed out. Somebody on a train keeps the session
           they had; only the server actually refusing it ends one — and
           `apiClient` has already cleared storage by the time a 401 gets
           here. */
        if (err.code === 'NETWORK' || (err.status && err.status >= 500)) return;
        clearSession();
        setUser(null);
        setStatus('guest');
      }
    })();

    return () => { active = false; };
  }, []);

  /*
   * Anything that writes the session, wherever it happened.
   *
   * Three things do: signing in here, a 401 on any call (`apiClient` clears
   * it), and a visit request whose one-time code opens a session for whoever
   * just proved their number — which may be a DIFFERENT person from the one
   * in the bar, on a laptop passed across a table at a viewing.
   *
   * Subscribing to the writes rather than to any one of those means the bar
   * cannot go on showing a name the session no longer holds. That was a real
   * bug and not a theoretical one: the visit dialog cleared the session
   * directly, and the name stayed in the bar until the next page load.
   */
  useEffect(() => onSessionChange(() => {
    const live = getSession();
    setUser(live ? live.customer || null : null);
    setStatus(live ? 'signedIn' : 'guest');
  }), []);

  /* ── The resend cooldown ───────────────────────────────────────────────
     Driven from a SEND, never from a wrong code. */
  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const timer = setTimeout(() => setResendIn(value => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  /* The challenge fields every send answers with, applied in one place so a
     start and a resend cannot drift apart. */
  const acceptChallenge = useCallback((challenge, phone) => {
    setPendingPhone(phone);
    setPendingPhoneMasked(challenge?.phoneMasked || null);
    setOtpLength(challenge?.otpLength === 4 ? 4 : DEFAULT_OTP_LENGTH);
    setResendIn(challenge?.resendInSeconds || DEFAULT_RESEND_SECONDS);
    /* A fresh code gets a fresh set of attempts, and clears any lock. */
    setAttemptsLeft(challenge?.maxAttempts || DEFAULT_MAX_ATTEMPTS);
    setLockedUntil(null);
  }, []);

  /**
   * Ask for a code.
   *
   * Three outcomes, not two, because "refused" splits into two cases needing
   * opposite handling:
   *
   *   sent     a code is on its way — show the code box.
   *   pending  refused because one went out moments ago, so a VALID code is
   *            already in their messages. Also show the code box; holding
   *            somebody on the number form to wait out a timer for a code
   *            they already have is nonsense.
   *   failed   nothing was sent and nothing is coming. Stay, and say why.
   */
  const sendCode = useCallback(async (phone, { resending = false } = {}) => {
    setBusy(true);
    setError(null);
    try {
      const challenge = resending
        ? await customerAuthApi.resend(phone)
        : await customerAuthApi.start(phone);
      acceptChallenge(challenge, phone);
      return 'sent';
    } catch (err) {
      setError(err);

      /* `RESEND_TOO_SOON` and a plain rate limit both carry `retryAfter` and
         mean opposite things, so they are told apart by the code rather than
         by the field they share. */
      if (err.code === 'RESEND_TOO_SOON') {
        if (typeof err.retryAfter === 'number') setResendIn(err.retryAfter);
        setPendingPhone(phone);
        return 'pending';
      }
      if (typeof err.retryAfter === 'number') setResendIn(err.retryAfter);
      return 'failed';
    } finally {
      setBusy(false);
    }
  }, [acceptChallenge]);

  const resendCode = useCallback(() => {
    if (!pendingPhone || resendIn > 0) return Promise.resolve('failed');
    return sendCode(pendingPhone, { resending: true });
  }, [pendingPhone, resendIn, sendCode]);

  /**
   * The code, and the session it opens.
   *
   * Note what does NOT happen on a wrong code: the resend cooldown is left
   * alone. Only a send moves it.
   */
  const verifyCode = useCallback(async (otp, { name } = {}) => {
    if (!pendingPhone) {
      return { ok: false, reason: 'failed', message: 'Ask for a code first.' };
    }
    if (lockedUntil && Date.now() < lockedUntil) {
      return { ok: false, reason: 'locked', unlocksAt: lockedUntil };
    }

    setBusy(true);
    setError(null);
    try {
      const session = await customerAuthApi.verify({ phone: pendingPhone, otp, name });
      setUser(session.customer || null);
      setStatus('signedIn');
      setPendingPhone(null);
      setPendingPhoneMasked(null);
      setResendIn(0);
      return { ok: true, customer: session.customer || null };
    } catch (err) {
      setError(err);

      if (err.code === 'OTP_LOCKED') {
        const until = err.unlocksAt ? Date.parse(err.unlocksAt) : Date.now() + 10 * 60 * 1000;
        setLockedUntil(until);
        setAttemptsLeft(0);
        return { ok: false, reason: 'locked', unlocksAt: until };
      }

      if (err.code === 'OTP_WRONG') {
        const left = typeof err.attemptsLeft === 'number'
          ? err.attemptsLeft
          : Math.max(0, attemptsLeft - 1);
        setAttemptsLeft(left);
        return { ok: false, reason: 'wrong', attemptsLeft: left, message: err.message };
      }

      /* Expired, blocked, a database that is down. Every one of them has a
         sentence the server wrote, and every one needs the visitor to do
         something other than retype a digit. */
      return { ok: false, reason: 'failed', message: err.message };
    } finally {
      setBusy(false);
    }
  }, [pendingPhone, lockedUntil, attemptsLeft]);

  /** Back to the number form. Available while locked — the lock is on the code. */
  const changeNumber = useCallback(() => {
    setPendingPhone(null);
    setPendingPhoneMasked(null);
    setError(null);
    setResendIn(0);
    setAttemptsLeft(DEFAULT_MAX_ATTEMPTS);
    setLockedUntil(null);
  }, []);

  const signOut = useCallback(() => {
    customerAuthApi.signOut();
    setUser(null);
    setStatus('guest');
    changeNumber();
  }, [changeNumber]);

  /**
   * The name on the account, set or corrected after the code has been checked.
   *
   * A PATCH rather than a field on the verify call, because this is the panel
   * that runs AFTER signing in: the account exists, the session is real, and
   * `/me` is the endpoint that owns the profile. The verify call still carries
   * a name when one is known up front — that is a different moment with a
   * different rule, and the server treats it differently too (it only ever
   * fills a blank there; here an edit replaces what was stored).
   */
  const saveName = useCallback(async (name) => {
    const updated = await customerAuthApi.updateName(name);
    setUser(updated);
    const live = getSession();
    if (live) saveSession({ token: live.token, customer: updated });
    return updated;
  }, []);

  const value = useMemo(() => ({
    status,
    user,
    isSignedIn: status === 'signedIn',
    otpLength,
    pendingPhone,
    pendingPhoneMasked,
    resendIn,
    attemptsLeft,
    lockedUntil,
    busy,
    error,
    signInOpen,
    openSignIn,
    closeSignIn,
    sendCode,
    resendCode,
    verifyCode,
    changeNumber,
    signOut,
    saveName,
  }), [
    status, user, otpLength, pendingPhone, pendingPhoneMasked, resendIn,
    attemptsLeft, lockedUntil, busy, error, signInOpen,
    openSignIn, closeSignIn,
    sendCode, resendCode, verifyCode, changeNumber, signOut, saveName,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * The session, from anywhere on the site.
 *
 * Throws outside the provider rather than handing back a null that every
 * caller would have to remember to check — a component reading this outside
 * the tree is a wiring mistake, and it should say so at the first render
 * rather than draw a signed-out navbar forever.
 */
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
