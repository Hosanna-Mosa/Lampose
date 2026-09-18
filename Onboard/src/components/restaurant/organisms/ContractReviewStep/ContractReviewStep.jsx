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
      /* Says what was actually uploaded rather than "all uploaded". Two scans
         are collected; the GST and bank details are held as numbers, and a
         summary that implied otherwise would tell the verification queue to
         expect files that were never asked for. */
      value: 'PAN & FSSAI scans attached',
      /* Three states, not two: a GSTIN is optional now, so "no GSTIN" is an
         ordinary answer and the summary has to be able to say it. Reading
         "GSTIN recorded" against an empty field is how an agent signs off an
         application believing they entered a number they never had. */
      detail: `${gstSummary(form)} · bank details recorded · ${
        form.refundPolicyAccepted ? 'refund policy accepted' : 'REFUND POLICY NOT ACCEPTED'
      }`,
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
