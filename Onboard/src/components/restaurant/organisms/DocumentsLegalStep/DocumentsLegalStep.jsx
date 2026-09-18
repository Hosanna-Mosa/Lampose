import React from 'react';
import {
  BadgeCheck, CheckCircle2, CreditCard, Info, Landmark, Receipt, RotateCcw,
} from 'lucide-react';
import {
  Box, Inline, Input, Label, PlainButton, Text,
} from '../../../common/atoms';
import { Field, FieldError, Note, SectionHead } from '../../molecules/Field/Field';
import { FileDrop } from '../../molecules/FileDrop/FileDrop';
import { COPY, REFUND_POLICY_POINTS } from '../../utils/restaurantOptions';

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
 *
 * ## Why the refund policy is ticked HERE and not on step 4
 *
 * Step 4 is the merchant agreement: eight clauses, accepted in one box and
 * signed by name. The refund rule is the one clause in it that takes money off
 * a settlement, and it is the one an owner argues about three months later —
 * so it is printed in full on this step, beside the bank details it will be
 * deducted from, and ticked on its own. Two ticks rather than one because a
 * single box covering both makes it impossible to say afterwards which of them
 * was actually read out.
 */

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
          Two scans are needed — the PAN card and the FSSAI certificate. The
          bank details are recorded by number, and the GSTIN only if there is
          one.
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
            label="Upload PAN Card Copy *"
            desc="Mandatory. A clear scan or photo of the PAN card."
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

      {/* ── 3.2 Safety licence ──────────────────────────────────────────── */}
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
            label="Upload FSSAI License Copy *"
            desc={`Mandatory. ${copy.safetyUploadDescription}.`}
            file={form.fssaiFile}
            onChange={(file) => { set({ fssaiFile: file }); touch('fssaiFile'); }}
          />
          <FieldError message={errors.fssaiFile} />
        </Box>
      </Box>

      {/* ── 3.3 Banking & payout ────────────────────────────────────────── */}
      <Box className="rst-section">
        <SectionHead icon={<Landmark size={16} color="#45855a" />} title="Banking & Payout Details" />

        <Box className="rst-card">
          <Field
            label="Account Holder Name"
            hint="Exactly as the bank holds it. Pre-filled from the owner's name — change it if the account is in the business's name."
            required
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
            <Field label="Bank Account Number" required htmlFor="rst-acct" error={errors.bankAccount}>
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
            <Field label="Re-enter Account Number" required htmlFor="rst-acct2" error={errors.bankConfirm}>
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

          <Field label="Account Type" required>
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

          <Field label="IFSC Code" required htmlFor="rst-ifsc" error={errors.ifsc}>
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

      {/* ── 3.4 Refund & cancellation ───────────────────────────────────── */}
      <Box className="rst-section">
        <SectionHead icon={<RotateCcw size={16} color="#45855a" />} title={copy.refundTitle} />

        <Box className={`rst-card${errors.refundPolicyAccepted ? ' is-bad' : ''}`} id="rst-refund" tabIndex={-1}>
          <Text className="rst-hint" style={{ marginBottom: '10px' }}>{copy.refundIntro}</Text>

          {REFUND_POLICY_POINTS.map((point) => (
            <Box key={point.label} className="rst-term-row">
              <Box className="rst-dot" />
              <Box>
                <Text style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--text-main)' }}>
                  {point.label}
                </Text>
                <Text style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '2px', lineHeight: 1.45 }}>
                  {point.value}
                </Text>
              </Box>
            </Box>
          ))}

          <Box className="rst-divide">
            <Label className="rst-check">
              <Input
                type="checkbox"
                checked={form.refundPolicyAccepted}
                onChange={() => {
                  set({ refundPolicyAccepted: !form.refundPolicyAccepted });
                  touch('refundPolicyAccepted');
                }}
              />
              <Box>
                <Text style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--text-main)' }}>
                  {copy.refundAcceptLabel}
                  <Inline className="rst-req"> *</Inline>
                </Text>
                <Text style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '3px', lineHeight: 1.45 }}>
                  {copy.refundAcceptHelp}
                </Text>
                <FieldError message={errors.refundPolicyAccepted} />
              </Box>
            </Label>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
