/* ══════════════════════════════════════════════════════════════════════════
   Step 5 — Contract & Review.

   The commercial terms come from the same constant the pitch screen quotes, so
   what a partner signs and what we advertise cannot drift apart.

   Every review row carries a pencil back to the step that owns it. A review
   screen you cannot act on is a wall of text.
   ══════════════════════════════════════════════════════════════════════════ */
import { router } from "expo-router";
import React, { useState } from "react";
import {
  StyleSheet,
} from "react-native";

import { Block, Box, CheckRow, Field, Note, Scroller, StepFrame, Tappable, TextField } from "@/components/common";
import { Icon, Notice, Rule, Text, Well } from "@/components/common";
import { COMMERCIALS, COPY, STEPS } from "@/constants/partner";
import {
  CONTRACT_CLAUSES,
  CONTRACT_CLOSING,
  CONTRACT_PREAMBLE,
  CONTRACT_TITLE,
  fillClause,
} from "@/constants/contract";
import { missingFor } from "@/lib/gates";
import { deliverySentence } from "@/lib/money";
import { submitApplication } from "@/services/foodPartner";
import { usePartnerStore } from "@/store/partnerStore";
import { colors, radius, space, touch } from "@/theme";

export function StepContract() {
  const data = usePartnerStore((s) => s.data);
  const set = usePartnerStore((s) => s.set);
  const submitting = usePartnerStore((s) => s.submitting);
  const submitError = usePartnerStore((s) => s.submitError);
  const beginSubmit = usePartnerStore((s) => s.beginSubmit);
  const finishSubmit = usePartnerStore((s) => s.finishSubmit);
  const fillSample = usePartnerStore((s) => s.fillSample);
  const phoneProof = usePartnerStore((s) => s.phoneProof);

  const [progress, setProgress] = useState("");

  const missing = missingFor(5, data, COPY);
  const items = data.menuCategories.flatMap((c) => c.items);

  const send = async () => {
    beginSubmit();
    try {
      /* Uploading a restaurant's photographs is the slowest thing this app
         does. A submit button that sits still for forty seconds reads as
         broken, so the count is shown as it goes. */
      const result = await submitApplication(data, phoneProof, ({ done, total, label }) => {
        setProgress(total && done < total ? `Uploading ${done + 1} of ${total} — ${label}` : "");
      });
      finishSubmit(result);
      router.replace("/submitted");
    } catch (err) {
      finishSubmit(null, (err as Error)?.message);
    } finally {
      setProgress("");
    }
  };

  const rows = [
    {
      step: 1,
      label: COPY.summaryLabel,
      value: data.restaurantName || "—",
      detail: [data.cuisineTypes.join(", "), [data.city, data.state].filter(Boolean).join(", ")]
        .filter(Boolean)
        .join(" · "),
    },
    {
      step: 1,
      label: "Owner",
      value: data.ownerName || "—",
      detail: [data.ownerEmail, data.phone && `+91 ${data.phone}`].filter(Boolean).join(" · "),
    },
    {
      step: 1,
      label: "Address",
      value: [data.addressLine1, data.addressLine2].filter(Boolean).join(", ") || "—",
      detail: [data.landmark, data.pincode, data.lat && `${data.lat}, ${data.lng}`].filter(Boolean).join(" · "),
    },
    {
      step: 2,
      label: "Hours",
      value: `${data.days.length} day${data.days.length === 1 ? "" : "s"} a week`,
      detail: data.days
        .map((day) => `${day.slice(0, 3)} ${(data.slots[day] || []).map((s) => `${s.open}–${s.close}`).join(", ")}`)
        .join(" · "),
    },
    {
      step: 2,
      label: "Delivery",
      value: `${data.deliveryRadiusKm} km · ${data.avgPreparationTime} min prep`,
      detail: deliverySentence(data),
    },
    {
      step: 2,
      label: "Payments",
      value: [data.acceptsOnlinePayment && "Online", data.acceptsCod && "Cash"].filter(Boolean).join(" · ") || "—",
      detail: "",
    },
    {
      step: 3,
      label: "Menu",
      value:
        data.menuMode === "upload"
          ? `${data.menuRows.length} item${data.menuRows.length === 1 ? "" : "s"} from a sheet`
          : `${items.length} item${items.length === 1 ? "" : "s"} in ${data.menuCategories.length} categor${
              data.menuCategories.length === 1 ? "y" : "ies"
            }`,
      detail:
        data.menuMode === "upload" ? data.menuFile?.name || "" : data.menuCategories.map((c) => c.name).join(", "),
    },
    {
      step: 4,
      label: "Documents",
      value: "PAN, FSSAI, bank — all attached",
      detail:
        `PAN ${data.pan} · ${data.gstExempt ? "GST exempt" : `GST ${data.gstin}`} · FSSAI ${data.fssai} · ` +
        `A/C ending ${data.account.slice(-4)}`,
    },
  ];

  return (
    <StepFrame
      step={5}
      intro="Read the commercial terms, sign, and send the application in."
      onSample={() => fillSample(5)}
      missing={missing}
      gatePrefix="Before you can send this: "
      nextLabel="Submit and sign"
      nextLoading={submitting}
      onNext={send}
      onBack={() => router.back()}
    >
      {/*
        Stacked, not `DataRow`'s side-by-side label/value — that layout is
        built for a short answer next to a short label ("Owner: Asha Rao")
        and breaks down on a full sentence. A long value next to a `flex: 1`
        label with nothing constraining either one's natural width is exactly
        the shape that made "Payment cycle" and "Promotional contribution"
        collapse to a single-character-wide column, wrapping vertically
        letter by letter — a real layout bug, not a styling opinion. Label
        above, value below, both take the full row width and wrap normally,
        which a sentence needs anyway regardless of the bug.
      */}
      <Block glyph="contract" title="Commission & commercial terms">
        {COMMERCIALS.map((term, i) => (
          <Box key={term.label} style={{ gap: 4 }}>
            {i > 0 && <Rule subtle style={{ marginBottom: space[3] }} />}
            <Text variant="eyebrow" color="tertiary">
              {term.label}
            </Text>
            <Text variant="body">{term.value}</Text>
          </Box>
        ))}
      </Block>

      <Block glyph="pen" title="Sign the agreement">
        <Well style={{ padding: 0 }}>
          <Scroller style={{ maxHeight: 260 }} contentContainerStyle={{ padding: space[3], gap: space[2] }} nestedScrollEnabled>
            <Text variant="title2">{CONTRACT_TITLE}</Text>
            <Text variant="caption" color="secondary">
              {CONTRACT_PREAMBLE}
            </Text>
            {CONTRACT_CLAUSES.map((clause) => (
              <Box key={clause.n} style={{ gap: 2 }}>
                <Text variant="title3">
                  {clause.n}. {clause.heading}
                </Text>
                <Text variant="caption" color="secondary">
                  {fillClause(clause.body, COPY)}
                </Text>
              </Box>
            ))}
            <Rule subtle />
            <Text variant="caption" color="secondary">
              {CONTRACT_CLOSING}
            </Text>
          </Scroller>
        </Well>

        <CheckRow
          checked={data.accepted}
          onChange={(v) => set("accepted", v)}
          label="I accept the partner contract terms."
          sub={`Accepting binds the ${COPY.noun} to the agreement above.`}
        />

        <Field
          label="Digital signature"
          required
          hint="Type your full legal name. This is your acceptance of the agreement."
        >
          <TextField
            value={data.signature}
            onChangeText={(v) => set("signature", v)}
            placeholder="Your full legal name"
            autoCapitalize="words"
          />
        </Field>

        {!!data.signature.trim() && (
          <Box style={styles.signed}>
            <Text variant="caption" color="tertiary">
              Signed digitally by
            </Text>
            <Text variant="display2">{data.signature}</Text>
          </Box>
        )}
      </Block>

      <Block glyph="check" title="What you are sending">
        {rows.map((row, i) => (
          <Box key={row.label}>
            {i > 0 && <Rule subtle style={{ marginBottom: space[3] }} />}
            <Tappable
              accessibilityRole="button"
              accessibilityLabel={`Edit ${row.label}`}
              onPress={() => router.push(STEPS[row.step - 1].route as never)}
              style={styles.summaryRow}
            >
              <Box style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text variant="eyebrow" color="tertiary">
                  {row.label}
                </Text>
                <Text variant="title2">{row.value}</Text>
                {!!row.detail && (
                  <Text variant="caption" color="tertiary">
                    {row.detail}
                  </Text>
                )}
              </Box>
              <Icon name="edit" size={16} color={colors.textTertiary} />
            </Tappable>
          </Box>
        ))}
      </Block>

      {!!progress && <Notice tone="info" glyph="upload" title="Sending your images" body={progress} />}

      {!!submitError && <Notice tone="danger" glyph="alert" title="That did not send" body={submitError} />}

      <Note tone="info">
        Nothing is charged today. Someone from the team reviews the application and comes back within 24
        hours.
      </Note>
    </StepFrame>
  );
}

const styles = StyleSheet.create({
  signed: {
    gap: 2,
    backgroundColor: colors.brandTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.brandOnDark,
    borderRadius: radius.button,
    padding: space[3],
  },
  summaryRow: { flexDirection: "row", alignItems: "center", gap: space[3], minHeight: touch.min },
});
