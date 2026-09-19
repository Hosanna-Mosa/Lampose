import React from 'react';
import { ClipboardCheck, PenLine, Receipt } from 'lucide-react';
import {
  Box, Inline, Input, Label, Strong, Text,
} from '../../../common/atoms';
import { Field, FieldError, SectionHead } from '../../molecules/Field/Field';
import { COMMERCIAL_TERMS, COPY } from '../../utils/restaurantOptions';

/*
 * Step 4 — the agreement, and one last look at what is about to be sent.
 *
 * The summary is built from the live form state rather than from a copy taken
 * when the step opened. It is the last screen before a twenty-minute form
 * becomes a row in `food_restaurants`, and a summary that can disagree with
 * what gets submitted is worse than no summary at all.
 */

/** What the summary says about GST — a number, a declared exemption, or neither. */
const gstSummary = (form) => {
  if (form.gstExempt) return 'GST exempt';
  if (String(form.gstin || '').trim()) return 'GSTIN recorded';
  return 'No GSTIN given';
};

/*
 * What was actually attached, rather than "PAN & FSSAI scans attached".
 *
 * Both scans are optional now, so the old sentence was a claim the form could
 * not keep: an application with neither file said the same words as one with
 * both, and the verification queue read it as two documents that had gone
 * missing in transit.
 */
const scanSummary = (form) => {
  const attached = [form.panFile && 'PAN', form.fssaiFile && 'FSSAI'].filter(Boolean);
  if (attached.length === 2) return 'PAN & FSSAI scans attached';
  if (attached.length === 1) return `${attached[0]} scan attached`;
  return 'No scans attached';
};

/*
 * The bank block, which may legitimately be empty.
 *
 * "bank details recorded" used to be printed unconditionally. With the block
 * optional that is the one line on this screen an agent would rely on and be
 * wrong about — they sign off believing an account was captured, and the
 * restaurant discovers otherwise the week the first settlement does not
 * arrive. Said in the same voice as the GSTIN beside it: three states.
 */
const bankSummary = (form) => {
  const account = String(form.bankAccount || '').replace(/\D/g, '');
  if (!account) return 'No bank details yet';
  return `bank a/c ...${account.slice(-4)} recorded`;
};

/*
 * The Aadhaar, and whether its mobile actually answered.
 *
 * Printed as its own clause because it is the only thing on step 3 that was
 * PROVEN rather than copied off a document, and it is what the verification
 * queue reads to know which kind of application it is holding.
 */
const aadhaarSummary = (form) => {
  const digits = String(form.aadhaarNumber || '').replace(/\D/g, '');
  if (!digits) return 'NO AADHAAR GIVEN';

  const proven = form.aadhaarVerified
    && form.aadhaarToken
    && String(form.aadhaarVerifiedPhone || '').replace(/\D/g, '')
      === String(form.aadhaarPhone || '').replace(/\D/g, '');

  return `Aadhaar ...${digits.slice(-4)} · mobile ${proven ? 'verified' : 'NOT VERIFIED'}`;
};

export function ContractReviewStep({ form, set, errors = {}, touch = () => {} }) {
  const copy = COPY;

  const summary = [
    {
      label: copy.summaryLabel,
      value: form.restaurantName || '—',
      detail: [form.cuisines.join(', '), [form.area, form.city].filter(Boolean).join(', ')]
        .filter(Boolean).join(' · '),
    },
    {
      label: 'Owner',
      value: form.ownerName || '—',
      detail: [form.ownerEmail, form.ownerPhone].filter(Boolean).join(' · '),
    },
    {
      label: 'Hours',
      value: `${form.selectedDays.length} day${form.selectedDays.length === 1 ? '' : 's'}/week`,
      detail: form.selectedDays
        .map((day) => `${day.slice(0, 3)}: ${(form.dayTimeSlots[day] || [])
          .map((slot) => `${slot.open}–${slot.close}`).join(', ')}`)
        .join(' | '),
    },
    {
      label: 'Documents',
      /* Every clause below says what is ACTUALLY there, including when the
         answer is "nothing". Each of these fields is optional in its own way
         now — a scan may follow later, a GSTIN may not exist, a bank account
         may not be open yet — and a summary that reads the same whether or
         not they arrived is the line an agent signs off against. Only the
         Aadhaar is shouted, because it is the one here that cannot be fixed
         later without finding the owner and their handset again. */
      value: scanSummary(form),
      detail: `${aadhaarSummary(form)} · ${gstSummary(form)} · ${bankSummary(form)}`,
    },
  ];

  return (
    <Box className="animate-fade-in">
      <Box className="rst-step-head">
        <Text className="rst-step-title">Partner Contract & Final Review</Text>
        <Text className="rst-step-sub">Review the partner agreement and sign digitally.</Text>
      </Box>

      {/* ── 4.1 Commercial terms ────────────────────────────────────────── */}
      <Box className="rst-section">
        <SectionHead icon={<Receipt size={16} color="#45855a" />} title="Commission & Commercial Terms" />

        <Box className="rst-card">
          {COMMERCIAL_TERMS.map((term) => (
            <Box key={term.label} className="rst-term-row">
              <Box className="rst-dot" />
              <Box>
                <Text style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--text-main)' }}>
                  {term.label}
                </Text>
                <Text style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '2px', lineHeight: 1.45 }}>
                  {term.value}
                </Text>
              </Box>
            </Box>
          ))}
        </Box>
      </Box>

      {/* ── 4.2 Digital sign-off ────────────────────────────────────────── */}
      <Box className="rst-section">
        <SectionHead icon={<PenLine size={16} color="#45855a" />} title="Digital Sign-off" />

        <Box className="rst-card">
          <Field label="Terms of Service">
            <Box className="rst-terms">
              <Text><Strong>LAMPOSE PARTNER MERCHANT AGREEMENT</Strong></Text>
              <Text>
                This Partner Merchant Agreement ("Agreement") is entered into between the
                merchant ("Partner") and Lampose ("Platform").
              </Text>
              <Text>
                <Strong>1. Services:</Strong> The Platform agrees to list the Partner's
                restaurant and facilitate {copy.contractServiceText} to end customers
                through the Lampose platform.
              </Text>
              <Text>
                <Strong>2. Commission:</Strong> Partner agrees to pay a commission on each
                order as per the agreed commission structure. Commission rates are subject
                to review and modification with 30 days' notice.
              </Text>
              <Text>
                <Strong>3. Payment Terms:</Strong> All payments due to Partner will be
                settled on a weekly basis, net of commissions, fees, and applicable taxes.
                Partner is responsible for providing accurate bank account details.
              </Text>
              <Text>
                <Strong>4. Menu &amp; Pricing:</Strong> Partner
                retains the right to set prices. The Platform may suggest pricing
                optimization. Partner must maintain accurate listings and availability.
              </Text>
              <Text>
                <Strong>5. Quality Standards:</Strong> Partner agrees to maintain quality,
                hygiene standards, and packaging requirements as specified by the Platform.
                Non-compliance may result in de-listing.
              </Text>
              <Text>
                <Strong>6. Term &amp; Termination:</Strong> This agreement shall remain in
                effect until terminated by either party with 30 days' written notice. The
                Platform reserves the right to terminate immediately for breach of terms.
              </Text>
              <Text>
                <Strong>7. Data &amp; Privacy:</Strong> Partner agrees to the collection and
                use of customer order data for analytics and platform improvement purposes,
                in accordance with applicable data protection laws.
              </Text>
              <Text>
                <Strong>8. Indemnification:</Strong> Partner agrees to indemnify and hold the
                Platform harmless from any claims arising from the quality or safety of
                products, delivery delays, or any breach of applicable laws.
              </Text>
              <Text>
                By accepting this agreement, you acknowledge that you have read, understood,
                and agreed to all the terms and conditions outlined above.
              </Text>
            </Box>
          </Field>
        </Box>

        <Box className={`rst-card${errors.acceptedTos ? ' is-bad' : ''}`} id="rst-tos" tabIndex={-1}>
          <Label className="rst-check">
            <Input
              type="checkbox"
              checked={form.acceptedTos}
              onChange={() => { set({ acceptedTos: !form.acceptedTos }); touch('acceptedTos'); }}
            />
            <Box>
              <Text style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--text-main)' }}>
                I accept the partner contract terms and conditions.
                <Inline className="rst-req"> *</Inline>
              </Text>
              <Text style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '3px', lineHeight: 1.45 }}>
                By accepting, you agree to all the terms outlined in the partner merchant
                agreement above.
              </Text>
              <FieldError message={errors.acceptedTos} />
            </Box>
          </Label>
        </Box>

        <Box className="rst-card">
          <Field
            label="Digital Signature"
            hint="Type the owner's full name below as the digital signature. This serves as legal acceptance of the agreement."
            required
            htmlFor="rst-signature"
            error={errors.signature}
          >
            <Input
              id="rst-signature"
              className={`rst-input${errors.signature ? ' is-bad' : ''}`}
              type="text"
              value={form.signature}
              onChange={(event) => set({ signature: event.target.value })}
              onBlur={() => touch('signature')}
              placeholder="Type the full legal name"
              style={{ fontWeight: 700 }}
            />
          </Field>

          {form.signature && (
            <Box className="rst-sign">
              <Text style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Signed digitally by:
              </Text>
              <Text className="rst-sign-name">{form.signature}</Text>
            </Box>
          )}
        </Box>
      </Box>

      {/* ── Review summary ──────────────────────────────────────────────── */}
      <Box className="rst-section">
        <SectionHead icon={<ClipboardCheck size={16} color="#45855a" />} title="Application Summary" />

        {summary.map((entry) => (
          <Box key={entry.label} className="rst-summary">
            <Box style={{ minWidth: 0 }}>
              <Text className="rst-summary-key">{entry.label}</Text>
              <Text className="rst-summary-val">{entry.value}</Text>
              {entry.detail && <Text className="rst-summary-det">{entry.detail}</Text>}
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
