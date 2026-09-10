/* ══════════════════════════════════════════════════════════════════════════
   Step 2 — Operations & Delivery.

   New: the website's flow had no equivalent. These settings decide the ETA a
   diner is shown, the area served and what the kitchen is paid, so they are
   worth their own step rather than being buried under the menu.

   A day holds a LIST of slots because a kitchen that closes between lunch and
   dinner is the normal case, not an edge one. "Copy Monday to every day" is
   there because seven days of identical hours entered by hand on a phone is
   the fastest way to lose a partner mid-form.
   ══════════════════════════════════════════════════════════════════════════ */
import { tappableRow } from "@/components/common/utils/sharedStyles";
import { router } from "expo-router";
import React from "react";
import {
  StyleSheet,
} from "react-native";

import { Block, Box, Field, Note, NumberField, StepFrame, SwitchRow, Tappable, TimeRange } from "@/components/common";
import { ChoiceChip, Icon, Seg, Stepper, Text } from "@/components/common";
import {
  COPY,
  DAYS,
  DELIVERY_FEE_LABELS,
  DELIVERY_FEE_TYPES,
  OPEN_STATES,
  OPEN_STATE_LABELS,
} from "@/constants/partner";
import { deliverySentence } from "@/lib/money";
import { missingFor } from "@/lib/gates";
import { usePartnerStore } from "@/store/partnerStore";
import { colors, radius, space, touch } from "@/theme";

export function StepOperations() {
  const data = usePartnerStore((s) => s.data);
  const set = usePartnerStore((s) => s.set);
  const patch = usePartnerStore((s) => s.patch);
  const toggleDay = usePartnerStore((s) => s.toggleDay);
  const setSlots = usePartnerStore((s) => s.setSlots);
  const fillSample = usePartnerStore((s) => s.fillSample);

  const missing = missingFor(2, data, COPY);
  const daySlots = data.slots[data.activeDay] ?? [];
  const allDays = data.days.length === DAYS.length;

  const copyMondayEverywhere = () => {
    const monday = data.slots.Monday ?? [{ open: "09:00", close: "22:00" }];
    const next: Record<string, typeof monday> = {};
    for (const day of DAYS) next[day] = monday.map((s) => ({ ...s }));
    patch({ slots: next });
  };

  return (
    <StepFrame
      step={2}
      intro="These decide the delivery time a diner sees, how far you serve, and what you are paid."
      onSample={() => fillSample(2)}
      missing={missing}
      onNext={() => router.push("/onboarding/menu")}
      onBack={() => router.back()}
    >
      <Block glyph="clock" title="Opening hours">
        <Field label="Days you are open" required>
          <Box style={styles.chipWrap}>
            {DAYS.map((day) => (
              <ChoiceChip
                key={day}
                label={day.slice(0, 3)}
                selected={data.days.includes(day)}
                onPress={() => toggleDay(day)}
              />
            ))}
          </Box>
          <Tappable
            accessibilityRole="button"
            onPress={() => patch({ days: allDays ? [] : [...DAYS], activeDay: "Monday" })}
            style={styles.link}
          >
            <Text variant="bodyStrong" color="brand">
              {allDays ? "Clear all days" : "Select every day"}
            </Text>
          </Tappable>
        </Field>

        {data.days.length > 0 && (
          <Field label="Opening & closing times" hint={COPY.operatingHelp}>
            <Box style={styles.chipWrap}>
              {data.days.map((day) => (
                <ChoiceChip
                  key={day}
                  label={day.slice(0, 3)}
                  selected={data.activeDay === day}
                  onPress={() => set("activeDay", day)}
                />
              ))}
            </Box>

            <Box style={{ gap: space[2], marginTop: space[2] }}>
              {daySlots.map((slot, i) => (
                <TimeRange
                  key={`${data.activeDay}-${i}`}
                  slot={slot}
                  onChange={(next) => setSlots(data.activeDay, daySlots.map((s, idx) => (idx === i ? next : s)))}
                  onRemove={
                    daySlots.length > 1
                      ? () => setSlots(data.activeDay, daySlots.filter((_, idx) => idx !== i))
                      : undefined
                  }
                />
              ))}
            </Box>

            <Tappable
              accessibilityRole="button"
              onPress={() => setSlots(data.activeDay, [...daySlots, { open: "18:00", close: "23:00" }])}
              style={styles.link}
            >
              <Icon name="plus" size={14} color={colors.brandInk} />
              <Text variant="bodyStrong" color="brand">
                Add another slot for {data.activeDay}
              </Text>
            </Tappable>

            <Tappable accessibilityRole="button" onPress={copyMondayEverywhere} style={styles.link}>
              <Icon name="refresh" size={14} color={colors.brandInk} />
              <Text variant="bodyStrong" color="brand">
                Copy Monday&apos;s hours to every day
              </Text>
            </Tappable>
          </Field>
        )}
      </Block>

      <Block glyph="power" title="Availability">
        <Field
          label="Right now"
          hint="A manual choice beats the schedule until you set it back to Schedule."
        >
          <Seg
            options={OPEN_STATES}
            value={data.openState}
            onChange={(v) => set("openState", v)}
            labels={OPEN_STATE_LABELS}
          />
        </Field>
      </Block>

      <Block glyph="truck" title="Preparation & delivery area">
        <Field label="Average preparation time" required hint="This is the ETA a diner sees before ordering.">
          <Stepper
            value={data.avgPreparationTime}
            onChange={(v) => set("avgPreparationTime", v)}
            min={5}
            max={120}
            step={5}
            suffix="min"
          />
        </Field>

        <Field label="Delivery radius" required hint="How far from the kitchen you are willing to serve.">
          <Stepper
            value={data.deliveryRadiusKm}
            onChange={(v) => set("deliveryRadiusKm", v)}
            min={1}
            max={30}
            step={1}
            suffix="km"
          />
        </Field>
      </Block>

      <Block glyph="rupee" title="Order charges">
        <Field label="Minimum order value" optional>
          <NumberField
            value={data.minOrderValue}
            onChangeText={(v) => set("minOrderValue", v)}
            placeholder="0"
            prefix="₹"
          />
        </Field>

        <Field label="Packaging charge" optional>
          <NumberField
            value={data.packagingCharge}
            onChangeText={(v) => set("packagingCharge", v)}
            placeholder="0"
            prefix="₹"
          />
        </Field>

        <Field label="How delivery is charged" required>
          <Seg
            options={DELIVERY_FEE_TYPES}
            value={data.deliveryFeeType}
            onChange={(v) => set("deliveryFeeType", v)}
            labels={DELIVERY_FEE_LABELS}
          />
        </Field>

        {/* Only the field the chosen rule actually uses. Showing all three
            invites a partner to fill in numbers their pricing never involves. */}
        {data.deliveryFeeType === "flat" && (
          <Field label="Delivery fee" required>
            <NumberField
              value={data.deliveryFeeAmount}
              onChangeText={(v) => set("deliveryFeeAmount", v)}
              placeholder="30"
              prefix="₹"
            />
          </Field>
        )}
        {data.deliveryFeeType === "distance_based" && (
          <Field label="Rate per kilometre" required>
            <NumberField
              value={data.deliveryFeePerKm}
              onChangeText={(v) => set("deliveryFeePerKm", v)}
              placeholder="8"
              prefix="₹"
              suffix="/ km"
              decimals
            />
          </Field>
        )}
        {data.deliveryFeeType === "free_above" && (
          <>
            <Field label="Fee below the threshold" required>
              <NumberField
                value={data.deliveryFeeAmount}
                onChangeText={(v) => set("deliveryFeeAmount", v)}
                placeholder="30"
                prefix="₹"
              />
            </Field>
            <Field label="Free above" required>
              <NumberField
                value={data.deliveryFreeAboveValue}
                onChangeText={(v) => set("deliveryFreeAboveValue", v)}
                placeholder="499"
                prefix="₹"
              />
            </Field>
          </>
        )}

        {/* Read back what was just configured, in the words a diner would see.
            A pricing rule nobody can restate is one that gets set wrong. */}
        <Note tone="info" glyph="info">
          {deliverySentence(data)}
        </Note>
      </Block>

      <Block glyph="card" title="Payments accepted">
        <SwitchRow
          glyph="card"
          label="Online payment"
          sub="UPI, cards and wallets, settled weekly"
          value={data.acceptsOnlinePayment}
          onChange={(v) => set("acceptsOnlinePayment", v)}
        />
        <SwitchRow
          glyph="wallet"
          label="Cash on delivery"
          sub="Collected at the door by the rider"
          value={data.acceptsCod}
          onChange={(v) => set("acceptsCod", v)}
        />
        {!data.acceptsOnlinePayment && !data.acceptsCod && (
          <Note tone="bad">
            With both switched off there is no way for a diner to pay you. Turn at least one on.
          </Note>
        )}
      </Block>
    </StepFrame>
  );
}

const styles = StyleSheet.create({
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  link: tappableRow,
});
