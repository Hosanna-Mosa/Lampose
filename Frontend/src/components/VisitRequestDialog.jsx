import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import visitRequestsApi from '../api/visitRequestsApi';

/* ══════════════════════════════════════════════════════════════════════════
   Request a visit — the two steps before the owner hears anything.

     1. Who is asking:  name, phone, email, and consent to be messaged.
     2. Prove the phone: a code by SMS.

   The owner is contacted only after step 2 clears. That ordering is the whole
   reason this dialog exists — without it the button on the listing page is a
   way to make a stranger's phone ring with an invented name attached.
   ══════════════════════════════════════════════════════════════════════════ */

const TEN_DIGITS = /^[6-9]\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function VisitRequestDialog({ listing, sharing, intent, onClose, onVerified }) {
  const [step, setStep] = useState('form');
  const [form, setForm] = useState({ name: '', phone: '', email: '', consent: true });
  const [pending, setPending] = useState(null);   // the started request
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [cooldown, setCooldown] = useState(0);

  const firstField = useRef(null);
  const otpField = useRef(null);
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
    (step === 'form' ? firstField : otpField).current?.focus();
  }, [step]);

  // Resend countdown.
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const submitForm = async e => {
    e.preventDefault();
    setErr(null);

    // Checked here as well as on the server, so a typo costs no round trip.
    if (!form.name.trim()) return setErr({ message: 'Please enter your name.' });
    if (!TEN_DIGITS.test(form.phone.trim())) {
      return setErr({ message: 'Please enter a valid 10-digit mobile number.' });
    }
    if (!EMAIL_RE.test(form.email.trim())) {
      return setErr({ message: 'Please enter a valid email address.' });
    }

    setBusy(true);
    try {
      const started = await visitRequestsApi.start({
        listingId: listing.id,
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
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

      setPending(started);
      setCooldown(started.resendInSeconds || 60);
      setStep('otp');
    } catch (error) {
      setErr(error);
    } finally {
      setBusy(false);
    }
  };

  const submitOtp = async e => {
    e.preventDefault();
    setErr(null);
    if (otp.trim().length !== 6) return setErr({ message: 'Enter the 6-digit code.' });

    setBusy(true);
    try {
      const verified = await visitRequestsApi.verify(pending.id, otp.trim());
      onVerified(verified);
    } catch (error) {
      setErr(error);
      if (error.code === 'OTP_EXPIRED' || error.code === 'OTP_LOCKED') setOtp('');
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setErr(null);
    setBusy(true);
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
              {step === 'form' ? 'Request a visit' : 'Verify your number'}
            </h2>
            <p className="vr-sub">
              {step === 'form'
                ? (
                  <>
                    We&rsquo;ll ask the owner of <strong>{listing.name}</strong> whether
                    {sharing?.label ? <> <strong>{sharing.label}</strong> is</> : <> it&rsquo;s</>} free
                    to look at.
                  </>
                )
                : <>We sent a 6-digit code to <strong>{pending?.phoneMasked}</strong>.</>}
            </p>
          </div>
        </header>

        {step === 'form' ? (
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

            <label className="vr-field">
              <span>Email</span>
              <input
                type="email" value={form.email} onChange={set('email')}
                autoComplete="email" placeholder="you@example.com"
              />
            </label>

            <label className="vr-consent">
              <input type="checkbox" checked={form.consent} onChange={set('consent')} />
              <span>Send me the owner&rsquo;s answer on WhatsApp. You&rsquo;ll see it on this page either way.</span>
            </label>

            {err && <p className="vr-err" role="alert">{err.message}</p>}

            <button className="vr-submit" type="submit" disabled={busy}>
              {busy ? 'Sending code…' : 'Send verification code'}
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

            <button className="vr-submit" type="submit" disabled={busy || otp.length !== 6}>
              {busy ? 'Checking…' : 'Verify & ask the owner'}
            </button>

            <div className="vr-resend">
              {cooldown > 0
                ? <span>Didn&rsquo;t get it? You can resend in {cooldown}s.</span>
                : (
                  <button type="button" className="vr-linkbtn" onClick={resend} disabled={busy}>
                    Resend the code
                  </button>
                )}
              <button type="button" className="vr-linkbtn" onClick={() => { setStep('form'); setErr(null); }}>
                Change number
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
