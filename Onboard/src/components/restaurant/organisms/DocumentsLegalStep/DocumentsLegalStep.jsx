import React from 'react';
import {
  AlertCircle, BadgeCheck, CheckCircle2, CreditCard, Info, Landmark, Receipt,
} from 'lucide-react';
import {
  Box, Inline, Input, Label, PlainButton, Text,
} from '../../../common/atoms';
import { Field, Note, SectionHead } from '../../molecules/Field/Field';
import { FileDrop } from '../../molecules/FileDrop/FileDrop';
import { COPY } from '../../utils/restaurantOptions';

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
 */

export function DocumentsLegalStep({ form, set }) {
  const copy = COPY;

  const accountsDiffer = form.bankConfirm && form.bankAccount !== form.bankConfirm;
  const accountsMatch = form.bankConfirm && form.bankAccount === form.bankConfirm;

  return (
    <Box className="animate-fade-in">
      <Box className="rst-step-head">
        <Text className="rst-step-title">Documents &amp; Legal Verification</Text>
        <Text className="rst-step-sub">
          Two scans are needed — the PAN card and the FSSAI certificate. The GST
          and bank details are recorded by number.
        </Text>
      </Box>

      {/* ── 3.1 Tax & identity ──────────────────────────────────────────── */}
      <Box className="rst-section">
        <SectionHead icon={<BadgeCheck size={16} color="#45855a" />} title="Tax & Identity Verification" />

        <Box className="rst-card">
          <Field label="PAN Card Details" required htmlFor="rst-pan">
            <Input
              id="rst-pan"
              className="rst-input"
              type="text"
              maxLength={10}
              value={form.panNumber}
              onChange={(event) => set({ panNumber: event.target.value.toUpperCase().slice(0, 10) })}
              placeholder="e.g. ABCDE1234F"
              style={{ textTransform: 'uppercase' }}
            />
          </Field>

          <FileDrop
            id="rst-pan-file"
            label="Upload PAN Card Copy *"
            desc="Mandatory. A clear scan or photo of the PAN card."
            file={form.panFile}
            onChange={(file) => set({ panFile: file })}
          />

          <Box className="rst-divide">
            <Field label="GSTIN Details" required={!form.gstExempt}>
              <Label className="rst-check" style={{ marginBottom: '12px' }}>
                <Input
                  type="checkbox"
                  checked={form.gstExempt}
                  onChange={() => set({ gstExempt: !form.gstExempt })}
                />
                <Inline>{copy.gstExemptLabel}</Inline>
              </Label>

              {!form.gstExempt ? (
                <Input
                  id="rst-gstin"
                  className="rst-input"
                  type="text"
                  maxLength={15}
                  value={form.gstin}
                  onChange={(event) => set({ gstin: event.target.value.toUpperCase().slice(0, 15) })}
                  placeholder="e.g. 22AAAAA0000A1Z5"
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
            <Field label="FSSAI License Number" required htmlFor="rst-fssai">
              <Input
                id="rst-fssai"
                className="rst-input"
                type="text"
                inputMode="numeric"
                maxLength={14}
                value={form.fssaiNumber}
                onChange={(event) => set({
                  fssaiNumber: event.target.value.replace(/\D/g, '').slice(0, 14),
                })}
                placeholder="14-digit license number"
              />
            </Field>

            <Field label="FSSAI Expiry Date" required htmlFor="rst-fssai-expiry">
              <Input
                id="rst-fssai-expiry"
                className="rst-input"
                type="date"
                value={form.fssaiExpiry}
                onChange={(event) => set({ fssaiExpiry: event.target.value })}
              />
            </Field>
          </Box>

          <FileDrop
            id="rst-fssai-file"
            label="Upload FSSAI License Copy *"
            desc={`Mandatory. ${copy.safetyUploadDescription}.`}
            file={form.fssaiFile}
            onChange={(file) => set({ fssaiFile: file })}
          />
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
          >
            <Input
              id="rst-holder"
              className="rst-input"
              type="text"
              value={form.accountHolderName}
              onChange={(event) => set({ accountHolderName: event.target.value })}
              placeholder="e.g. Ramesh Kumar"
            />
          </Field>

          <Box className="rst-grid-2" style={{ marginBottom: '14px' }}>
            <Field label="Bank Account Number" required htmlFor="rst-acct">
              <Input
                id="rst-acct"
                className="rst-input"
                type="text"
                inputMode="numeric"
                value={form.bankAccount}
                onChange={(event) => set({
                  bankAccount: event.target.value.replace(/\D/g, '').slice(0, 18),
                })}
                placeholder="Enter account number"
              />
            </Field>

            <Field label="Re-enter Account Number" required htmlFor="rst-acct2">
              <Input
                id="rst-acct2"
                className={`rst-input${accountsDiffer ? ' is-bad' : ''}${accountsMatch ? ' is-good' : ''}`}
                type="text"
                inputMode="numeric"
                value={form.bankConfirm}
                onChange={(event) => set({
                  bankConfirm: event.target.value.replace(/\D/g, '').slice(0, 18),
                })}
                placeholder="Re-enter account number"
              />
            </Field>
          </Box>

          {accountsDiffer && (
            <Box style={{ marginBottom: '14px' }}>
              <Note tone="bad" icon={<AlertCircle size={14} />}>Account numbers do not match.</Note>
            </Box>
          )}

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

          <Field label="IFSC Code" required htmlFor="rst-ifsc">
            <Input
              id="rst-ifsc"
              className="rst-input"
              type="text"
              maxLength={11}
              value={form.ifsc}
              onChange={(event) => set({
                ifsc: event.target.value.toUpperCase().slice(0, 11),
                /* Any edit un-confirms it. A code that was checked and then
                   changed by one character is an unchecked code. */
                ifscFetched: false,
              })}
              placeholder="e.g. HDFC0001234"
              style={{ textTransform: 'uppercase' }}
            />
            <PlainButton
              type="button"
              onClick={() => set({ ifscFetched: true })}
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
