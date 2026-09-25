import React from 'react';
import {
  BadgeCheck, CheckCircle2, CreditCard, Fingerprint, Info,
  Landmark, Receipt,
} from 'lucide-react';
import {
  Box, Inline, Input, Label, PlainButton, Select, Text,
} from '../../../common/atoms';
import { Field, FieldError, Note, SectionHead } from '../../molecules/Field/Field';
import { FileDrop } from '../../molecules/FileDrop/FileDrop';
import { COPY, INDIAN_STATES } from '../../utils/restaurantOptions';

/*
 * Step 3 — the papers, and where the money goes.
 *
 * Every scan picked here is uploaded at SUBMIT, not now: one upload pass, at
 * the end, either works or is retried as a whole.
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

/*
 * The owner's Aadhaar, and the mobile it is registered against.
 *
 * Both are recorded as typed — the mobile is NOT verified with a one-time
 * code. The backend leaves `aadhaar.verifiedAt` null when no proof comes with
 * the application, which is how the verification queue tells an unproven
 * number apart from a proven one.
 */
function AadhaarDetails({ form, set, errors, touch }) {
  return (
    <Box className="rst-section">
      <SectionHead icon={<Fingerprint size={16} color="#45855a" />} title="Aadhaar Details" />

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
          hint="The number this Aadhaar is registered against."
          required
          htmlFor="rst-aadhaar-phone"
          error={errors.aadhaarPhone}
        >
          <Input
            id="rst-aadhaar-phone"
            className={`rst-input${errors.aadhaarPhone ? ' is-bad' : ''}`}
            type="text"
            inputMode="numeric"
            maxLength={10}
            value={form.aadhaarPhone}
            onChange={(event) => set({
              aadhaarPhone: event.target.value.replace(/\D/g, '').slice(0, 10),
            })}
            onBlur={() => touch('aadhaarPhone')}
            placeholder="10-digit mobile number"
          />
        </Field>
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
          details can follow later.
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
      <AadhaarDetails form={form} set={set} errors={errors} touch={touch} />

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
