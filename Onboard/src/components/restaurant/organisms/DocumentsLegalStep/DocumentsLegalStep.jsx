import React, { useEffect, useState } from 'react';
import {
  AlertCircle, BadgeCheck, CheckCircle2, CreditCard, Fingerprint, Info,
  Landmark, Loader2, Receipt, Send, ShieldCheck,
} from 'lucide-react';
import {
  Box, Inline, Input, Label, PlainButton, Select, Text,
} from '../../../common/atoms';
import { Field, FieldError, Note, SectionHead } from '../../molecules/Field/Field';
import { FileDrop } from '../../molecules/FileDrop/FileDrop';
import { COPY, INDIAN_STATES } from '../../utils/restaurantOptions';
import { startAadhaarOtp, verifyAadhaarOtp } from '../../../../services/api';

/*
 * Step 3 — the papers, and where the money goes.
 *
 * Every scan picked here is uploaded at SUBMIT, not now, and the reason is
 * the phone-verification token: it is short-lived, and uploading a licence
 * the moment it is picked would spread four separate windows of expiry
 * across however long the agent spends on step 4. One upload pass, at the
 * end, either works or is retried as a whole.
 *
 * ## The account holder's name
 *
 * The one field here that the Adios form did not have. It is not decoration:
 * the backend refuses a payout that has an account number and no holder name
 * ("the account holder's name"), so without it every application would 400
 * on submit. It is pre-filled from the owner's name — which is who it usually
 * is — and stays editable, because an account in the business's name is
 * ordinary and guessing it wrong would put the wrong name on a settlement.
 *
 * ## The GSTIN is OPTIONAL
 *
 * The composition scheme and small turnovers are ordinary, and plenty of the
 * kitchens this form is filled in at have not registered at all. An agent
 * standing at a counter cannot conjure a number the owner does not have, and a
 * required field there gets a made-up value rather than a blank one — which is
 * the one outcome the verification queue cannot tell from a real GSTIN. So the
 * box may be left empty, the exempt tick stays for the owner who wants to say
 * WHY there is none, and what is enforced is that anything actually typed is a
 * real GSTIN. `validateRestaurant.js` holds that rule; the backend's
 * `validateApplication` was relaxed to match, because the two disagreeing is a
 * 400 at the end of a twenty-minute form.
 */

/** What the send button says: mid-flight, cooling down, or ready. */
const sendLabel = ({ sending, cooldown, sent }) => {
  if (sending) return 'Sending the code...';
  if (cooldown > 0) return `Resend in ${cooldown}s`;
  return sent ? 'Send the code again' : 'Send code';
};

/*
 * The Aadhaar, and the one field on this form that is PROVEN rather than read.
 *
 * Every other box on step 3 is copied off a document the agent is holding, and
 * the verification queue can check it later against the scan. A mobile number
 * cannot be checked that way at all: a number that reaches nobody looks
 * exactly like a number that reaches the owner, and the first time anybody
 * finds out is when the account needs recovering. So a one-time code goes to
 * it and has to come back before step 3 will open.
 *
 * ## The proof is a token, not a tick
 *
 * `aadhaarVerified` drives this screen; `aadhaarToken` is what the backend
 * actually re-checks, and it derives `aadhaar.verifiedAt` from that rather
 * than believing anything sent in the body. The same rule a rider's
 * `hasCompletedOnboarding` follows, for the same reason: a client that could
 * assert this could file an application against a stranger's Aadhaar.
 *
 * ## Editing the number un-verifies it
 *
 * Done here rather than left to the validator, because the agent has to SEE it
 * happen — a green tick that survives the number underneath it changing is
 * worse than no tick at all. `aadhaarVerifiedPhone` records which number was
 * proven and the validator compares the two as well, so a stale proof cannot
 * survive a route this component did not think of.
 *
 * ## Why the endpoints are the Food-Partner app's own
 *
 * `/auth/otp/start` and `/verify` already solve "prove a number before any
 * account exists", with expiry, lock-out and resend rules that cost real money
 * to get wrong. A second implementation would be a second set of them to keep
 * in step.
 */
function AadhaarVerification({ form, set, errors, touch }) {
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState(null);
  const [cooldown, setCooldown] = useState(0);
  const [otpLength, setOtpLength] = useState(6);

  const phoneDigits = String(form.aadhaarPhone || '').replace(/\D/g, '');
  const phoneReady = /^[6-9]\d{9}$/.test(phoneDigits);

  /* The same three-part test the validator makes. Read off the form rather
     than kept in local state, so that coming back to step 3 from step 4 shows
     what is actually true rather than a component that has just remounted. */
  const verified = Boolean(
    form.aadhaarVerified
    && form.aadhaarToken
    && String(form.aadhaarVerifiedPhone || '').replace(/\D/g, '') === phoneDigits,
  );

  /* The wait the SERVER asked for, counted down here. A resend button that is
     live while the backend is still refusing sends the agent into a 429 they
     can do nothing about; one that reads "14s" is an instruction. */
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const id = setTimeout(() => setCooldown((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  /* Any edit to the number drops the proof with it. See the header. */
  const setPhone = (value) => {
    const next = value.replace(/\D/g, '').slice(0, 10);
    if (next === phoneDigits) return;

    setNote(null);
    set({
      aadhaarPhone: next,
      aadhaarOtp: '',
      aadhaarOtpSent: false,
      aadhaarVerified: false,
      aadhaarVerifiedPhone: '',
      aadhaarToken: '',
    });
  };

  const send = async () => {
    setNote(null);
    setSending(true);
    const res = await startAadhaarOtp(phoneDigits);
    setSending(false);
    touch('aadhaarOtp');

    if (res && res.success) {
      const data = res.data || {};
      const minutes = Math.max(1, Math.round((Number(data.expiresInSeconds) || 300) / 60));
      setOtpLength(Number(data.otpLength) || 6);
      setCooldown(Number(data.resendInSeconds) || 30);
      set({ aadhaarOtpSent: true, aadhaarOtp: '' });
      setNote({
        tone: 'ok',
        text: `Code sent to ${data.phoneMasked || phoneDigits}. It expires in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
      });
      return;
    }

    /* A cooldown or a resend cap answers with the wait, so the button can show
       it rather than the agent pressing again into the same refusal. */
    if (res && res.retryAfter) setCooldown(Number(res.retryAfter));
    setNote({
      tone: 'bad',
      text: (res && (res.message || res.error))
        || 'The code could not be sent. Check the number and try again.',
    });
  };

  const check = async () => {
    setNote(null);
    setChecking(true);
    const res = await verifyAadhaarOtp({ phone: phoneDigits, otp: form.aadhaarOtp });
    setChecking(false);
    touch('aadhaarOtp');

    if (res && res.success && res.data && res.data.verificationToken) {
      set({
        aadhaarVerified: true,
        aadhaarVerifiedPhone: phoneDigits,
        aadhaarToken: res.data.verificationToken,
      });
      setNote(null);
      return;
    }

    /* A wrong code is no reason to make them ask for a new one — the server
       counts the attempts left and says so, and that sentence is the useful
       one. An expired or locked code is different: there is nothing left to
       type into, so the flow goes back to asking for a send. */
    const code = res && res.code;
    if (code === 'OTP_EXPIRED' || code === 'OTP_LOCKED') {
      set({ aadhaarOtp: '', aadhaarOtpSent: false });
    }

    setNote({
      tone: 'bad',
      text: (res && (res.message || res.error)) || 'That code could not be checked. Try again.',
    });
  };

  return (
    <Box className="rst-section">
      <SectionHead icon={<Fingerprint size={16} color="#45855a" />} title="Aadhaar Verification" />

      <Box className="rst-card">
        <Field
          label="Aadhaar Number"
          hint="The owner's Aadhaar, as printed on the card."
          required
          htmlFor="rst-aadhaar"
          error={errors.aadhaarNumber}
        >
          <Input
            id="rst-aadhaar"
            className={`rst-input${errors.aadhaarNumber ? ' is-bad' : ''}`}
            type="text"
            inputMode="numeric"
            maxLength={12}
            value={form.aadhaarNumber}
            onChange={(event) => set({
              aadhaarNumber: event.target.value.replace(/\D/g, '').slice(0, 12),
            })}
            onBlur={() => touch('aadhaarNumber')}
            placeholder="12-digit Aadhaar number"
          />
        </Field>

        <Field
          label="Aadhaar Registered Mobile Number"
          hint="The number this Aadhaar is registered against. A one-time code is sent to it, so the owner needs that handset in the room."
          required
          htmlFor="rst-aadhaar-phone"
          error={errors.aadhaarPhone}
        >
          <Input
            id="rst-aadhaar-phone"
            className={`rst-input${errors.aadhaarPhone ? ' is-bad' : ''}${verified ? ' is-good' : ''}`}
            type="text"
            inputMode="numeric"
            maxLength={10}
            value={form.aadhaarPhone}
            onChange={(event) => setPhone(event.target.value)}
            onBlur={() => touch('aadhaarPhone')}
            placeholder="10-digit mobile number"
            disabled={sending || checking}
          />

          {!verified && (
            <PlainButton
              type="button"
              onClick={send}
              disabled={!phoneReady || sending || checking || cooldown > 0}
              className="rst-btn rst-btn-ghost rst-btn-sm"
              style={{ width: '100%', marginTop: '10px' }}
            >
              {sending ? <Loader2 size={15} /> : <Send size={15} />}
              {sendLabel({ sending, cooldown, sent: form.aadhaarOtpSent })}
            </PlainButton>
          )}
        </Field>

        {/* The code box appears only once there is something to type into it.
            A permanently visible empty OTP field on a form this long reads as
            one more required box the agent has skipped. */}
        {!verified && form.aadhaarOtpSent && (
          <Field
            label="One-Time Code"
            hint="Ask the owner to read out the code that has just arrived."
            required
            htmlFor="rst-aadhaar-otp"
            error={errors.aadhaarOtp}
          >
            <Input
              id="rst-aadhaar-otp"
              className={`rst-input${errors.aadhaarOtp ? ' is-bad' : ''}`}
              type="text"
              inputMode="numeric"
              maxLength={otpLength}
              value={form.aadhaarOtp}
              onChange={(event) => set({
                aadhaarOtp: event.target.value.replace(/\D/g, '').slice(0, otpLength),
              })}
              placeholder={`${otpLength}-digit code`}
              autoComplete="one-time-code"
            />
            <PlainButton
              type="button"
              onClick={check}
              disabled={String(form.aadhaarOtp || '').length !== otpLength || checking}
              className="rst-btn rst-btn-primary rst-btn-sm"
              style={{ width: '100%', marginTop: '10px' }}
            >
              {checking ? <Loader2 size={15} /> : <ShieldCheck size={15} />}
              {checking ? 'Checking...' : 'Verify mobile number'}
            </PlainButton>
          </Field>
        )}

        {/* The anchor the validator scrolls to when this gate is what is in the
            way. It has to exist even when the code box does not: before the
            first send there is nothing else on screen to point at. */}
        {!form.aadhaarOtpSent && (
          <Box id="rst-aadhaar-otp" tabIndex={-1}>
            <FieldError message={errors.aadhaarOtp} />
          </Box>
        )}

        {verified && (
          <Note tone="ok" icon={<CheckCircle2 size={15} />}>
            Mobile verified — the code reached {form.aadhaarPhone}. Changing the
            number above asks for a new one.
          </Note>
        )}

        {note && !verified && (
          <Box style={{ marginTop: '10px' }}>
            <Note
              tone={note.tone}
              icon={note.tone === 'ok' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
            >
              {note.text}
            </Note>
          </Box>
        )}
      </Box>
    </Box>
  );
}

export function DocumentsLegalStep({ form, set, errors = {}, touch = () => {} }) {
  const copy = COPY;

  const accountsMatch = form.bankConfirm
    && !errors.bankConfirm
    && form.bankAccount === form.bankConfirm;

  return (
    <Box className="animate-fade-in">
      <Box className="rst-step-head">
        <Text className="rst-step-title">Documents &amp; Legal Verification</Text>
        <Text className="rst-step-sub">
          The PAN, Aadhaar and FSSAI numbers are needed. The scans and the bank
          details can follow later — what cannot is the code sent to the
          Aadhaar-registered mobile.
        </Text>
      </Box>

      {/* ── 3.1 Tax & identity ──────────────────────────────────────────── */}
      <Box className="rst-section">
        <SectionHead icon={<BadgeCheck size={16} color="#45855a" />} title="Tax & Identity Verification" />

        <Box className="rst-card">
          <Field label="PAN Card Details" required htmlFor="rst-pan" error={errors.panNumber}>
            <Input
              id="rst-pan"
              className={`rst-input${errors.panNumber ? ' is-bad' : ''}`}
              type="text"
              maxLength={10}
              value={form.panNumber}
              onChange={(event) => set({ panNumber: event.target.value.toUpperCase().slice(0, 10) })}
              onBlur={() => touch('panNumber')}
              placeholder="e.g. ABCDE1234F"
              style={{ textTransform: 'uppercase' }}
            />
          </Field>

          <FileDrop
            id="rst-pan-file"
            label="Upload PAN Card Copy (Optional)"
            desc="A clear scan or photo of the PAN card. The verification team can ask for this later."
            file={form.panFile}
            onChange={(file) => { set({ panFile: file }); touch('panFile'); }}
          />
          <FieldError message={errors.panFile} />

          <Box className="rst-divide">
            <Field
              label="GSTIN Details"
              hint="Leave this blank if the restaurant has no GST registration."
              optional
              error={errors.gstin}
            >
              {/* Ticking it CLEARS the box rather than hiding a value that is
                  still on the form: a GSTIN and the exempt flag together are
                  what the backend refuses, and a number kept out of sight
                  would be submitted by an agent who believes they removed
                  it. Unticking leaves whatever is there, so a mis-tap does
                  not cost the number that was typed before it. */}
              <Label className="rst-check" style={{ marginBottom: '12px' }}>
                <Input
                  type="checkbox"
                  checked={form.gstExempt}
                  onChange={() => set({
                    gstExempt: !form.gstExempt,
                    gstin: form.gstExempt ? form.gstin : '',
                  })}
                />
                <Inline>{copy.gstExemptLabel}</Inline>
              </Label>

              {!form.gstExempt ? (
                <Input
                  id="rst-gstin"
                  className={`rst-input${errors.gstin ? ' is-bad' : ''}`}
                  type="text"
                  maxLength={15}
                  value={form.gstin}
                  onChange={(event) => set({ gstin: event.target.value.toUpperCase().slice(0, 15) })}
                  onBlur={() => touch('gstin')}
                  placeholder="e.g. 22AAAAA0000A1Z5 — or leave blank"
                  style={{ textTransform: 'uppercase' }}
                />
              ) : (
                <Note tone="info" icon={<Info size={15} />}>
                  Noted — this restaurant is marked GST exempt / composition scheme.
                </Note>
              )}
            </Field>
          </Box>
        </Box>
      </Box>

      {/* ── 3.2 Aadhaar ─────────────────────────────────────────────────── */}
      <AadhaarVerification form={form} set={set} errors={errors} touch={touch} />

      {/* ── 3.3 Safety licence ──────────────────────────────────────────── */}
      <Box className="rst-section">
        <SectionHead icon={<Receipt size={16} color="#45855a" />} title={copy.safetyTitle} />

        <Box className="rst-card">
          <Box className="rst-grid-2" style={{ marginBottom: '14px' }}>
            <Field label="FSSAI License Number" required htmlFor="rst-fssai" error={errors.fssaiNumber}>
              <Input
                id="rst-fssai"
                className={`rst-input${errors.fssaiNumber ? ' is-bad' : ''}`}
                type="text"
                inputMode="numeric"
                maxLength={14}
                value={form.fssaiNumber}
                onChange={(event) => set({
                  fssaiNumber: event.target.value.replace(/\D/g, '').slice(0, 14),
                })}
                onBlur={() => touch('fssaiNumber')}
                placeholder="14-digit license number"
              />
            </Field>

            <Field label="FSSAI Expiry Date" required htmlFor="rst-fssai-expiry" error={errors.fssaiExpiry}>
              <Input
                id="rst-fssai-expiry"
                className={`rst-input${errors.fssaiExpiry ? ' is-bad' : ''}`}
                type="date"
                value={form.fssaiExpiry}
                onChange={(event) => set({ fssaiExpiry: event.target.value })}
                onBlur={() => touch('fssaiExpiry')}
              />
            </Field>
          </Box>

          <FileDrop
            id="rst-fssai-file"
            label="Upload FSSAI License Copy (Optional)"
            desc={`${copy.safetyUploadDescription}. The verification team can ask for this later.`}
            file={form.fssaiFile}
            onChange={(file) => { set({ fssaiFile: file }); touch('fssaiFile'); }}
          />
          <FieldError message={errors.fssaiFile} />

          {/* ── What the PORTAL asks for ───────────────────────────────

              FoSCoS verifies a licence by four things at once: the company
              name, the licence number, the state and the district. The number
              is above; these three complete the set, so a verifier can run the
              check without ringing the restaurant back for the rest.

              The company name is asked for SEPARATELY from the restaurant name
              on step 1, and is not pre-filled from it. A licence is held in the
              registered entity's name — "Bhargavi Foods Pvt Ltd" against a
              board reading "Bhargavi Home Foods" — and the portal matches on
              the former. Pre-filling would put the trading name in the box and
              make it look checked; typing it is what gets it read off the
              certificate. */}
          <Box className="rst-divide">
            <Note tone="info" icon={<Info size={15} />}>
              Read these off the certificate, not off the address.
            </Note>

            <Box style={{ height: '14px' }} />

            <Field
              label="Company Name on the Licence"
              required
              htmlFor="rst-fssai-company"
              error={errors.fssaiCompanyName}
            >
              <Input
                id="rst-fssai-company"
                className={`rst-input${errors.fssaiCompanyName ? ' is-bad' : ''}`}
                type="text"
                value={form.fssaiCompanyName}
                onChange={(event) => set({ fssaiCompanyName: event.target.value })}
                onBlur={() => touch('fssaiCompanyName')}
                placeholder="Company name"
              />
            </Field>

            <Box className="rst-grid-2">
              <Field label="State on the Licence" required htmlFor="rst-state" error={errors.state}>
                <Select
                  id="rst-state"
                  className={`rst-input${errors.state ? ' is-bad' : ''}`}
                  value={form.state}
                  onChange={(event) => set({ state: event.target.value })}
                  onBlur={() => touch('state')}
                >
                  <option value="">Select state</option>
                  {INDIAN_STATES.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </Select>
              </Field>

              <Field label="District on the Licence" required htmlFor="rst-district" error={errors.district}>
                <Input
                  id="rst-district"
                  className={`rst-input${errors.district ? ' is-bad' : ''}`}
                  type="text"
                  value={form.district}
                  onChange={(event) => set({ district: event.target.value })}
                  onBlur={() => touch('district')}
                  placeholder="District"
                />
              </Field>
            </Box>
          </Box>
        </Box>
      </Box>

      {/* ── 3.4 Banking & payout ────────────────────────────────────────── */}
      <Box className="rst-section">
        <SectionHead icon={<Landmark size={16} color="#45855a" />} title="Banking & Payout Details" />

        <Box className="rst-card">
          {/* Said once, at the top, rather than "(Optional)" five times: the
              rule is about the BLOCK, not about any field in it. An account
              number with no IFSC is money that cannot be sent, so the four
              boxes stand or fall together — which is exactly what the backend
              does with them. */}
          <Note tone="info" icon={<Info size={15} />}>
            All optional. Leave the whole section blank if the owner does not
            have the details to hand — settlement is weekly, so it can be added
            before the first one. Fill in any box and the rest become required,
            because a half-entered account cannot be paid into.
          </Note>

          <Box style={{ height: '14px' }} />

          <Field
            label="Account Holder Name"
            hint="Exactly as the bank holds it. Pre-filled from the owner's name — change it if the account is in the business's name."
            htmlFor="rst-holder"
            error={errors.accountHolderName}
          >
            <Input
              id="rst-holder"
              className={`rst-input${errors.accountHolderName ? ' is-bad' : ''}`}
              type="text"
              value={form.accountHolderName}
              onChange={(event) => set({ accountHolderName: event.target.value })}
              onBlur={() => touch('accountHolderName')}
              placeholder="e.g. Ramesh Kumar"
            />
          </Field>

          <Box className="rst-grid-2" style={{ marginBottom: '14px' }}>
            <Field label="Bank Account Number" htmlFor="rst-acct" error={errors.bankAccount}>
              <Input
                id="rst-acct"
                className={`rst-input${errors.bankAccount ? ' is-bad' : ''}`}
                type="text"
                inputMode="numeric"
                value={form.bankAccount}
                onChange={(event) => set({
                  bankAccount: event.target.value.replace(/\D/g, '').slice(0, 18),
                })}
                onBlur={() => touch('bankAccount')}
                placeholder="Enter account number"
              />
            </Field>

            {/* The one box on the form that speaks up mid-typing, and only at
                the character where it diverges. This field's whole purpose is
                the comparison, so waiting for the agent to tab away means
                telling them after they have stopped looking at it — but a
                plain "does not match" from the first keystroke would be red
                for every character of a number being typed correctly. While
                what is typed is still a prefix of the account number above,
                nothing is said. */}
            <Field label="Re-enter Account Number" htmlFor="rst-acct2" error={errors.bankConfirm}>
              <Input
                id="rst-acct2"
                className={`rst-input${errors.bankConfirm ? ' is-bad' : ''}${accountsMatch ? ' is-good' : ''}`}
                type="text"
                inputMode="numeric"
                value={form.bankConfirm}
                onChange={(event) => {
                  const next = event.target.value.replace(/\D/g, '').slice(0, 18);
                  set({ bankConfirm: next });
                  if (next && !form.bankAccount.startsWith(next)) touch('bankConfirm');
                }}
                onBlur={() => touch('bankConfirm')}
                placeholder="Re-enter account number"
              />
            </Field>
          </Box>

          <Field label="Account Type">
            <Box className="rst-split">
              <PlainButton
                type="button"
                onClick={() => set({ accountType: 'savings' })}
                className={`rst-pick${form.accountType === 'savings' ? ' is-on' : ''}`}
              >
                <CreditCard size={17} />
                <Inline>Savings</Inline>
              </PlainButton>
              <PlainButton
                type="button"
                onClick={() => set({ accountType: 'current' })}
                className={`rst-pick${form.accountType === 'current' ? ' is-on' : ''}`}
              >
                <Landmark size={17} />
                <Inline>Current</Inline>
              </PlainButton>
            </Box>
          </Field>

          <Field label="IFSC Code" htmlFor="rst-ifsc" error={errors.ifsc}>
            <Input
              id="rst-ifsc"
              className={`rst-input${errors.ifsc ? ' is-bad' : ''}`}
              type="text"
              maxLength={11}
              value={form.ifsc}
              onChange={(event) => set({
                ifsc: event.target.value.toUpperCase().slice(0, 11),
                /* Any edit un-confirms it. A code that was checked and then
                   changed by one character is an unchecked code. */
                ifscFetched: false,
              })}
              onBlur={() => touch('ifsc')}
              placeholder="e.g. HDFC0001234"
              style={{ textTransform: 'uppercase' }}
            />
            <PlainButton
              type="button"
              onClick={() => { set({ ifscFetched: true }); touch('ifsc'); }}
              disabled={form.ifsc.length !== 11}
              className="rst-btn rst-btn-ghost rst-btn-sm"
              style={{ width: '100%', marginTop: '10px' }}
            >
              <CheckCircle2 size={15} />
              Confirm IFSC
            </PlainButton>

            {form.ifscFetched && (
              <Box style={{ marginTop: '10px' }}>
                <Note tone="ok" icon={<CheckCircle2 size={14} />}>
                  IFSC confirmed — {form.ifsc}
                </Note>
              </Box>
            )}
          </Field>

        </Box>
      </Box>

    </Box>
  );
}
