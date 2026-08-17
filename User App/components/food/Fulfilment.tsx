import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';
import type { FoodAddress, Fulfilment as FulfilmentMode, Kitchen } from '@/types/food';
import { formatRupees } from '@/utils/money';

/* ------------------------------------------------------------------ *
 * Deliver / pick up
 * ------------------------------------------------------------------ */

export type FulfilmentToggleProps = {
  value: FulfilmentMode;
  onChange: (value: FulfilmentMode) => void;
  kitchen: Kitchen;
  /** Already-formatted ready and arrival times, from the kitchen's own clock. */
  readyAt: string;
  arrivesAt: string;
  deliveryFee: number;
  /** After the gate shuts, delivery to the room is not on offer. */
  deliveryDisabled?: boolean;
  deliveryDisabledNote?: string;
  /** `card` is the two-card pair; `compact` is the header-sized pair. */
  size?: 'card' | 'compact';
};

/**
 * Deliver to your room, or pick it up. Two peers, never a default with a
 * footnote.
 *
 * Pickup is the module's one genuine saving — ₹9 to ₹12 a meal, which on two
 * meals a day is most of a week's chai budget — and it only reads as a saving
 * if it is shown at the same size as delivery with its real cost and its real
 * time. Buried in a settings screen it would be chosen by nobody; shown as a
 * peer with "Free" on it, it is chosen by students who are walking past the
 * kitchen anyway.
 *
 * Both halves always state a time. "Free" alone is not a comparison — nine
 * minutes of walking is the other half of the price.
 */
export function FulfilmentToggle({
  value,
  onChange,
  kitchen,
  readyAt,
  arrivesAt,
  deliveryFee,
  deliveryDisabled,
  deliveryDisabledNote,
  size = 'card',
}: FulfilmentToggleProps) {
  const { colors, space, radius } = useTheme();

  const option = (
    mode: FulfilmentMode,
    title: string,
    line: string,
    trailing: string,
    disabled?: boolean,
    note?: string,
  ) => {
    const selected = value === mode && !disabled;
    return (
      <Pressable
        key={mode}
        onPress={disabled ? undefined : () => onChange(mode)}
        accessibilityRole="radio"
        accessibilityState={{ selected, disabled: !!disabled }}
        accessibilityLabel={`${title}. ${line}. ${trailing}`}
        style={[
          styles.option,
          {
            borderRadius: radius.button,
            padding: size === 'card' ? space[3] : space[2] + 2,
            gap: 2,
            backgroundColor: disabled ? colors.surfaceRaised : colors.surface,
            borderColor: selected ? colors.brand : disabled ? colors.borderSubtle : colors.border,
            borderWidth: selected ? 1.5 : StyleSheet.hairlineWidth,
          },
        ]}
      >
        <View style={styles.optionHead}>
          <Text
            variant="title3"
            numberOfLines={1}
            style={{ flex: 1, color: disabled ? colors.textTertiary : colors.textPrimary }}
          >
            {title}
          </Text>
          <Text
            variant="priceSm"
            style={{ color: trailing === 'Free' ? colors.brandInk : disabled ? colors.textTertiary : colors.textSecondary }}
          >
            {trailing}
          </Text>
        </View>
        <Text variant="numMeta" color="tertiary" numberOfLines={1}>
          {line}
        </Text>
        {note ? (
          <Text variant="caption" color="tertiary" numberOfLines={2} style={{ marginTop: space[1] }}>
            {note}
          </Text>
        ) : null}
      </Pressable>
    );
  };

  return (
    <View accessibilityRole="radiogroup" style={[styles.pair, { gap: space[2] }]}>
      {option(
        'delivery',
        'Deliver to my room',
        deliveryDisabled ? 'Not available now' : `Arrives about ${arrivesAt}`,
        deliveryFee === 0 ? 'Free' : formatRupees(deliveryFee),
        deliveryDisabled,
        deliveryDisabled ? deliveryDisabledNote : undefined,
      )}
      {option(
        'pickup',
        'Pick up at the counter',
        `${kitchen.walkMinutes} min walk · ready about ${readyAt}`,
        'Free',
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Where it goes
 * ------------------------------------------------------------------ */

/**
 * The delivery target, stated on every surface that can lead to an order.
 *
 * Food is the one part of LAMPOSE that knows exactly which door to knock on,
 * because the stay booking already told it. That is the module's whole
 * advantage over a generic delivery app, and an advantage nobody can see is
 * not one — so the room is on the feed, on the cart and on the checkout, in
 * the same words each time.
 */
export function RoomTargetRow({
  address,
  fulfilment,
  onChange,
  onPress,
}: {
  address: FoodAddress;
  fulfilment?: FulfilmentMode;
  onChange?: (value: FulfilmentMode) => void;
  onPress?: () => void;
}) {
  const { colors, space, radius } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`Delivering to ${address.title}`}
      style={[
        styles.targetRow,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: radius.card,
          padding: space[3],
          gap: space[3],
        },
      ]}
    >
      <View
        style={[
          styles.targetMark,
          { backgroundColor: colors.brandTint, borderRadius: radius.chip },
        ]}
      >
        <Icon name="mapPin" size={16} color={colors.brandInk} />
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="title3" numberOfLines={1}>
          {address.title}
        </Text>
        <Text variant="caption" color="tertiary" numberOfLines={1}>
          {address.detail}
        </Text>
      </View>

      {fulfilment && onChange ? (
        <View style={[styles.miniToggle, { backgroundColor: colors.surfaceSunken, borderRadius: radius.chip }]}>
          {(['delivery', 'pickup'] as const).map((mode) => {
            const active = fulfilment === mode;
            return (
              <Pressable
                key={mode}
                onPress={() => onChange(mode)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[
                  styles.miniSegment,
                  { borderRadius: radius.chip - 2, backgroundColor: active ? colors.graphite : 'transparent' },
                ]}
              >
                <Text
                  variant="label"
                  style={{ color: active ? colors.onGraphite : colors.textSecondary, letterSpacing: 0.3 }}
                >
                  {mode === 'delivery' ? 'Deliver' : 'Pickup'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : onPress ? (
        <Text variant="bodyStrong" style={{ color: colors.brandInk }}>
          Change
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pair: { flexDirection: 'row' },
  option: { flex: 1, minWidth: 0, minHeight: 44 },
  optionHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  targetRow: { flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth },
  targetMark: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  miniToggle: { flexDirection: 'row', padding: 2 },
  miniSegment: { paddingHorizontal: 10, paddingVertical: 7, minHeight: 30, justifyContent: 'center' },
});
