/* ══════════════════════════════════════════════════════════════════════════
   Step 4 — Documents & Payout.

   Every input keeps the website's exact sanitising: digits only where it
   stripped non-digits, uppercase where it uppercased, and the same lengths.

   Editing the IFSC clears its verified flag. A verified badge left standing
   over an edited code is a lie about a bank account, and this is the one form
   in the app where that matters in money.
   ══════════════════════════════════════════════════════════════════════════ */
import { router } from "expo-router";
import React from "react";

import { Block, Box, CheckRow, DateField, Field, FilePick, Note, StepFrame, TextField } from "@/components/common";
import { Btn, Seg, Text } from "@/components/common";
import { ACCOUNT_TYPES, COPY } from "@/constants/partner";
import { missingFor } from "@/lib/gates";
import { usePartnerStore } from "@/store/partnerStore";
import { space } from "@/theme";

/** Days until an FSSAI licence lapses, or null when there is no date yet. */
const daysUntil = (iso: string): number | null => {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;
  return Math.ceil((then - Date.now()) / 86_400_000);
};

export function StepDocuments() {
  const data = usePartnerStore((s) => s.data);
  const set = usePartnerStore((s) => s.set);
  const patch = usePartnerStore((s) => s.patch);
  const fillSample = usePartnerStore((s) => s.fillSample);

  const missing = missingFor(4, data, COPY);
  const expiryDays = daysUntil(data.fssaiExpiry);

  return (
    <StepFrame
      step={4}
      intro="Upload the documents that let us verify the business, and tell us where to pay you."
      onSample={() => fillSample(4)}
      missing={missing}
      onNext={() => router.push("/onboarding/contract")}
      onBack={() => router.back()}
    >
      <Block glyph="badge" title="Tax & identity">
        <Field label="PAN number" required>
          <TextField
            value={data.pan}
            onChangeText={(v) => set("pan", v.toUpperCase().slice(0, 10))}
            placeholder="e.g. ABCDE1234F"
            autoCapitalize="characters"
            maxLength={10}
          />
        </Field>
        <FilePick label="PAN card copy" value={data.panFile} onChange={(f) => set("panFile", f)} />

        <CheckRow
          checked={data.gstExempt}
          onChange={(v) => set("gstExempt", v)}
          label={COPY.gstExemptLabel}
        />

        {data.gstExempt ? (
          <Note tone="info">Noted — your {COPY.noun} is filed as exempt or on the composition scheme.</Note>
        ) : (
          <>
            <Field label="GSTIN" required>
              <TextField
                value={data.gstin}
                onChangeText={(v) => set("gstin", v.toUpperCase().slice(0, 15))}
                placeholder="e.g. 37AAAAA0000A1Z5"
                autoCapitalize="characters"
                maxLength={15}
              />
            </Field>
            <FilePick label="GST certificate" value={data.gstFile} onChange={(f) => set("gstFile", f)} />
          </>
        )}
      </Block>

      <Block glyph="shieldCheck" title={COPY.safetyTitle}>
        <Field label="FSSAI licence number" required>
          <TextField
            value={data.fssai}
            onChangeText={(v) => set("fssai", v.replace(/\D/g, "").slice(0, 14))}
            placeholder="14 digits"
            keyboardType="number-pad"
            maxLength={14}
          />
        </Field>

        <Field label="Expiry date" required>
          <DateField value={data.fssaiExpiry} onChange={(v) => set("fssaiExpiry", v)} />
        </Field>

        {/* An expired or nearly-expired licence is the most common reason an
            application comes back rejected. Say so now, not in a week. */}
        {expiryDays !== null && expiryDays < 0 && (
          <Note tone="bad">That licence has already expired. Renew it before applying.</Note>
        )}
        {expiryDays !== null && expiryDays >= 0 && expiryDays <= 30 && (
          <Note tone="warn">
            That licence expires in {expiryDays} day{expiryDays === 1 ? "" : "s"}. Verification may be held
            up — renew it if you can.
          </Note>
        )}

        <FilePick
          label="FSSAI licence copy"
          desc={COPY.safetyUploadDescription}
          value={data.fssaiFile}
          onChange={(f) => set("fssaiFile", f)}
        />
      </Block>

      <Block glyph="bank" title="Bank & payouts">
        <Field label="Account holder's name" required hint="Exactly as the bank has it">
          <TextField
            value={data.accountHolderName}
            onChangeText={(v) => set("accountHolderName", v)}
            placeholder="e.g. Ravi Kumar Reddy"
            autoCapitalize="words"
          />
        </Field>

        <Field label="Bank account number" required>
          <TextField
            value={data.account}
            onChangeText={(v) => set("account", v.replace(/\D/g, "").slice(0, 18))}
            placeholder="Account number"
            keyboardType="number-pad"
          />
        </Field>

        <Field label="Re-enter account number" required>
          <TextField
            value={data.accountConfirm}
            onChangeText={(v) => set("accountConfirm", v.replace(/\D/g, "").slice(0, 18))}
            placeholder="Type it again"
            keyboardType="number-pad"
            state={data.accountConfirm ? (data.account === data.accountConfirm ? "ok" : "bad") : undefined}
          />
        </Field>
        {!!data.accountConfirm && data.account !== data.accountConfirm && (
          <Note tone="bad">The account numbers do not match.</Note>
        )}

        <Field label="Account type" required>
          <Seg
            options={ACCOUNT_TYPES}
            value={data.accountType}
            onChange={(v) => set("accountType", v)}
            labels={{ savings: "Savings", current: "Current" }}
          />
        </Field>

        <Field label="IFSC code" required>
          <Box style={{ flexDirection: "row", gap: space[2] }}>
            <Box style={{ flex: 1 }}>
              <TextField
                value={data.ifsc}
                /* Any edit invalidates a previous verification. */
                onChangeText={(v) => patch({ ifsc: v.toUpperCase().slice(0, 11), ifscVerified: false })}
                placeholder="e.g. HDFC0001234"
                autoCapitalize="characters"
                maxLength={11}
              />
            </Box>
            <Btn
              label="Confirm"
              variant="accent"
              disabled={data.ifsc.length !== 11}
              /* No lookup happens here — there is no bank-directory
                 integration in this app. This is a re-read checkpoint before
                 moving on, never a claim that the code was checked against a
                 real branch. The note below used to say "branch details
                 fetched", which described something that never happened. */
              onPress={() => set("ifscVerified", true)}
              style={{ width: 100 }}
            />
          </Box>
          {data.ifscVerified && (
            <Note tone="ok">Code confirmed. If it's wrong, your bank will catch it before your first payout.</Note>
          )}
        </Field>

        <Field label="UPI ID" optional hint="An alternative payout route. It does not replace the account above.">
          <TextField
            value={data.upiId}
            onChangeText={(v) => set("upiId", v)}
            placeholder="e.g. business@okhdfcbank"
            autoCapitalize="none"
          />
        </Field>

        <FilePick
          label="Cancelled cheque or bank statement"
          desc="A clear photo showing the account number and the name"
          value={data.chequeFile}
          onChange={(f) => set("chequeFile", f)}
        />

        <Text variant="caption" color="tertiary">
          These details are only ever used to settle what you are owed.
        </Text>
      </Block>
    </StepFrame>
  );
}
