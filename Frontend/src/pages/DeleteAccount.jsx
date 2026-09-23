import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import deleteAccountApi from '../api/deleteAccountApi';
import {
  Anchor, Box, Emphasis, FieldSet, Form, Heading, Inline, Input, Label, Legend, List, ListItem,
  PlainButton, Region, Small, Strong, Text, TextArea,
} from '../components/common/atoms';

/* ══════════════════════════════════════════════════════════════════════════
   Delete Your Lampose Account — for every Lampose app.

   A public page, and it has to be: Google Play requires that somebody be able
   to find out how to delete their account, and ask for it, from the open web —
   without the app, and without signing in. That is why there is no guard on
   this route and why it is linked from the footer.

   ## Four apps, four accounts

   The Lampose app (students and diners), Stay Partner (property owners), the
   Partner app (restaurants) and Delivery Partner (riders) each hold their own
   accounts, and one phone number can have one in each. So the page asks which
   app FIRST, and the request only ever touches that one. Each store listing
   links straight to its own app with `?app=` — see `APPS` below for the keys
   and `ALIASES` for the friendlier spellings a hand-written link might use.

   ## Public, and still not something a stranger can do to you

   The form takes a phone number, and a phone number is a string anybody can
   type. So it is not what the request is made on: submitting sends a one-time
   code to that handset, and nothing is marked until the code comes back. The
   server answers an unregistered number exactly as it answers a registered
   one, so the page cannot be used to find out who uses Lampose either.

   ## Say what actually happens

   The request is a REQUEST. It marks the account and schedules it; it does not
   empty the row while the button is still animating, and this page does not
   say it does. The grace period is READ FROM THE SERVER rather than typed into
   the copy — a page promising thirty days against a server that waits fourteen
   is the disagreement that ends up in front of a regulator.
   ══════════════════════════════════════════════════════════════════════════ */

/* What the page says about each app. The keys are the server's
   (`accountDeletion.audiences.js`); the words are the page's. */
const APPS = {
  customer: {
    name: 'Lampose',
    who: 'students and diners who book stays and order food',
    short: 'Book stays, order food',
    workNoun: ['order or booking', 'orders or bookings'],
    deleted: [
      'Your profile — name, email address and profile details.',
      'Your mobile number, once the request is carried out.',
      'Saved places, favourite kitchens and dishes, and your address book.',
      'Search, notification and app preferences.',
      'Device registrations, so the app stops sending you notifications.',
      'Your name and number on support conversations you raised from the app.',
    ],
    kept: [
      ['Booking and payment records.', 'Completed stays, rental agreements, food orders and the payments and refunds made against them are books of account, and we are required to keep them.'],
    ],
    beforeYouGo: 'If you have a stay in progress or a food order on its way, it carries on as normal. Refunds owed to you are paid during the grace period.',
  },
  partner: {
    name: 'Lampose Stay Partner',
    who: 'property owners who list rooms, PGs and hostels',
    short: 'List and manage your property',
    workNoun: ['booking', 'bookings'],
    deleted: [
      'Your owner profile — name, email address and profile photograph.',
      'Your mobile number and address, once the request is carried out.',
      'Bank and payout details held for settlements.',
      'Staff you invited, and the notifications sent to you.',
      'Device registrations, so the app stops sending you notifications.',
      'Your name and number on support conversations you raised from the app.',
    ],
    kept: [
      ['Booking and payout records.', 'Bookings made at your property and the payouts made against them are books of account, and we are required to keep them.'],
      ['Your property listing.', 'A listing is held separately from your owner account. Say so in the reason box if you would also like it taken off Lampose, and we will confirm it with you.'],
    ],
    beforeYouGo: 'Guests already staying with you are not affected. Anything owed to you is paid to the bank details on the account during the grace period.',
  },
  restaurant: {
    name: 'Lampose Partner',
    who: 'restaurants and kitchens that sell food on Lampose',
    short: 'Restaurants and kitchens',
    workNoun: ['order', 'orders'],
    deleted: [
      'The owner profile — name, email address and mobile number.',
      'Your kitchen’s listing, menu, dish photographs and opening hours.',
      'Identity and business documents you uploaded — FSSAI, GST, PAN and cheque — removed from your account.',
      'Bank and payout details held for settlements.',
      'Device registrations, so the app stops sending you order alerts.',
      'Your name and number on support conversations you raised from the app.',
    ],
    kept: [
      ['Order and payout records.', 'Orders your kitchen served and the payouts made against them are books of account, and we are required to keep them.'],
    ],
    beforeYouGo: 'Orders already placed with your kitchen still have to be prepared. Anything owed to you is paid to the bank details on the account during the grace period.',
  },
  driver: {
    name: 'Lampose Delivery Partner',
    who: 'delivery riders who carry Lampose orders',
    short: 'Deliver Lampose orders',
    workNoun: ['delivery', 'deliveries'],
    deleted: [
      'Your profile — name, date of birth, city, and profile photograph.',
      'Your contact details — mobile number and email address.',
      'Identity and vehicle documents you uploaded — licence, RC, Aadhaar, PAN and insurance — removed from your account.',
      'Your address and any saved location details.',
      'Bank and payout details held for settlements.',
      'Your live and historical location data.',
      'Device registrations, so the app stops sending you notifications.',
      'Your name and number on support conversations you raised from the rider app.',
    ],
    kept: [
      ['Delivery and payment records.', 'Records of completed deliveries and the payouts made against them are books of account, and we are required to keep them.'],
    ],
    beforeYouGo: 'If you are carrying a delivery, please complete it — the food still has to reach the customer. Anything owed to you is paid during the grace period.',
  },
};

const APP_KEYS = Object.keys(APPS);

/* The spellings a store listing or a support reply might use in `?app=`. */
const ALIASES = {
  user: 'customer', lampose: 'customer',
  'stay-partner': 'partner', owner: 'partner',
  'food-partner': 'restaurant', kitchen: 'restaurant',
  rider: 'driver', delivery: 'driver',
};
const appFrom = value => {
  const key = String(value || '').trim().toLowerCase();
  return APPS[key] ? key : ALIASES[key] || null;
};

/* What the page prints before the server has answered, and if it never does.
   The same numbers the controller holds — see `accountDeletion.controller.js`. */
const FALLBACK_POLICY = { graceDays: 30, otpLength: 6, supportEmail: 'contact@lampose.com' };

const TEN_DIGITS = /^[6-9]\d{9}$/;

/** "12 October 2026" — a date somebody can hold against a calendar. */
const longDate = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
};

export function DeleteAccount() {
  const [params, setParams] = useSearchParams();
  const [app, setApp] = useState(() => appFrom(params.get('app')));
  const meta = app ? APPS[app] : null;
  const appName = meta ? meta.name : 'Lampose';

  const [policy, setPolicy] = useState(FALLBACK_POLICY);

  /* 'form' → 'code' → 'done'. `confirming` is the interstitial before any
     code is sent, a step rather than `window.confirm` so it can be read,
     styled and dismissed like the rest of the page. */
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

  /* Choosing an app starts the form again and puts the choice in the address,
     so the link somebody copies is the link to THEIR app. */
  const chooseApp = (key) => {
    if (key === app) return;
    setApp(key);
    setStep('form');
    setCode('');
    setProblem(null);
    setNotice(null);
    setResult(null);
    const next = new URLSearchParams(params);
    next.set('app', key);
    setParams(next, { replace: true });
  };

  const askToConfirm = (event) => {
    event.preventDefault();
    setProblem(null);

    if (!app) {
      setProblem('Choose the app your account is on.');
      return;
    }
    if (!TEN_DIGITS.test(phone)) {
      setProblem(phone.length === 10
        ? 'An Indian mobile number starts with 6, 7, 8 or 9.'
        : `Enter the 10-digit mobile number registered on your ${appName} account.`);
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
      const started = await deleteAccountApi.start(app, `+91${phone}`);

      /* Already asked for, and still inside the window. Nothing further to do,
         and saying "we sent a code" would be untrue. */
      if (started?.alreadyRequested && started.request) {
        setResult({ ...started.request, alreadyRequested: true });
        setStep('done');
        return;
      }

      setStep('code');
      setNotice(started?.cooling
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
      const confirmed = await deleteAccountApi.confirm(app, {
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

  /* Work still in hand, as the server counted it — reported, never a refusal. */
  const inFlight = useMemo(() => {
    const n = (result?.activeOrders || 0) + (result?.activeBookings || 0);
    if (!n || !meta) return null;
    return `${n} ${n === 1 ? meta.workNoun[0] : meta.workNoun[1]}`;
  }, [result, meta]);

  return (
    <Region id="delete-account" className="da-page">
      <Box className="da-inner">

        {/* ── Heading ─────────────────────────────────────────────────── */}
        <Box className="da-head">
          <Inline className="da-tag">Account &amp; data</Inline>
          <Heading level={1} className="da-h1">
            Delete Your <Emphasis>{appName}</Emphasis> Account
          </Heading>
          <Text className="da-lede">
            {meta ? (
              <>
                This page is for <Strong>{meta.name}</Strong> users — {meta.who} — who want to
                request deletion of their account and the personal data held against it.
              </>
            ) : (
              <>
                Use this page to request deletion of an account on any Lampose app, and the
                personal data held against it.
              </>
            )}
            {' '}You do not need to sign in, and you do not need the app.
          </Text>
          <Text className="da-note">
            Each Lampose app has its own account. Requesting deletion here affects the account on
            the app you choose only — an account on another Lampose app, even on the same number,
            is not touched.
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
                We have recorded a deletion request for the <Strong>{appName}</Strong> account on{' '}
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

              {inFlight && (
                <Text className="da-warn" role="alert">
                  You currently have {inFlight} in progress. {meta.beforeYouGo}
                </Text>
              )}

              <Text className="da-done__after">
                Changed your mind? Open the {appName} app and cancel the request from the Delete
                account screen in your profile, or email{' '}
                <Anchor href={`mailto:${support}`}>{support}</Anchor> from the phone number or email
                address on the account before the date above.
              </Text>
            </Box>
          ) : step === 'code' ? (
            <Form className="da-form" onSubmit={submitCode} noValidate>
              <Text className="da-form__intro">
                We sent a {policy.otpLength}-digit code by SMS to <Strong>+91 {phone}</Strong>.
                Enter it to confirm the request. This is how we check the account is yours —
                without it, anybody could request deletion of somebody else&rsquo;s account.
              </Text>
              <Text className="da-hint">
                No code? We only text numbers that have a {appName} account. Check you chose the
                right app, or email <Anchor href={`mailto:${support}`}>{support}</Anchor>.
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
              <FieldSet className="da-field da-apps">
                <Legend className="da-label">
                  Which app is the account on? <Inline className="da-req">*</Inline>
                </Legend>
                <Box className="da-apps__grid">
                  {APP_KEYS.map(key => (
                    <Label key={key} className={`da-app${app === key ? ' is-on' : ''}`}>
                      <Input
                        className="da-app__radio"
                        type="radio"
                        name="app"
                        value={key}
                        checked={app === key}
                        onChange={() => chooseApp(key)}
                      />
                      <Inline className="da-app__name">{APPS[key].name}</Inline>
                      <Inline className="da-app__who">{APPS[key].short}</Inline>
                    </Label>
                  ))}
                </Box>
              </FieldSet>

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
                  The number you sign in to the {appName} app with. We will text a code to it.
                </Small>
              </Label>

              <Label className="da-field">
                <Inline className="da-label">
                  Email address <Inline className="da-opt">(optional)</Inline>
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
                  Not required. Give one if you would like written confirmation of the request.
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
          <Text className="da-p">There are three ways, and all of them end in the same place.</Text>
          <List className="da-steps">
            <ListItem>
              <Strong>From the app.</Strong> Open the {appName} app, go to <Strong>Profile</Strong>,
              and tap <Strong>Delete account</Strong>. You are already signed in, so no code is
              needed — and you can cancel the request from the same screen.
            </ListItem>
            <ListItem>
              <Strong>From this page.</Strong> Choose the app, enter the mobile number registered on
              your account, confirm, and enter the code we text you.
            </ListItem>
            <ListItem>
              <Strong>By email.</Strong> If neither works — for example you no longer have the SIM —
              write to <Anchor href={`mailto:${support}`}>{support}</Anchor> from the email address
              on your account, name the app, and we will verify you another way.
            </ListItem>
          </List>
        </Box>

        {/* ── 3. What is deleted ──────────────────────────────────────── */}
        <Box className="da-card">
          <Heading level={2} className="da-h2">What data will be deleted</Heading>
          <Text className="da-p">
            When an account deletion request is approved and processed, personal account
            information and other data associated with the account will be deleted where
            applicable.{meta ? ` For a ${meta.name} account that means:` : ' Choose an app above to see exactly what that covers. In every app it includes:'}
          </Text>
          <List className="da-list">
            {(meta ? meta.deleted : [
              'Your profile — name, email address and profile photograph.',
              'Your mobile number and addresses, once the request is carried out.',
              'Documents, bank and payout details you gave us, where the app collected them.',
              'Device registrations, so the app stops sending you notifications.',
              'Your name and number on support conversations you raised.',
            ]).map(line => <ListItem key={line}>{line}</ListItem>)}
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
            {(meta ? meta.kept : [
              ['Transaction records.', 'Bookings, orders, deliveries and the payments, refunds and payouts made against them are books of account, and we are required to keep them.'],
            ]).map(([title, body]) => (
              <ListItem key={title}><Strong>{title}</Strong> {body}</ListItem>
            ))}
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
            used to contact you or to identify you as an active user.
          </Text>
        </Box>

        {/* ── 5. Retention period ─────────────────────────────────────── */}
        <Box className="da-card">
          <Heading level={2} className="da-h2">Data retention period</Heading>
          <List className="da-list">
            <ListItem>
              <Strong>Grace period — {days} days.</Strong> A confirmed request is scheduled, not
              carried out immediately. This window lets us settle anything owed and lets you change
              your mind.
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
              scheduled. You will see a confirmation on this page or in the app.
            </ListItem>
            <ListItem>
              <Strong>Anything in progress.</Strong>{' '}
              {meta ? meta.beforeYouGo : 'A stay, an order or a delivery already under way carries on as normal. Your request stands either way.'}
            </ListItem>
            <ListItem>
              <Strong>Changing your mind.</Strong> Until the date you are given, you can cancel the
              request from the Delete account screen in the app, or by emailing support.
            </ListItem>
            <ListItem>
              <Strong>After {days} days.</Strong> The account is deleted in line with the policy on
              this page, and you will no longer be able to sign in to the {appName} app with it.
            </ListItem>
            <ListItem>
              <Strong>Starting again.</Strong> You are welcome to register again later, but it will
              be a new account{app === 'driver' || app === 'restaurant' ? ' — your documents will need to be verified afresh' : ''}.
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
            tell us which app it is about{meta ? <> — <Strong>{meta.name}</Strong></> : ''} — so we can find it quickly.
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
            <Text className="da-modal__body">
              Are you sure you want to request deletion of your {appName} account? This action
              cannot be easily undone.
            </Text>
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
