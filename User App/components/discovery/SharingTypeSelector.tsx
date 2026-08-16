import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useDerivedValue, withTiming } from 'react-native-reanimated';

import { Text } from '@/components/ui';
import { easing } from '@/constants/motion';
import { useReduceMotion, useTheme } from '@/context/ThemeContext';
import { formatRupees } from '@/utils/money';
import type { SharingOption } from '@/types/listing';

const TICK = { duration: 160, easing: easing.enter };

/**
 * What may be pre-selected, and what may not.
 *
 * Two-sharing is pre-selected only when it is both available and the median
 * choice for this listing. Otherwise nothing is selected and the caller keeps
 * its CTA disabled — a pre-selected sharing type the user did not choose is a
 * price they did not agree to.
 */
export function defaultSharingSelection(options: readonly SharingOption[]): string | null {
  const median = options.find((option) => option.median && option.bedsLeft > 0);
  return median ? median.id : null;
}

export type SharingTypeSelectorProps = {
  options: readonly SharingOption[];
  value: string | null;
  onChange: (id: string) => void;
  /** Shown under the rows: the note that explains the deposit or the unit. */
  note?: string;
};

/**
 * Choosing how many people share the room.
 *
 * Every price here is per person, per month. The single biggest source of
 * confusion in this market is a room price quoted where a bed price is
 * expected, so the column header says it out loud and every row repeats the
 * unit rather than trusting the header to be remembered.
 *
 * A dormitory has one option and no choice to make, so the selector collapses
 * to a static line instead of offering a radio group with one button in it.
 */
export function SharingTypeSelector({ options, value, onChange, note }: SharingTypeSelectorProps) {
  const { colors, space, radius } = useTheme();

  if (options.length === 0) return null;

  // One option is not a choice. Rendering it as one would imply an alternative
  // that does not exist.
  if (options.length === 1) {
    const only = options[0];
    return (
      <View style={{ gap: space[2] }}>
        <Text variant="title3">Your bed</Text>
        <View
          style={{
            backgroundColor: colors.surfaceSunken,
            borderRadius: radius.chip,
            padding: space[3],
            gap: space[1],
          }}
        >
          <Text variant="bodyStrong">{only.label}</Text>
          <Text variant="numMeta" color="secondary">
            {formatRupees(only.pricePerPerson)} per person, per month · {only.bedsLeft} free
          </Text>
        </View>
        {note ? (
          <Text variant="caption" color="secondary">
            {note}
          </Text>
        ) : null}
      </View>
    );
  }

  const reference =
    options.find((option) => option.id === value) ??
    options.find((option) => option.median) ??
    options[0];

  return (
    <View style={{ gap: space[2] }}>
      <View style={styles.headRow}>
        <Text variant="title3">Choose your sharing</Text>
        {/* Said out loud, once, above the column it governs. */}
        <Text variant="label" color="tertiary">
          price per person
        </Text>
      </View>

      <View accessibilityRole="radiogroup" accessibilityLabel="Sharing type">
        {options.map((option, index) => (
          <SharingRow
            key={option.id}
            option={option}
            selected={option.id === value}
            delta={option.pricePerPerson - reference.pricePerPerson}
            first={index === 0}
            onSelect={() => onChange(option.id)}
          />
        ))}
      </View>

      {note ? (
        <Text variant="caption" color="secondary">
          {note}
        </Text>
      ) : null}
    </View>
  );
}

function SharingRow({
  option,
  selected,
  delta,
  first,
  onSelect,
}: {
  option: SharingOption;
  selected: boolean;
  delta: number;
  first: boolean;
  onSelect: () => void;
}) {
  const { colors, space, touch } = useTheme();
  const reduceMotion = useReduceMotion();
  const soldOut = option.bedsLeft === 0;

  const progress = useDerivedValue(() => withTiming(selected ? 1 : 0, TICK), [selected]);

  const dotStyle = useAnimatedStyle(
    () => ({
      opacity: progress.value,
      transform: [{ scale: reduceMotion ? 1 : 0.4 + progress.value * 0.6 }],
    }),
    [reduceMotion],
  );

  const body = (
    <View
      style={[
        styles.row,
        {
          minHeight: 56,
          paddingVertical: space[2],
          gap: space[3],
          borderTopWidth: first ? 0 : StyleSheet.hairlineWidth,
          borderTopColor: colors.borderSubtle,
          opacity: soldOut ? 0.55 : 1,
        },
      ]}
    >
      {/* A sold-out row keeps its place but loses its radio: it is information
          about why the price jumped, not something to choose. */}
      {soldOut ? (
        <View style={[styles.ring, { borderColor: colors.borderSubtle }]} />
      ) : (
        <View style={[styles.ring, { borderColor: selected ? colors.brand : colors.textTertiary }]}>
          <Animated.View style={[styles.dot, dotStyle, { backgroundColor: colors.brand }]} />
        </View>
      )}

      <View style={styles.flex}>
        <Text variant={selected ? 'bodyStrong' : 'bodyLg'} color={soldOut ? 'tertiary' : 'primary'}>
          {option.label}
        </Text>
        <Text variant="numMeta" color={soldOut ? 'tertiary' : 'secondary'}>
          {soldOut
            ? 'none free'
            : `${option.bedsLeft} ${option.bedsLeft === 1 ? 'bed' : 'beds'} free`}
          {option.depositMonths ? ` · ${option.depositMonths} mo deposit` : ''}
        </Text>
      </View>

      <View style={styles.priceCol}>
        <Text variant="priceSm" color={soldOut ? 'tertiary' : 'primary'}>
          {formatRupees(option.pricePerPerson)}
        </Text>
        {/* The unit is repeated on every row. The header is not enough — a
            user scrolling a list reads one row, not the column head. */}
        <Text variant="numMeta" color="tertiary">
          per person / mo
        </Text>
        {/* The decision is comparative, so a cheaper option says how much
            cheaper rather than leaving the reader to subtract. */}
        {!soldOut && delta < 0 ? (
          <Text variant="numMeta" style={{ color: colors.success.ink }}>
            −{formatRupees(Math.abs(delta))}
          </Text>
        ) : null}
      </View>
    </View>
  );

  if (soldOut) {
    return (
      <View accessible accessibilityLabel={`${option.label}, none free, ${formatRupees(option.pricePerPerson)} per person per month`}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onSelect}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled: false }}
      accessibilityLabel={`${option.label}, ${formatRupees(option.pricePerPerson)} per person per month, ${option.bedsLeft} free`}
      style={{ minHeight: touch.min }}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
  priceCol: { alignItems: 'flex-end' },
  ring: {
    width: 22,
    height: 22,
    borderRadius: 999,
    borderWidth: 1.75,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: 11, height: 11, borderRadius: 999 },
});
