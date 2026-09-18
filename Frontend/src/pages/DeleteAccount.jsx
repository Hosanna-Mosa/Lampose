import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import deleteAccountApi from '../api/deleteAccountApi';
import {
  Anchor, Box, Emphasis, Form, Heading, Inline, Input, Label, List, ListItem,
  PlainButton, Region, Small, Strong, Text, TextArea,
} from '../components/common/atoms';

/* ══════════════════════════════════════════════════════════════════════════
   Delete Your Lampose Delivery Partner Account.

   A public page, and it has to be: Google Play requires that somebody be able
   to find out how to delete their account, and ask for it, from the open web —
   without the app, and without signing in. That is why there is no guard on
   this route and why it is linked from the footer.

   ## The shape of it

   Read first, form second. Somebody arriving here from the Play listing wants
   to know what happens before they set it going, so what is deleted, what is
   kept and how long it takes are all above the fold of the form rather than
   in small print under the button.

   ## Public, and still not something a stranger can do to you

   The form takes a phone number, and a phone number is a string anybody can
   type. So it is not what the request is made on: submitting sends a one-time
   code to that handset, and nothing is marked until the code comes back. The
   server answers an unregistered number exactly as it answers a registered
   one, so the page cannot be used to find out who rides for Lampose either.

   ## Say what actually happens

   The request is a REQUEST. It marks the account and schedules it; it does not
   empty the row while the button is still animating, and this page does not
   say it does. Riders carry orders, are owed money, and are covered by records
   we are required to keep — so the copy names what is deleted, what is kept,
   and why, rather than promising everything disappears at once.

   The grace period is READ FROM THE SERVER rather than typed into the copy. A
   page promising thirty days against a server that waits fourteen is the
   disagreement that ends up in front of a regulator.
   ══════════════════════════════════════════════════════════════════════════ */

const APP_NAME = 'Lampose Delivery Partner';

/* What the page prints before the server has answered, and if it never does.
   The same numbers the controller holds — see `driverDeletion.controller.js`. */
const FALLBACK_POLICY = { graceDays: 30, otpLength: 6, supportEmail: 'contact@lampose.com' };

const TEN_DIGITS = /^[6-9]\d{9}$/;

const CONFIRM_LINE = 'Are you sure you want to request deletion of your Lampose Delivery Partner '
  + 'account? This action cannot be easily undone.';

/** "12 October 2026" — a date somebody can hold against a calendar. */
const longDate = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
};

export function DeleteAccount() {
  const [policy, setPolicy] = useState(FALLBACK_POLICY);

  /* 'form' → 'code' → 'done'. `confirming` is the interstitial the spec asks
     for, and it is a step rather than a `window.confirm` so that it can be
     read, styled and dismissed like the rest of the page. */
  const [step, setStep] = useState('form');
  const [confirming, setConfirming] = useState(false);

  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [code, setCode] = useState('');

  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const [notice, setNotice] = useState(null);
  const [result, setResult] = useState(null);

  /* The grace period, from the server that enforces it. A failure is not worth
     showing anybody — the fallback above is the same number. */
  useEffect(() => {
    let active = true;
    deleteAccountApi.policy()
      .then(data => { if (active && data) setPolicy({ ...FALLBACK_POLICY, ...data }); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => { window.scrollTo(0, 0); }, []);

  const askToConfirm = (event) => {
    event.preventDefault();
    setProblem(null);

    if (!TEN_DIGITS.test(phone)) {
      setProblem(phone.length === 10
        ? 'An Indian mobile number starts with 6, 7, 8 or 9.'
        : 'Enter the 10-digit mobile number registered on your Lampose Delivery Partner account.');
      return;
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
      setProblem('That email address does not look right. Leave it blank if you would rather not give one.');
      return;
    }

    setConfirming(true);
  };

  /* Confirmed. From here the number has to prove it is theirs. */
  const sendCode = async () => {
    setConfirming(false);
    setBusy(true);
    setProblem(null);
    setNotice(null);

    try {
      const started = await deleteAccountApi.start(`+91${phone}`);

      /* Already asked for, and still inside the window. Nothing further to do,
         and saying "we sent a code" would be untrue. */
      if (started?.alreadyRequested && started.request) {
        setResult(started.request);
        setStep('done');
        return;
      }

      setStep('code');
      setNotice(started?.resendInSeconds
        ? `A code was sent to this number moments ago — enter that one. You can ask for another in ${started.resendInSeconds}s.`
        : null);
    } catch (err) {
      setProblem(err.message);
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (event) => {
    event.preventDefault();
    setProblem(null);

    if (code.length !== policy.otpLength) {
      setProblem(`The code is ${policy.otpLength} digits.`);
      return;
    }

    setBusy(true);
    try {
      const confirmed = await deleteAccountApi.confirm({
        phone: `+91${phone}`, code, email, reason,
      });
      setResult(confirmed);
      setStep('done');
    } catch (err) {
      setProblem(err.message);
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const support = policy.supportEmail || FALLBACK_POLICY.supportEmail;
  const days = policy.graceDays || FALLBACK_POLICY.graceDays;

  return (
    <Region id="delete-account" className="da-page">
      <Box className="da-inner">

        {/* ── Heading ─────────────────────────────────────────────────── */}
        <Box className="da-head">
          <Inline className="da-tag">Account &amp; data</Inline>
          <Heading level={1} className="da-h1">
            Delete Your <Emphasis>{APP_NAME}</Emphasis> Account
          </Heading>
          <Text className="da-lede">
            This page is for <Strong>{APP_NAME}</Strong> users — the delivery riders who take
            Lampose orders — who want to request deletion of their account and the personal
            data held against it. You do not need to sign in, and you do not need the app.
          </Text>
          <Text className="da-note">
            Requesting deletion here affects your <Strong>{APP_NAME}</Strong> rider account only.
            It does not affect a separate Lampose customer account registered on the same number.
          </Text>
        </Box>

        {/* ── 1. The form ─────────────────────────────────────────────── */}
        <Box className="da-card da-card--form" id="request">
          <Heading level={2} className="da-h2">Delete Account</Heading>

          {step === 'done' ? (
            <Box className="da-done" role="status">
              <Box className="da-done__mark" aria-hidden="true">✓</Box>
              <Heading level={3} className="da-done__title">Your request has been received</Heading>
              <Text className="da-done__body">
                We have recorded a deletion request for{' '}
                <Strong>{result?.phoneMasked || `the number ending ${phone.slice(-4)}`}</Strong>.
                {result?.alreadyRequested && ' This account was already scheduled for deletion, so nothing has changed.'}
              </Text>

              <List className="da-done__facts">
                {longDate(result?.requestedAt) && (
                  <ListItem><Strong>Requested:</Strong> {longDate(result.requestedAt)}</ListItem>
                )}
                {longDate(result?.scheduledFor) && (
                  <ListItem>
                    <Strong>Scheduled for deletion on or after:</Strong> {longDate(result.scheduledFor)}
                  </ListItem>
                )}
                <ListItem>
                  <Strong>Reference:</Strong> the mobile number you verified. Quote it if you contact support.
                </ListItem>
              </List>

              {result?.activeOrders > 0 && (
                <Text className="da-warn" role="alert">
                  You currently have {result.activeOrders} delivery
                  {result.activeOrders === 1 ? '' : 'ies'} in progress. Please complete
                  {result.activeOrders === 1 ? ' it' : ' them'} — your request is recorded either way,
                  and the food still has to reach the customer.
                </Text>
              )}

              <Text className="da-done__after">
                Changed your mind? Email <Anchor href={`mailto:${support}`}>{support}</Anchor> from
                the phone number or email address on the account before the date above and we will
                cancel the request.
              </Text>
            </Box>
          ) : step === 'code' ? (
            <Form className="da-form" onSubmit={submitCode} noValidate>
              <Text className="da-form__intro">
                We sent a {policy.otpLength}-digit code by SMS to <Strong>+91 {phone}</Strong>.
                Enter it to confirm the request. This is how we check the account is yours —
                without it, anybody could request deletion of somebody else&rsquo;s account.
              </Text>

              <Label className="da-field">
                <Inline className="da-label">Verification code</Inline>
                <Input
                  className="da-input da-input--code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={policy.otpLength}
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, policy.otpLength))}
                  placeholder={'•'.repeat(policy.otpLength)}
                  autoFocus
                />
              </Label>

              {notice && <Text className="da-notice">{notice}</Text>}
              {problem && <Text className="da-err" role="alert">{problem}</Text>}

              <PlainButton
                className="da-btn da-btn--danger"
                type="submit"
                disabled={busy || code.length !== policy.otpLength}
                aria-busy={busy}
              >
                {busy ? 'Confirming...' : 'Confirm deletion request'}
              </PlainButton>

              <PlainButton
                type="button"
                className="da-linkbtn"
                onClick={() => { setStep('form'); setCode(''); setProblem(null); setNotice(null); }}
              >
                Use a different number
              </PlainButton>
            </Form>
          ) : (
            <Form className="da-form" onSubmit={askToConfirm} noValidate>
              <Label className="da-field">
                <Inline className="da-label">Registered mobile number <Inline className="da-req">*</Inline></Inline>
                <Box className="da-phone">
                  <Inline className="da-phone__cc">+91</Inline>
                  <Input
                    className="da-input"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    maxLength={10}
                    value={phone}
                    onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="9876543210"
                  />
                </Box>
                <Small className="da-hint">
                  The number you sign in to the {APP_NAME} app with. We will text a code to it.
                </Small>
              </Label>

              <Label className="da-field">
                <Inline className="da-label">
                  Registered email address <Inline className="da-opt">(optional)</Inline>
                </Inline>
                <Input
                  className="da-input"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
                <Small className="da-hint">
                  The app signs in by mobile number, so this is not required. Give one if you would
                  like written confirmation of the request.
                </Small>
              </Label>

              <Label className="da-field">
                <Inline className="da-label">
                  Reason for deletion <Inline className="da-opt">(optional)</Inline>
                </Inline>
                <TextArea
                  className="da-input da-textarea"
                  rows={3}
                  maxLength={500}
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="Anything you would like us to know. This does not affect the request."
                />
              </Label>

              {problem && <Text className="da-err" role="alert">{problem}</Text>}

              <PlainButton
                className="da-btn da-btn--danger"
                type="submit"
                disabled={busy}
                aria-busy={busy}
              >
                {busy ? 'Sending a code...' : 'Request Account Deletion'}
              </PlainButton>

              <Small className="da-hint da-hint--foot">
                Submitting sends a verification code to the number above. Nothing is deleted or
                scheduled until you enter that code.
              </Small>
            </Form>
          )}
        </Box>

        {/* ── 2. How to request ───────────────────────────────────────── */}
        <Box className="da-card">
          <Heading level={2} className="da-h2">How to request account deletion</Heading>
          <Text className="da-p">There are two ways, and both end in the same place.</Text>
          <List className="da-steps">
            <ListItem>
              <Strong>From this page.</Strong> Enter the mobile number registered on your
              {' '}{APP_NAME} account above, confirm, and enter the code we text you.
            </ListItem>
            <ListItem>
              <Strong>From the app.</Strong> Open the {APP_NAME} app, go to Profile, and use the
              account deletion option there. You are already signed in, so no code is needed.
            </ListItem>
            <ListItem>
              <Strong>By email.</Strong> If neither works — for example you no longer have the SIM —
              write to <Anchor href={`mailto:${support}`}>{support}</Anchor> from the email address
              on your account and we will verify you another way.
            </ListItem>
          </List>
        </Box>

        {/* ── 3. What is deleted ──────────────────────────────────────── */}
        <Box className="da-card">
          <Heading level={2} className="da-h2">What data will be deleted</Heading>
          <Text className="da-p">
            When an account deletion request is approved and processed, personal account
            information and other data associated with the account will be deleted where
            applicable. For a {APP_NAME} account that means:
          </Text>
          <List className="da-list">
            <ListItem>Your profile — name, date of birth, city, and profile photograph.</ListItem>
            <ListItem>Your contact details — mobile number and email address.</ListItem>
            <ListItem>
              Identity and vehicle documents you uploaded — licence, RC, Aadhaar, PAN and
              insurance — together with the images themselves.
            </ListItem>
            <ListItem>Your address and any saved location details.</ListItem>
            <ListItem>Bank and payout details held for settlements.</ListItem>
            <ListItem>Your live and historical location data.</ListItem>
            <ListItem>Device registrations, so the app stops sending you notifications.</ListItem>
            <ListItem>Support conversations you raised from the rider app.</ListItem>
          </List>
        </Box>

        {/* ── 4. What is kept ─────────────────────────────────────────── */}
        <Box className="da-card">
          <Heading level={2} className="da-h2">What data may be retained</Heading>
          <Text className="da-p">
            Certain information may be retained when required for legal, security,
            fraud-prevention, financial, tax, or regulatory purposes. Any retained information
            will be kept only for the required retention period.
          </Text>
          <List className="da-list">
            <ListItem>
              <Strong>Delivery and payment records.</Strong> Records of completed deliveries and
              the payouts made against them are books of account, and we are required to keep them.
            </ListItem>
            <ListItem>
              <Strong>Tax and financial documents.</Strong> Invoices, settlements and statements
              required under applicable tax law.
            </ListItem>
            <ListItem>
              <Strong>Safety and fraud records.</Strong> Where an account is connected to a safety
              report, a dispute, or suspected fraud, the record is kept for as long as needed to
              deal with it.
            </ListItem>
            <ListItem>
              <Strong>Records required by a legal obligation</Strong> — for example a court order
              or a lawful request from an authority.
            </ListItem>
          </List>
          <Text className="da-p">
            Where records like these are kept, they are separated from your profile and are not
            used to contact you or to identify you as an active rider.
          </Text>
        </Box>

        {/* ── 5. Retention period ─────────────────────────────────────── */}
        <Box className="da-card">
          <Heading level={2} className="da-h2">Data retention period</Heading>
          <List className="da-list">
            <ListItem>
              <Strong>Grace period — {days} days.</Strong> A confirmed request is scheduled, not
              carried out immediately. This window lets us settle anything owed to you and lets
              you change your mind.
            </ListItem>
            <ListItem>
              <Strong>Deletion — after the grace period.</Strong> Account data in the list above is
              then deleted from our live systems.
            </ListItem>
            <ListItem>
              <Strong>Backups — up to 90 days.</Strong> Copies may persist in routine encrypted
              backups until those backups age out on their normal cycle.
            </ListItem>
            <ListItem>
              <Strong>Retained records — only as long as the law requires.</Strong> The financial,
              tax and safety records described above are kept for the period the relevant law sets
              and are deleted when it ends.
            </ListItem>
          </List>
        </Box>

        {/* ── 6. What happens next ────────────────────────────────────── */}
        <Box className="da-card">
          <Heading level={2} className="da-h2">What happens after the deletion request</Heading>
          <List className="da-steps">
            <ListItem>
              <Strong>Straight away.</Strong> Your request is recorded against the account and
              scheduled. You will see a confirmation on this page.
            </ListItem>
            <ListItem>
              <Strong>Any work in progress.</Strong> If you are carrying a delivery, please
              complete it. Your request stands either way.
            </ListItem>
            <ListItem>
              <Strong>Settlement.</Strong> Anything owed to you is paid to the bank details on the
              account during the grace period. Keep those details correct until then.
            </ListItem>
            <ListItem>
              <Strong>After {days} days.</Strong> The account is deleted in line with the policy on
              this page, and you will no longer be able to sign in to the {APP_NAME} app.
            </ListItem>
            <ListItem>
              <Strong>Starting again.</Strong> You are welcome to register again later, but it will
              be a new account — your documents will need to be verified afresh.
            </ListItem>
          </List>
        </Box>

        {/* ── 7. Support ──────────────────────────────────────────────── */}
        <Box className="da-card da-card--support">
          <Heading level={2} className="da-h2">Contact &amp; support</Heading>
          <Text className="da-p">
            If you need assistance with account deletion, contact Lampose Support at{' '}
            <Anchor className="da-mail" href={`mailto:${support}`}>{support}</Anchor>.
          </Text>
          <Text className="da-p">
            Please write from the email address or mobile number registered on your account, and
            tell us it is about a <Strong>{APP_NAME}</Strong> account, so we can find it quickly.
          </Text>
        </Box>

        {/* ── Footer links ────────────────────────────────────────────── */}
        <Box className="da-links">
          <Link to="/privacy">Privacy Policy</Link>
          <Inline className="da-dot" aria-hidden="true">·</Inline>
          <Link to="/terms">Terms &amp; Conditions</Link>
          <Inline className="da-dot" aria-hidden="true">·</Inline>
          <Link to="/">Lampose home</Link>
        </Box>
      </Box>

      {/* ── The confirmation, before anything is sent ─────────────────── */}
      {confirming && (
        <Box
          className="da-overlay"
          onMouseDown={e => { if (e.target === e.currentTarget) setConfirming(false); }}
        >
          <Box className="da-modal" role="alertdialog" aria-modal="true" aria-labelledby="da-confirm-title">
            <Heading level={2} className="da-modal__title" id="da-confirm-title">
              Confirm your request
            </Heading>
            <Text className="da-modal__body">{CONFIRM_LINE}</Text>
            <Text className="da-modal__sub">
              We will text a {policy.otpLength}-digit code to <Strong>+91 {phone}</Strong>. Nothing
              is scheduled until you enter it.
            </Text>
            <Box className="da-modal__actions">
              <PlainButton className="da-btn da-btn--ghost" type="button" onClick={() => setConfirming(false)}>
                Cancel
              </PlainButton>
              <PlainButton className="da-btn da-btn--danger" type="button" onClick={sendCode}>
                Yes, continue
              </PlainButton>
            </Box>
          </Box>
        </Box>
      )}
    </Region>
  );
}
