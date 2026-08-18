import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';
import type { MealWindow } from '@/types/food';
import { clockLabel, minuteOfDay } from '@/types/food';

export type Slot = {
  /** Minutes from midnight. The label is derived, never stored separately. */
  minute: number;
  label: string;
  state: 'available' | 'past' | 'full';
};

/**
 * The half-hour slots inside a window.
 *
 * Past and full slots keep their place in the grid. Removing them would make
 * the day's shape unreadable — five chips at 2 pm and two at 3 pm looks like a
 * kitchen with no capacity rather than a kitchen most of whose afternoon has
 * already happened.
 *
 * "Full" is deterministic here because there is no capacity service yet; when
 * one exists this function is the only thing that changes.
 */
export function slotsFor(window: MealWindow, now: Date): Slot[] {
  const nowMinute = minuteOfDay(now);
  const span = window.endMinute > window.startMinute ? window.endMinute - window.startMinute : window.endMinute + 1440 - window.startMinute;
  const slots: Slot[] = [];

  for (let offset = 15; offset < span; offset += 30) {
    const minute = window.startMinute + offset;
    const wrapped = minute % 1440;
    const isPast = wrapped < nowMinute && minute < 1440;
    slots.push({
      minute: wrapped,
      label: clockLabel(wrapped),
      state: isPast ? 'past' : offset % 150 === 45 ? 'full' : 'available',
    });
  }

  return slots;
}

export type SlotPickerProps = {
  window: MealWindow;
  now: Date;
  /** `null` is as-soon-as-possible, which is the default and the common case. */
  value: string | null;
  onChange: (value: string | null) => void;
  /** "about 1:28 pm" — what ASAP actually means for this kitchen. */
  asapLabel: string;
};

export function SlotPicker({ window, now, value, onChange, asapLabel }: SlotPickerProps) {
  const { colors, space, radius } = useTheme();
  const slots = slotsFor(window, now);

  return (
    <View style={{ gap: space[3] }}>
      <Pressable
        onPress={() => onChange(null)}
        accessibilityRole="radio"
        accessibilityState={{ selected: value === null }}
        accessibilityLabel={`As soon as possible, ready ${asapLabel}`}
        style={[
          styles.asap,
          {
            backgroundColor: colors.surface,
            borderColor: value === null ? colors.graphite : colors.border,
            borderWidth: value === null ? 1.5 : StyleSheet.hairlineWidth,
            borderRadius: radius.card,
            padding: space[3],
            gap: space[3],
          },
        ]}
      >
        <View
          style={[
            styles.radio,
            { borderColor: value === null ? colors.graphite : colors.borderInput, borderWidth: value === null ? 6 : 1.5 },
          ]}
        />
        <View style={{ flex: 1 }}>
          <Text variant="title3">As soon as possible</Text>
          <Text variant="numMeta" color="tertiary" style={{ marginTop: 2 }}>
            Ready {asapLabel}
          </Text>
        </View>
      </Pressable>

      <View style={{ gap: space[2] }}>
        <Text variant="eyebrow" color="tertiary">
          {window.label} · {clockLabel(window.startMinute)}–{clockLabel(window.endMinute)}
        </Text>

        <View style={[styles.grid, { gap: space[2] }]}>
          {slots.map((slot) => {
            const selected = value === slot.label;
            const disabled = slot.state !== 'available';
            return (
              <Pressable
                key={slot.label}
                onPress={disabled ? undefined : () => onChange(slot.label)}
                accessibilityRole="radio"
                accessibilityState={{ selected, disabled }}
                accessibilityLabel={
                  slot.state === 'full' ? `${slot.label}, full` : slot.state === 'past' ? `${slot.label}, gone` : slot.label
                }
                style={[
                  styles.slot,
                  {
                    borderRadius: radius.pill,
                    paddingHorizontal: space[3] + 2,
                    backgroundColor: selected ? colors.graphite : disabled ? colors.surfaceRaised : colors.surface,
                    borderColor: selected ? colors.graphite : disabled ? colors.borderSubtle : colors.border,
                  },
                ]}
              >
                <Text
                  variant="numMeta"
                  style={{
                    color: selected ? colors.onGraphite : disabled ? colors.textTertiary : colors.textPrimary,
                    textDecorationLine: slot.state === 'past' ? 'line-through' : 'none',
                  }}
                >
                  {slot.label}
                  {slot.state === 'full' ? ' full' : ''}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  asap: { flexDirection: 'row', alignItems: 'center' },
  radio: { width: 20, height: 20, borderRadius: 999 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  slot: { minHeight: 40, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
});
