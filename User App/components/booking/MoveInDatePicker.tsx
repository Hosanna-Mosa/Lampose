import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Switch, Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';
import { formatRupees } from '@/utils/money';

/**
 * One date, not a range.
 *
 * A range picker would be simply wrong here: the stay is open-ended. There is
 * no move-out date to pick — the student leaves with thirty days' notice
 * whenever they want, which is a different mechanism entirely and belongs on
 * the agreement card rather than in a calendar.
 *
 * The pro-rated first month is computed and shown the moment a date is picked,
 * because a mid-month move-in is the most common source of "why is the first
 * payment different from the rent?"
 */

const WEEKDAY_HEADS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Monday-first index for a JS day number. */
function mondayIndex(jsDay: number): number {
  return (jsDay + 6) % 7;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * The first month, pro-rated from the move-in day.
 *
 * Charged for the days actually lived in, rounded to the rupee — which is what
 * owners in this market do, and what students expect to be able to check.
 */
export function proRatedFirstMonth(rent: number, year: number, month: number, day: number) {
  const total = daysInMonth(year, month);
  const billableDays = total - day + 1;
  return { amount: Math.round((rent / total) * billableDays), billableDays, total };
}

export type MoveInDatePickerProps = {
  year: number;
  /** 0-indexed, as JavaScript counts months. */
  month: number;
  /** The selected day of the month, or null. */
  value: number | null;
  onChange: (day: number) => void;
  /** Monthly rent, so the pro-rated figure can be shown as soon as a day is picked. */
  rent: number;
  /** The owner needs notice to get the bed ready — earlier days are disabled. */
  earliestDay: number;
  noticeDays?: number;
  flexible: boolean;
  onFlexibleChange: (flexible: boolean) => void;
};

export function MoveInDatePicker({
  year,
  month,
  value,
  onChange,
  rent,
  earliestDay,
  noticeDays = 2,
  flexible,
  onFlexibleChange,
}: MoveInDatePickerProps) {
  const { colors, space, radius, touch } = useTheme();

  const total = daysInMonth(year, month);
  const leadingBlanks = mondayIndex(new Date(year, month, 1).getDay());
  const monthLabel = new Date(year, month, 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });

  const cells: (number | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: total }, (_, index) => index + 1),
  ];

  const proRated = value !== null ? proRatedFirstMonth(rent, year, month, value) : null;
  const selectedLabel =
    value !== null
      ? new Date(year, month, value).toLocaleDateString('en-IN', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })
      : null;

  return (
    <View style={{ gap: space[4] }}>
      <View style={{ gap: space[1] }}>
        <Text variant="title3">When do you want to move in?</Text>
        <Text variant="caption" color="secondary">
          Owner needs {noticeDays} days&apos; notice to get the bed ready. There is no move-out date — you
          leave with 30 days&apos; notice whenever you want.
        </Text>
      </View>

      <View style={{ gap: space[2] }}>
        <Text variant="bodyStrong">{monthLabel}</Text>

        <View style={styles.grid}>
          {WEEKDAY_HEADS.map((head, index) => (
            <View key={`${head}-${index}`} style={styles.cell}>
              <Text variant="numMeta" color="tertiary">
                {head}
              </Text>
            </View>
          ))}

          {cells.map((day, index) => {
            if (day === null) return <View key={`blank-${index}`} style={styles.cell} />;

            const disabled = day < earliestDay;
            const selected = day === value;

            return (
              <Pressable
                key={day}
                onPress={disabled ? undefined : () => onChange(day)}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityState={{ selected, disabled }}
                accessibilityLabel={new Date(year, month, day).toLocaleDateString('en-IN', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
                style={styles.cell}
              >
                <View
                  style={[
                    styles.day,
                    {
                      minWidth: touch.min - 4,
                      minHeight: touch.min - 4,
                      borderRadius: radius.chip,
                      backgroundColor: selected ? colors.brand : 'transparent',
                      opacity: disabled ? 0.35 : 1,
                    },
                  ]}
                >
                  <Text variant={selected ? 'priceSm' : 'body'} style={selected ? { color: colors.onBrand } : undefined}>
                    {day}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Switch
        label="I can move a few days either side"
        value={flexible}
        onChange={onFlexibleChange}
      />

      {proRated && selectedLabel ? (
        <View
          style={{
            backgroundColor: colors.surfaceSunken,
            borderRadius: radius.chip,
            padding: space[3],
            gap: space[1],
          }}
        >
          <Text variant="bodyStrong">Moving in on {selectedLabel}</Text>
          {/* The number people ask about. Stated before they have to ask. */}
          <Text variant="caption" color="secondary">
            Your first month is {formatRupees(proRated.amount)}, not {formatRupees(rent)} — you are charged
            for {proRated.billableDays} of {proRated.total} days. Full rent starts the month after.
          </Text>
        </View>
      ) : (
        <Text variant="caption" color="tertiary">
          Pick a date to see what the first month costs.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  // A literal percentage, not a computed one: React Native's DimensionValue
  // only accepts the `${number}%` template type, and `${100 / 7}%` widens to
  // plain string and fails to type-check.
  cell: { width: '14.28%', alignItems: 'center', justifyContent: 'center', paddingVertical: 2 },
  day: { alignItems: 'center', justifyContent: 'center' },
});
