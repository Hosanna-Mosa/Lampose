import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';

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
 * "Add +", then a − n + stepper once there is one in the cart.
 *
 * Still on purpose: no bounce on a tap, no pop on the count and no fade
 * between the two faces. With a dozen of these in a menu, each one pulsing on
 * every change read as the screen blinking. A light haptic is the
 * acknowledgement instead.
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

  const handleAdd = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    onChange(1);
  };

  const handleIncrement = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    onChange(Math.min(max, value + 1));
  };

  const handleDecrement = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    onChange(value - 1);
  };

  if (value === 0) {
    return (
      <Pressable
        onPress={handleAdd}
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
            shadowColor: '#000000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.05,
            shadowRadius: 3,
            elevation: 1,
          },
        ]}
      >
        <Text variant={size === 'lg' ? 'title2' : 'title3'} style={{ color: colors.textPrimary, fontWeight: '700' }}>
          Add +
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
        {
          width,
          height,
          borderRadius: radius.chip,
          backgroundColor: colors.graphite,
          borderColor: colors.graphite,
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.15,
          shadowRadius: 4,
          elevation: 2,
        },
      ]}
    >
      <Pressable
        onPress={handleDecrement}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={value === 1 ? `Remove ${accessibilityLabel}` : `One less ${accessibilityLabel}`}
        style={styles.stepButton}
      >
        <Text variant={glyph} style={{ color: colors.onGraphite, fontWeight: '700' }}>
          {value === 1 ? '×' : '−'}
        </Text>
      </Pressable>

      <Text
        variant={size === 'lg' ? 'priceMd' : 'numMeta'}
        style={{
          color: colors.onGraphite,
          fontWeight: '700',
          fontSize: size === 'lg' ? 18 : 14,
        }}
      >
        {value}
      </Text>

      <Pressable
        onPress={handleIncrement}
        hitSlop={10}
        disabled={value >= max}
        accessibilityRole="button"
        accessibilityLabel={`One more ${accessibilityLabel}`}
        style={styles.stepButton}
      >
        <Text
          variant={glyph}
          style={{
            color: value >= max ? colors.onGraphiteMuted : colors.onGraphite,
            fontWeight: '700',
          }}
        >
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
  stepper: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
  },
  stepButton: {
    minWidth: 22,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
