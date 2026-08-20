import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import visitRequestsApi from '../api/visitRequestsApi';
import { sessionUser, clearSession } from '../auth/session';

/* ══════════════════════════════════════════════════════════════════════════
   Request a visit — what happens before the owner hears anything.

     1. Who is asking:  name, phone, and consent to be messaged.
     2. Prove the phone: a code by SMS.

   The owner is contacted only after step 2 clears. That ordering is the whole
   reason this dialog exists — without it the button on the listing page is a
   way to make a stranger's phone ring with an invented name attached.

   ## Coming back

   Step 2 leaves a session behind, good for a day. A visitor who returns
   inside that day has already done both steps, so the dialog opens on a
   confirm-and-send panel instead: their name, their number, the consent tick,
   one button. No form, no second SMS.

   The rule is not weakened by this — the number is still proven by a code
   before an owner is told, just not necessarily a code from today. The server
   decides, never this component: it compares the session's number against the
   one being requested and answers `otpRequired`. If that comes back true for
   any reason — the session expired in the meantime, the number did not match,
   auth is not configured — the dialog falls into step 2 and asks for a code.
   That is why there is no "am I still signed in" check anywhere below.
   ══════════════════════════════════════════════════════════════════════════ */

const TEN_DIGITS = /^[6-9]\d{9}$/;

/** "+91 ••••• 34115" — enough to recognise, not enough to read out. */
const maskPhone = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '').slice(-10);
  return digits.length === 10 ? `+91 ••••• ${digits.slice(5)}` : '';
};

export default function VisitRequestDialog({ listing, sharing, intent, onClose, onVerified }) {
  /*
   * Read once, when the dialog opens, rather than on every render: the token
   * expiring mid-flow must not swap the panel out from under somebody who is
   * halfway through. The request they are sending will simply be asked for a
   * code, which is the correct outcome and one they can act on.
   */
  const [known] = useState(() => sessionUser());

  /* Only skipped when the session carries BOTH halves of what the form asks
     for. A session opened before the name was recorded still needs the form —
     the server requires a name on every request. */
  const canSkipForm = Boolean(known && known.name && known.phone);

  const [step, setStep] = useState(canSkipForm ? 'known' : 'form');
  /*
   * No email.
   *
   * The whole flow runs on the phone number — the OTP that proves it, the
   * owner's WhatsApp, the outcome message back. Nothing was ever sent to the
   * address, so it was a required field standing between a visitor and a
   * request for no return. The server treats it as optional now.
   */
  const [form, setForm] = useState(() => ({
    /* Prefilled from a session that was not complete enough to skip the form
       outright — half-known still beats typing it all again. */
    name: (known && known.name) || '',
    phone: String((known && known.phone) || '').replace(/\D/g, '').slice(-10),
    consent: true,
  }));
  const [pending, setPending] = useState(null);   // the started request
  const [otp, setOtp] = useState('');
  /* `false`, or the sentence to show on the button while it works. */
  const [busy, setBusy] = useState(false);
  /* The room is gone: the request is finished and cannot be retried. */
  const [closed, setClosed] = useState(false);
  const [err, setErr] = useState(null);
  const [cooldown, setCooldown] = useState(0);

  const firstField = useRef(null);
  const otpField = useRef(null);
  const askButton = useRef(null);
  const panel = useRef(null);
  const opener = useRef(null);

  const set = k => e => {
    const v = k === 'consent' ? e.target.checked : e.target.value;
    setForm(f => ({ ...f, [k]: v }));
  };

  /* Escape closes, the page behind does not scroll, and focus comes back to
     whatever opened this when it goes away. */
  useEffect(() => {
    opener.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = e => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key !== 'Tab' || !panel.current) return;

      // Keep tabbing inside the dialog — behind it is a whole page of links.
      const focusable = panel.current.querySelectorAll(
        'button:not([disabled]),input:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])'
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      opener.current?.focus?.();
    };
  }, [onClose]);

  useEffect(() => {
    /* The known panel has nothing to type in, so focus lands on its button —
       something has to hold focus inside a modal for the keyboard to work. */
    ({ form: firstField, otp: otpField, known: askButton })[step]?.current?.focus();
  }, [step]);

  // Resend countdown.
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  /**
   * Send the request, and go wherever the server says next.
   *
   * Shared by both panels because the difference between them is only which
   * name and number go in — everything after the call is identical, and the
   * three outcomes below are the same three either way.
   */
  const startRequest = async ({ name, phone }) => {
    /* A sentence, not `true`: the button renders this, and one panel is
       sending a code while the other is asking the owner outright. */
    setBusy('Sending...');
    try {
      const started = await visitRequestsApi.start({
        listingId: listing.id,
        name,
        phone,
        sharing: sharing?.label || null,
        /* Only the choices travel — no prices. The backend re-derives every
           figure from the property, so nothing here can set what the owner
           is told a room costs. */
        intent: intent ? {
          stayType: intent.stayType,
          duration: intent.duration,
          durationUnit: intent.durationUnit,
          joiningDate: intent.joiningDate,
          flexibleJoin: intent.flexibleJoin,
          /* Hotels. The backend turns the two dates into the nights and the
             joining date the rest of the flow reads. */
          checkIn: intent.checkIn,
          checkOut: intent.checkOut,
          rateStructure: intent.rateStructure,
          rateQuantity: intent.rateQuantity,
        } : null,
        consentedTerms: intent?.consented === true,
        consentWhatsApp: form.consent,
      });

      /* Already waiting from an earlier visit on another device — there is no
         code to enter, so go straight to the waiting state. */
      if (started.status === 'pending_owner') {
        onVerified(started);
        return;
      }

      /* The session covered it: the number is already proven, so no code was
         sent and nothing needs typing. One more call tells the owner. */
      if (!started.otpRequired) {
        onVerified(await visitRequestsApi.verify(started.id));
        return;
      }

      setPending(started);
      setCooldown(started.resendInSeconds || 60);
      setStep('otp');
    } catch (error) {
      setErr(error);
      /* A request that turns out to need the form after all — no name on the
         session, say. Falling back beats an error the visitor cannot act on. */
      if (error.code === 'BAD_NAME' || error.code === 'BAD_PHONE') setStep('form');
    } finally {
      setBusy(false);
    }
  };

  const submitForm = e => {
    e.preventDefault();
    setErr(null);

    // Checked here as well as on the server, so a typo costs no round trip.
    if (!form.name.trim()) return setErr({ message: 'Please enter your name.' });
    if (!TEN_DIGITS.test(form.phone.trim())) {
      return setErr({ message: 'Please enter a valid 10-digit mobile number.' });
    }
    return startRequest({ name: form.name.trim(), phone: form.phone.trim() });
  };

  /* The returning visitor's one button. The number sent is the session's own,
     not anything on screen — the panel shows a masked copy, and a masked
     number is not something that could be submitted. */
  const submitKnown = e => {
    e.preventDefault();
    setErr(null);
    return startRequest({ name: known.name, phone: known.phone });
  };

  /* "Not you?" — drop the session and ask properly. Deliberately available on
     every request: a shared laptop at a property viewing is a real place for
     this dialog to be, and the way out has to be one click. */
  const useAnotherNumber = () => {
    clearSession();
    setForm({ name: '', phone: '', consent: form.consent });
    setErr(null);
    setStep('form');
  };

  /*
   * This step does more than check six digits.
   *
   * Behind it the server proves the number, saves the request, checks the
   * room, and messages the owner. The room is no longer checked at the form —
   * it is checked HERE — so "that room is taken" now arrives at this step
   * rather than the previous one, and it is final when it does: the request
   * is recorded as declined and there is nothing further to try.
   *
   * Which is why `closed` exists. Leaving the visitor on a Verify button that
   * can only ever fail again is the kind of dead end people re-tap three
   * times before giving up on the site.
   */
  const submitOtp = async e => {
    e.preventDefault();
    setErr(null);
    if (otp.trim().length !== 6) return setErr({ message: 'Enter the 6-digit code.' });

    /* Named, because the wait here is longer than a code check and the
       button is the only place the page can say what it is doing. */
    setBusy('Checking the room...');
    try {
      const verified = await visitRequestsApi.verify(pending.id, otp.trim());
      onVerified(verified);
    } catch (error) {
      setErr(error);
      if (error.code === 'OTP_EXPIRED' || error.code === 'OTP_LOCKED') setOtp('');
      /* The room went. The code was right and the request is saved — there is
         simply nothing left to ask the owner. */
      if (error.code === 'NO_BEDS_FREE' || error.code === 'OWNER_PAUSED') setClosed(true);
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setErr(null);
    setBusy('Sending a new code...');
    try {
      const again = await visitRequestsApi.resend(pending.id);
      setPending(again);
      setOtp('');
      setCooldown(again.resendInSeconds || 60);
    } catch (error) {
      setErr(error);
      if (error.retryAfter) setCooldown(error.retryAfter);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="vr-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        className="vr-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vr-title"
        ref={panel}
      >
        <button className="vr-close" onClick={onClose} aria-label="Close">✕</button>

        <header className="vr-head">
          {/* `exp-ico`, not Icon's default `svc-ico`: that class hides every
              path behind a stroke-dash offset that is only released by
              `.svc-card.visible`, so outside a service card it draws nothing. */}
          <span className="vr-head__badge"><Icon name="calendar" className="exp-ico" /></span>
          <div>
            <h2 className="vr-title" id="vr-title">
              {step === 'otp' ? 'Verify your number' : 'Request a visit'}
            </h2>
            <p className="vr-sub">
              {step === 'otp'
                ? <>We sent a 6-digit code to <strong>{pending?.phoneMasked}</strong>.</>
                : (
                  <>
                    We&rsquo;ll ask the owner of <strong>{listing.name}</strong> whether
                    {sharing?.label ? <> <strong>{sharing.label}</strong> is</> : <> it&rsquo;s</>} free
                    to look at.
                  </>
                )}
            </p>
          </div>
        </header>

        {step === 'known' ? (
          <form className="vr-form" onSubmit={submitKnown} noValidate>
            <div className="vr-known">
              <span className="vr-known__label">Requesting as</span>
              <strong className="vr-known__name">{known.name}</strong>
              <span className="vr-known__phone">{maskPhone(known.phone)}</span>
            </div>

            <label className="vr-consent">
              <input type="checkbox" checked={form.consent} onChange={set('consent')} />
              <span>Send me the owner&rsquo;s answer on WhatsApp. You&rsquo;ll see it on this page either way.</span>
            </label>

            {err && <p className="vr-err" role="alert">{err.message}</p>}

            <button className="vr-submit" type="submit" disabled={Boolean(busy)} aria-busy={Boolean(busy)} ref={askButton}>
              {busy || 'Ask the owner'}
            </button>

            <div className="vr-resend">
              <button type="button" className="vr-linkbtn" onClick={useAnotherNumber}>
                Not you? Use another number
              </button>
            </div>

            <p className="vr-fine">
              Your number is shared with the owner of this property only, so they can
              arrange the visit. Nothing is paid through this site.
            </p>
          </form>
        ) : step === 'form' ? (
          <form className="vr-form" onSubmit={submitForm} noValidate>
            <label className="vr-field">
              <span>Your name</span>
              <input
                ref={firstField}
                type="text" value={form.name} onChange={set('name')}
                autoComplete="name" placeholder="Venkatesh"
              />
            </label>

            <label className="vr-field">
              <span>Mobile number</span>
              <div className="vr-phone">
                <em>+91</em>
                <input
                  type="tel" inputMode="numeric" maxLength={10}
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, '') }))}
                  autoComplete="tel-national" placeholder="9876543210"
                />
              </div>
              <small>We&rsquo;ll text a code to confirm it&rsquo;s really you.</small>
            </label>

            <label className="vr-consent">
              <input type="checkbox" checked={form.consent} onChange={set('consent')} />
              <span>Send me the owner&rsquo;s answer on WhatsApp. You&rsquo;ll see it on this page either way.</span>
            </label>

            {err && <p className="vr-err" role="alert">{err.message}</p>}

            <button className="vr-submit" type="submit" disabled={Boolean(busy)} aria-busy={Boolean(busy)}>
              {busy || 'Send verification code'}
            </button>

            <p className="vr-fine">
              Your number is shared with the owner of this property only, so they can
              arrange the visit. Nothing is paid through this site.
            </p>
          </form>
        ) : (
          <form className="vr-form" onSubmit={submitOtp} noValidate>
            <label className="vr-field">
              <span>6-digit code</span>
              <input
                ref={otpField}
                className="vr-otp"
                type="text" inputMode="numeric" maxLength={6} autoComplete="one-time-code"
                value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="••••••"
              />
            </label>

            {err && (
              <p className="vr-err" role="alert">
                {err.message}
                {err.attemptsLeft === 0 && (
                  <button type="button" className="vr-linkbtn" onClick={onClose}>Start again</button>
                )}
              </p>
            )}

            {closed ? (
              /* Nothing to verify any more — the room went and the request is
                 closed. One button, and it is the one that helps. */
              <button className="vr-submit" type="button" onClick={onClose}>
                Browse other rooms
              </button>
            ) : (
              <button
                className="vr-submit"
                type="submit"
                disabled={Boolean(busy) || otp.length !== 6}
                aria-busy={Boolean(busy)}
              >
                {busy || 'Verify & ask the owner'}
              </button>
            )}

            {!closed && (
              <div className="vr-resend">
                {cooldown > 0
                  ? <span>Didn&rsquo;t get it? You can resend in {cooldown}s.</span>
                  : (
                    <button type="button" className="vr-linkbtn" onClick={resend} disabled={Boolean(busy)}>
                      Resend the code
                    </button>
                  )}
                <button type="button" className="vr-linkbtn" onClick={() => { setStep('form'); setErr(null); }}>
                  Change number
                </button>
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
