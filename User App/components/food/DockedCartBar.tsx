import React from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';
import { formatRupees } from '@/utils/money';

export type DockedCartBarProps = {
  count: number;
  total: number;
  /** "Lunch · Block C · Room 214" — the window and the target, always both. */
  context: string;
  label?: string;
  onPress: () => void;
  /** Reports its own height so the screen above can clear it. */
  onMeasure?: (height: number) => void;
};

/**
 * The cart, docked.
 *
 * Two facts and one action, and the second line is not optional: a bar that
 * says "2 items · ₹210" without saying *lunch* and *Room 214* is a bar a
 * student will tap at 4 pm expecting the lunch they built at 3, or expecting it
 * to arrive at a room they moved out of. The window and the target are what
 * make the number true.
 *
 * It is `graphite` for the same reason the primary CTA is: this is the app's
 * one committing action on the screen, and the inverted surface is how that is
 * said everywhere else in the product.
 */
export function DockedCartBar({ count, total, context, label = 'View cart', onPress, onMeasure }: DockedCartBarProps) {
  const { colors, space, layout, radius } = useTheme();

  const measure = (event: LayoutChangeEvent) => onMeasure?.(event.nativeEvent.layout.height);

  return (
    <View onLayout={measure} style={{ paddingHorizontal: layout.gutter, paddingBottom: space[2] }}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${label}. ${count} ${count === 1 ? 'item' : 'items'}, ${formatRupees(total)}. ${context}`}
        style={({ pressed }) => [
          styles.bar,
          {
            backgroundColor: pressed ? colors.graphiteRaised : colors.graphite,
            borderRadius: radius.button,
            paddingLeft: space[4],
            paddingRight: space[3],
            paddingVertical: space[3] - 1,
            gap: space[3],
          },
        ]}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="priceMd" style={{ color: colors.onGraphite }}>
            {count} {count === 1 ? 'item' : 'items'} · {formatRupees(total)}
          </Text>
          <Text variant="caption" style={{ color: colors.onGraphiteMuted, marginTop: 2 }} numberOfLines={1}>
            {context}
          </Text>
        </View>

        <View
          style={[
            styles.action,
            { backgroundColor: colors.onGraphite, borderRadius: radius.chip, paddingHorizontal: space[3] },
          ]}
        >
          <Text variant="title3" style={{ color: colors.graphite }}>
            {label}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', minHeight: 56 },
  action: { minHeight: 36, alignItems: 'center', justifyContent: 'center' },
});
