import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';

export type AddControlProps = {
  value: number;
  onChange: (value: number) => void;
  /** Row-sized by default; `lg` is the 52pt pair on the dish screen. */
  size?: 'sm' | 'lg';
  /** Sold out, or the kitchen is shut. `reason` replaces the label. */
  disabled?: boolean;
  reason?: string;
  max?: number;
  /** Read out with the count, e.g. "Unlimited veg thali". */
  accessibilityLabel: string;
};

/**
 * Add, then quantity — one control, one footprint.
 *
 * At zero it is a bordered "Add"; above zero it becomes a filled stepper of
 * exactly the same width and height. That identical footprint is the whole
 * point: a menu where adding an item makes its row reflow throws every other
 * row down the screen mid-tap, and the second tap lands on the wrong dish.
 *
 * The filled state is `graphite`, not the accent — the accent in this app is
 * reserved for confirmed outcomes, and having one item in a cart is not one.
 */
export function AddControl({
  value,
  onChange,
  size = 'sm',
  disabled,
  reason,
  max = 20,
  accessibilityLabel,
}: AddControlProps) {
  const { colors, radius } = useTheme();

  const height = size === 'lg' ? 52 : 34;
  const width = size === 'lg' ? 118 : 88;
  const glyph = size === 'lg' ? 'title1' : 'title2';

  if (disabled) {
    return (
      <View
        accessibilityLabel={`${accessibilityLabel}, ${reason ?? 'unavailable'}`}
        style={[
          styles.frame,
          {
            width,
            height,
            borderRadius: radius.chip,
            backgroundColor: colors.surfaceSunken,
            borderColor: colors.borderSubtle,
          },
        ]}
      >
        <Text variant="caption" color="tertiary" numberOfLines={1}>
          {reason ?? 'Unavailable'}
        </Text>
      </View>
    );
  }

  if (value === 0) {
    return (
      <Pressable
        onPress={() => onChange(1)}
        accessibilityRole="button"
        accessibilityLabel={`Add ${accessibilityLabel}`}
        style={({ pressed }) => [
          styles.frame,
          {
            width,
            height,
            borderRadius: radius.chip,
            backgroundColor: pressed ? colors.surfaceSunken : colors.surface,
            borderColor: colors.borderInput,
          },
        ]}
      >
        <Text variant={size === 'lg' ? 'title2' : 'title3'} style={{ color: colors.textPrimary }}>
          Add
        </Text>
      </Pressable>
    );
  }

  return (
    <View
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ text: `${value}` }}
      style={[
        styles.frame,
        styles.stepper,
        { width, height, borderRadius: radius.chip, backgroundColor: colors.graphite, borderColor: colors.graphite },
      ]}
    >
      <Pressable
        onPress={() => onChange(value - 1)}
        hitSlop={10}
        accessibilityRole="button"
        // At one, the minus removes rather than decrements, and it should say so.
        accessibilityLabel={value === 1 ? `Remove ${accessibilityLabel}` : `One less ${accessibilityLabel}`}
        style={styles.stepButton}
      >
        <Text variant={glyph} style={{ color: colors.onGraphite }}>
          {value === 1 ? '×' : '−'}
        </Text>
      </Pressable>

      <Text variant={size === 'lg' ? 'priceMd' : 'numMeta'} style={{ color: colors.onGraphite }}>
        {value}
      </Text>

      <Pressable
        onPress={() => onChange(Math.min(max, value + 1))}
        hitSlop={10}
        disabled={value >= max}
        accessibilityRole="button"
        accessibilityLabel={`One more ${accessibilityLabel}`}
        style={styles.stepButton}
      >
        <Text variant={glyph} style={{ color: value >= max ? colors.onGraphiteMuted : colors.onGraphite }}>
          +
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    flexShrink: 0,
  },
  stepper: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 10 },
  stepButton: { minWidth: 20, alignItems: 'center', justifyContent: 'center' },
});