import React from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';
import { formatRupees } from '@/utils/money';
import type { SharingOption } from '@/types/listing';

/**
 * What a hotel asks for, which is not what a PG asks for.
 *
 * ## Why this is its own selector
 *
 * A PG is a stay of some length starting on a date, so `StayIntentSelector`
 * asks for a track and a duration. A hotel bed is bought BETWEEN two dates, on
 * one of three structures the owner priced separately — by the night, by the
 * month, by the hour — at rates that are not multiples of each other. Asking
 * "short or long stay" and "how many days" for that produced a request nobody
 * could price, and made the guest do arithmetic the calendar should do.
 *
 * ## The one rule that shapes the layout
 *
 * Only a nightly rate can be read off a pair of dates. So nights ask for a
 * check-out and count them; hours and months ask for the number directly and
 * the check-out follows. Asking all three for a check-out forced an hourly
 * booking to last at least one night — which is not a thing.
 *
 * Kept in step with RATE_QUANTITY in
 * Backend/src/modules/listings/stayIntent.util.js, which refuses anything this
 * screen would not have offered.
 */

export type HotelRateStructure = 'nightly' | 'monthly' | 'flexible';

const RATE_META: readonly {
  id: HotelRateStructure;
  label: string;
  unit: string;
  qtyUnit: string;
  min: number;
  max: number;
}[] = [
  { id: 'nightly', label: 'Per night', unit: '/night', qtyUnit: 'nights', min: 1, max: 30 },
  { id: 'monthly', label: 'Per month', unit: '/mo', qtyUnit: 'months', min: 1, max: 12 },
  { id: 'flexible', label: 'Hourly', unit: '/hr', qtyUnit: 'hours', min: 1, max: 24 },
];

export type HotelIntent = {
  /** The bed's label, exactly as the listing offered it. */
  sharingId: string | null;
  rateStructure: HotelRateStructure | null;
  /** `YYYY-MM-DD`. A calendar day, never an instant. */
  checkIn: string | null;
  /** Sent for a nightly stay; derived from the count for the other two. */
  checkOut: string | null;
  /** Nights, months or hours, per the structure. */
  rateQuantity: number | null;
};

export type HotelStaySelectorProps = {
  options: readonly SharingOption[];
  value: HotelIntent;
  onChange: (next: HotelIntent) => void;
  /** The window the listing reported: `{ min, max }` as `YYYY-MM-DD`. */
  joinWindow?: { min?: string; max?: string } | null;
};

const nightsBetween = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

const prettyDay = (iso: string): string =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', timeZone: 'UTC',
  });

export function HotelStaySelector({ options, value, onChange, joinWindow }: HotelStaySelectorProps) {
  const { colors, space, radius } = useTheme();

  const set = (patch: Partial<HotelIntent>) => onChange({ ...value, ...patch });

  const bed = options.find((o) => o.id === value.sharingId) ?? null;

  /* Only what this owner priced for THIS bed. A bed sold one way shows no
     picker: there is no decision to present. */
  const rateChoices = RATE_META
    .map((r) => ({ ...r, price: bed?.rates?.[r.id] }))
    .filter((r) => typeof r.price === 'number' && r.price > 0);

  const structure = value.rateStructure ?? rateChoices[0]?.id ?? null;
  const active = rateChoices.find((r) => r.id === structure) ?? rateChoices[0] ?? null;
  const byNight = structure === 'nightly';

  const quantity = byNight
    ? (value.checkIn && value.checkOut ? nightsBetween(value.checkIn, value.checkOut) : 0)
    : (value.rateQuantity ?? 0);
  const total = active && quantity > 0 ? (active.price as number) * quantity : 0;

  const chip = (selected: boolean) => ({
    borderWidth: 1,
    borderColor: selected ? colors.brand : colors.border,
    backgroundColor: selected ? colors.brandTint : colors.surface,
    borderRadius: radius.card,
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    minWidth: 104,
  });

  return (
    <View style={{ gap: space[5] }}>
      {/* ── 1. the bed ──────────────────────────────────────────────── */}
      <View style={{ gap: space[3] }}>
        <Text variant="label" color="secondary">Which bed do you want?</Text>
        <View style={[styles.row, { gap: space[2] }]}>
          {options.map((option) => {
            const on = value.sharingId === option.id;
            return (
              <Pressable
                key={option.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                onPress={() => onChange({
                  ...value,
                  sharingId: option.id,
                  /* A structure the new bed is not sold on would leave a rate
                     on screen that this bed has no price for. */
                  rateStructure: null,
                  rateQuantity: null,
                })}
                style={chip(on)}
              >
                <Text variant="bodyStrong">{option.label}</Text>
                {option.rates?.nightly ? (
                  <Text variant="numMeta" color="secondary">
                    {formatRupees(option.rates.nightly)}/night
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* ── 2. how they are charged ─────────────────────────────────── */}
      {rateChoices.length > 1 ? (
        <View style={{ gap: space[3] }}>
          <Text variant="label" color="secondary">How do you want to be charged?</Text>
          <View style={[styles.row, { gap: space[2] }]}>
            {rateChoices.map((r) => {
              const on = structure === r.id;
              return (
                <Pressable
                  key={r.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  onPress={() => onChange({
                    ...value,
                    rateStructure: r.id,
                    /* "3" means nights on one and hours on another. */
                    rateQuantity: null,
                    checkOut: r.id === 'nightly' ? value.checkOut : null,
                  })}
                  style={chip(on)}
                >
                  <Text variant="bodyStrong">{r.label}</Text>
                  <Text variant="numMeta" color="secondary">
                    {formatRupees(r.price as number)}{r.unit}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* ── 3. when, and how much of it ─────────────────────────────── */}
      {bed ? (
        <View style={{ gap: space[3] }}>
          <Text variant="label" color="secondary">When are you staying?</Text>

          <View style={[styles.row, { gap: space[3] }]}>
            <View style={{ flex: 1, gap: space[1] }}>
              <Text variant="caption" color="tertiary">CHECK-IN</Text>
              <TextInput
                value={value.checkIn ?? ''}
                onChangeText={(checkIn) => set({
                  checkIn: checkIn || null,
                  checkOut: value.checkOut && checkIn && value.checkOut <= checkIn ? null : value.checkOut,
                })}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
                style={[styles.input, {
                  borderColor: colors.border, backgroundColor: colors.surface,
                  color: colors.textPrimary, borderRadius: radius.card, padding: space[3],
                }]}
              />
            </View>

            <View style={{ flex: 1, gap: space[1] }}>
              <Text variant="caption" color="tertiary">
                {byNight ? 'CHECK-OUT' : `HOW MANY ${(active?.qtyUnit ?? 'nights').toUpperCase()}?`}
              </Text>
              {byNight ? (
                <TextInput
                  value={value.checkOut ?? ''}
                  onChangeText={(checkOut) => set({ checkOut: checkOut || null })}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.textTertiary}
                  autoCapitalize="none"
                  style={[styles.input, {
                    borderColor: colors.border, backgroundColor: colors.surface,
                    color: colors.textPrimary, borderRadius: radius.card, padding: space[3],
                  }]}
                />
              ) : (
                <TextInput
                  value={value.rateQuantity ? String(value.rateQuantity) : ''}
                  onChangeText={(text) => set({ rateQuantity: Number(text.replace(/\D/g, '')) || null })}
                  keyboardType="number-pad"
                  placeholder={String(active?.min ?? 1)}
                  placeholderTextColor={colors.textTertiary}
                  style={[styles.input, {
                    borderColor: colors.border, backgroundColor: colors.surface,
                    color: colors.textPrimary, borderRadius: radius.card, padding: space[3],
                  }]}
                />
              )}
            </View>
          </View>

          {joinWindow?.min && joinWindow?.max ? (
            <Text variant="caption" color="tertiary">
              Anytime from {prettyDay(joinWindow.min)} to {prettyDay(joinWindow.max)}
            </Text>
          ) : null}

          {total > 0 && active ? (
            <Text variant="numMeta" color="secondary">
              {quantity} {quantity === 1 ? active.qtyUnit.replace(/s$/, '') : active.qtyUnit}
              {' · '}{formatRupees(active.price as number)}{active.unit}
              {' · '}{formatRupees(total)} in total
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap' },
  input: { borderWidth: 1, fontSize: 15 },
});
