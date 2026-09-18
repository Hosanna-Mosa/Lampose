import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../../../auth/AuthProvider';
import { Icon } from '../../atoms/Icon/Icon';
import {
  Box, Form, Heading, Inline, Input, Label, Masthead, PlainButton, Strong, Text,
} from '../../atoms';

/* ══════════════════════════════════════════════════════════════════════════
   Sign in — a number, then a code.

   The same two steps as the visit dialog beside it, and deliberately the same
   panel: a visitor who has proved their number once here should recognise the
   screen when the visit flow asks, and the other way round.

   ## Why the site has a sign-in at all

   It did not, for a long time, and it did not need one: a session opened as a
   side effect of proving a number on a visit request, which is all the site
   ever asked anybody to do. What that could not answer is somebody who
   already HAS an account — they asked for a visit on their phone last week —
   arriving on a laptop. They were a stranger again, and the second request
   cost a second SMS to prove a number the account had already proved.

   ## What signing in does NOT do

   Nothing on lampose.com is behind it. Browsing, filtering and opening a
   listing are all exactly as they were signed out; the only difference is
   that the visit dialog stops asking for a code it does not need, and the
   navbar can say who you are. A site that makes somebody sign in to look at
   rooms is a site they leave.

   ## The name is asked AFTER the code, and it is prefilled

   Three panels, not two. The name used to sit beside the code boxes, empty,
   and that is wrong in both directions: a returning visitor was asked for a
   name the account already had, and there was no way to show them what it was
   — because at that moment nobody knows who they are. The number has not been
   proven yet, and a reply to "send me a code" that named the account holder
   would tell anybody who typed a number whether it has an account and what
   that person is called.

   So the code is checked first. The session that comes back carries the name
   the account already holds, and the last panel opens with it filled in: keep
   it, or correct it, and that is the only place on this site where a name is
   edited without going near a password.

   A brand-new account arrives with an empty box, which is the same panel with
   nothing in it.
   ══════════════════════════════════════════════════════════════════════════ */

const TEN_DIGITS = /^[6-9]\d{9}$/;

/** "9:41 pm", for a lock that lifts. A wait you cannot see the end of is a wait people abandon. */
const clockTime = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export function SignInDialog({ onClose, onSignedIn }) {
  const {
    otpLength, pendingPhone, pendingPhoneMasked, resendIn, attemptsLeft,
    busy, error, sendCode, resendCode, verifyCode, changeNumber, saveName,
  } = useAuth();

  const [digits, setDigits] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [problem, setProblem] = useState(null);
  const [locked, setLocked] = useState(null);
  const [savingName, setSavingName] = useState(false);

  /*
   * Set once the code has been checked, and it is what puts the last panel on
   * screen. Holds the name the account arrived with, so "did they change it"
   * is a comparison rather than a guess — an unchanged name is not written
   * back, and a returning visitor who taps straight through costs no request.
   */
  const [confirmed, setConfirmed] = useState(null);

  const phoneField = useRef(null);
  const codeField = useRef(null);
  const nameField = useRef(null);
  const panel = useRef(null);

  /* Which panel is on screen. The first two are read from the context rather
     than held here, so a code requested and then abandoned in a previous
     opening of this dialog brings it back to the code box instead of asking
     for a second SMS. */
  const step = confirmed ? 'name' : pendingPhone ? 'code' : 'phone';

  useEffect(() => {
    const field = { phone: phoneField, code: codeField, name: nameField }[step];
    field?.current?.focus();
  }, [step]);

  /* Escape closes it, like every other dialog on the site. */
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submitPhone = async (event) => {
    event.preventDefault();
    setProblem(null);

    if (!TEN_DIGITS.test(digits)) {
      setProblem(digits.length === 10
        ? 'An Indian mobile number starts with 6, 7, 8 or 9.'
        : 'Enter your 10-digit mobile number.');
      return;
    }

    /* `pending` means a code is already in their messages — the code box is
       the right place to be either way, and only an outright failure keeps
       them here. */
    const result = await sendCode(`+91${digits}`);
    if (result === 'failed') setProblem(error?.message || 'We could not send a code. Please try again.');
  };

  const submitCode = async (event) => {
    event.preventDefault();
    setProblem(null);
    if (code.length !== otpLength) return;

    const result = await verifyCode(code);

    if (result.ok) {
      /* Signed in already — the panel that follows is about the name on the
         account, not about getting in. Closing here instead would be the old
         behaviour, and it is what left a new account with no name on it. */
      const stored = result.customer?.name || '';
      setConfirmed({ name: stored });
      setName(stored);
      return;
    }

    setCode('');
    if (result.reason === 'locked') setLocked(result.unlocksAt);
    else if (result.reason === 'wrong') {
      setProblem(`That code is not right — ${result.attemptsLeft} ${result.attemptsLeft === 1 ? 'try' : 'tries'} left.`);
    } else setProblem(result.message);
  };

  const askAgain = async () => {
    setProblem(null);
    setLocked(null);
    setCode('');
    await resendCode();
  };

  const useAnotherNumber = () => {
    setProblem(null);
    setLocked(null);
    setCode('');
    changeNumber();
  };

  /**
   * Keep the name, or the correction to it, and finish.
   *
   * Only written when it actually differs from what the account arrived with:
   * a returning visitor tapping straight through is the common case, and it
   * should cost nothing. A failed write does NOT hold them on this panel —
   * they are signed in either way, and the name is editable from the profile
   * — but it is said out loud rather than swallowed.
   */
  const finish = async (event) => {
    event.preventDefault();
    const trimmed = name.trim();

    if (!trimmed) {
      setProblem('Enter your name — the owner sees it on a visit request.');
      return;
    }

    if (trimmed !== confirmed.name) {
      setSavingName(true);
      try {
        await saveName(trimmed);
      } catch (err) {
        setSavingName(false);
        setProblem(err.message || 'We could not save that name. You can change it later.');
        return;
      }
      setSavingName(false);
    }

    onSignedIn?.();
    onClose();
  };

  return (
    <Box className="vr-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <Box
        className="vr-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="signin-title"
        ref={panel}
      >
        <PlainButton className="vr-close" onClick={onClose} aria-label="Close">✕</PlainButton>

        <Masthead className="vr-head">
          {/* `exp-ico`, not Icon's default `svc-ico`: that class hides every
              path behind a stroke-dash offset only released inside a service
              card, so outside one it draws nothing. */}
          <Inline className="vr-head__badge"><Icon name="phone" className="exp-ico" /></Inline>
          <Box>
            <Heading level={2} className="vr-title" id="signin-title">
              {step === 'name' ? 'One last thing' : step === 'code' ? 'Enter your code' : 'Sign in'}
            </Heading>
            <Text className="vr-sub">
              {step === 'name'
                ? (confirmed.name
                  ? <>You&rsquo;re signed in. Owners see this name on a visit request — keep it or change it.</>
                  : <>You&rsquo;re signed in. Owners see this name on a visit request.</>)
                : step === 'code'
                  ? <>We sent a {otpLength}-digit code to <Strong>{pendingPhoneMasked || `+91 ${digits}`}</Strong>.</>
                  : 'Your mobile number is your account — there is no password to remember.'}
            </Text>
          </Box>
        </Masthead>

        {step === 'phone' ? (
          <Form className="vr-form" onSubmit={submitPhone} noValidate>
            <Label className="vr-field">
              <Inline>Mobile number</Inline>
              <Input
                ref={phoneField}
                className="vr-phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                maxLength={10}
                value={digits}
                onChange={e => setDigits(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="10-digit mobile number"
              />
            </Label>

            {problem && <Text className="vr-err" role="alert">{problem}</Text>}

            <PlainButton
              className="vr-submit"
              type="submit"
              disabled={busy || digits.length !== 10}
              aria-busy={busy}
            >
              {busy ? 'Sending a code...' : 'Send me a code'}
            </PlainButton>

            <Text className="vr-fine">
              We send one SMS to check the number is yours. It is the number an owner
              would call about a visit, and it is shared with nobody else.
            </Text>
          </Form>
        ) : step === 'code' ? (
          <Form className="vr-form" onSubmit={submitCode} noValidate>
            <Label className="vr-field">
              <Inline>{otpLength}-digit code</Inline>
              <Input
                ref={codeField}
                className="vr-otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={otpLength}
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, otpLength))}
                placeholder={'•'.repeat(otpLength)}
              />
            </Label>

            {locked && (
              <Text className="vr-err" role="alert">
                That code is spent. Ask for a new one below, or try again after {clockTime(locked)}.
              </Text>
            )}
            {!locked && problem && <Text className="vr-err" role="alert">{problem}</Text>}

            <PlainButton
              className="vr-submit"
              type="submit"
              disabled={busy || code.length !== otpLength || Boolean(locked)}
              aria-busy={busy}
            >
              {busy ? 'Checking...' : 'Sign in'}
            </PlainButton>

            <Box className="vr-resend">
              {resendIn > 0
                ? <Inline>Didn&rsquo;t get it? You can resend in {resendIn}s.</Inline>
                : (
                  <PlainButton type="button" className="vr-linkbtn" onClick={askAgain} disabled={busy}>
                    Resend the code
                  </PlainButton>
                )}
              {/* Live even while the code is locked — the lock is on the code,
                  never on the person. */}
              <PlainButton type="button" className="vr-linkbtn" onClick={useAnotherNumber}>
                Use another number
              </PlainButton>
            </Box>

            {attemptsLeft > 0 && attemptsLeft < 3 && !locked && (
              <Text className="vr-fine">{attemptsLeft} attempts left before this code is spent.</Text>
            )}
          </Form>
        ) : (
          <Form className="vr-form" onSubmit={finish} noValidate>
            <Label className="vr-field">
              <Inline>Your name</Inline>
              {/* Prefilled from the account when it has one — which is only
                  knowable here, after the code proved who this is. */}
              <Input
                ref={nameField}
                className="vr-phone"
                type="text"
                autoComplete="name"
                maxLength={80}
                value={name}
                onChange={e => { setName(e.target.value); setProblem(null); }}
                placeholder="The name an owner will see"
              />
            </Label>

            {problem && <Text className="vr-err" role="alert">{problem}</Text>}

            <PlainButton
              className="vr-submit"
              type="submit"
              disabled={savingName || !name.trim()}
              aria-busy={savingName}
            >
              {savingName ? 'Saving...' : confirmed.name && name.trim() === confirmed.name ? 'Continue' : 'Save and continue'}
            </PlainButton>

            <Text className="vr-fine">
              You can change this later from any visit request. It is the only thing
              an owner is told about you besides your number.
            </Text>
          </Form>
        )}
      </Box>
    </Box>
  );
}
