import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';
import type { Dish } from '@/types/food';
import { formatRupees } from '@/utils/money';

import { AddControl } from './AddControl';
import { DietMark, FoodPhoto } from './FoodMarks';

export type DishRowProps = {
  dish: Dish;
  /**
   * `feed` puts the photo on the left and names the kitchen — the reader does
   * not know where the dish came from. `menu` puts it on the right under the
   * Add control, because the kitchen is the screen they are already on.
   */
  layout?: 'feed' | 'menu';
  /** "Sri Sai Tiffins · 6 min walk" on the feed; the description on a menu. */
  meta?: string;
  qty: number;
  onQtyChange: (qty: number) => void;
  onPress?: () => void;
  /** Sold out, or the kitchen is shut — the row stays, the control explains. */
  disabled?: boolean;
  reason?: string;
};

/**
 * One dish, in a list.
 *
 * The scan axis is fixed and never varies between surfaces: the diet mark is
 * the first thing on the title line, the price is the last thing in the block,
 * and both are tabular. A student looking for veg runs a finger down the left
 * edge; a student looking for something under ₹100 runs it down the right. Any
 * row that reorders those two breaks both passes at once.
 */
export function DishRow({
  dish,
  layout = 'menu',
  meta,
  qty,
  onQtyChange,
  onPress,
  disabled,
  reason,
}: DishRowProps) {
  const { colors, space, radius } = useTheme();

  const soldOut = disabled || dish.soldOut;
  const soldOutReason = dish.soldOut ? 'Sold out' : reason;
  const ink = soldOut ? colors.textTertiary : colors.textPrimary;

  const title = (
    <View style={[styles.titleRow, { gap: space[1] + 2 }]}>
      <DietMark diet={dish.diet} size={13} />
      <Text variant="title3" numberOfLines={1} style={{ flex: 1, color: ink }}>
        {dish.name}
      </Text>
    </View>
  );

  const price = (
    <Text variant="priceLg" style={{ color: soldOut ? colors.textTertiary : colors.textPrimary }}>
      {formatRupees(dish.price)}
    </Text>
  );

  const control = (
    <AddControl
      value={qty}
      onChange={onQtyChange}
      disabled={soldOut}
      reason={soldOutReason}
      accessibilityLabel={dish.name}
    />
  );

  if (layout === 'feed') {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={dish.name}
        style={({ pressed }) => [
          styles.card,
          {
            borderRadius: radius.card,
            padding: space[2] + 2,
            gap: space[3],
            backgroundColor: pressed ? colors.surfaceSunken : colors.surface,
            borderColor: colors.border,
          },
        ]}
      >
        <FoodPhoto height={64} width={64} radius={radius.chip} uri={dish.photo} muted={soldOut} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          {title}
          {meta ? (
            <Text variant="caption" color="tertiary" numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
          <View style={[styles.priceRow, { marginTop: space[1] }]}>
            {price}
            {control}
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={dish.name}
      style={({ pressed }) => [
        styles.menuRow,
        { paddingVertical: space[3], gap: space[3], backgroundColor: pressed ? colors.surfaceSunken : 'transparent' },
      ]}
    >
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        {title}
        <Text variant="caption" color={soldOut ? 'tertiary' : 'secondary'} numberOfLines={2}>
          {meta ?? dish.description}
        </Text>
        <View style={{ marginTop: space[1] }}>{price}</View>
      </View>

      <View style={{ width: 88, gap: space[2], alignItems: 'center' }}>
        <FoodPhoto height={62} width={88} radius={radius.chip} uri={dish.photo} muted={soldOut} />
        {control}
      </View>
    </Pressable>
  );
}

/**
 * The rail tile — a dish in a horizontal carousel.
 *
 * No Add button. A 132pt tile cannot carry a price, a name, a kitchen AND a
 * control without one of them going below the readable floor, and the price is
 * not the thing to cut. Tapping opens the dish, where adding is a full-width
 * decision instead of a 30pt one.
 */
export function DishTile({ dish, kitchenName, onPress }: { dish: Dish; kitchenName: string; onPress: () => void }) {
  const { colors, space, radius } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${dish.name}, ${kitchenName}, ${formatRupees(dish.price)}`}
      style={({ pressed }) => [
        styles.tile,
        {
          borderRadius: radius.card,
          padding: space[2],
          gap: space[1],
          backgroundColor: pressed ? colors.surfaceSunken : colors.surface,
          borderColor: colors.border,
        },
      ]}
    >
      <FoodPhoto height={66} radius={radius.chip} uri={dish.photo} />
      <View style={[styles.titleRow, { gap: space[1] + 1, marginTop: space[1] }]}>
        <DietMark diet={dish.diet} size={11} />
        <Text variant="title3" numberOfLines={1} style={{ flex: 1 }}>
          {dish.name}
        </Text>
      </View>
      <Text variant="caption" color="tertiary" numberOfLines={1}>
        {kitchenName}
      </Text>
      <Text variant="priceLg" style={{ marginTop: 2 }}>
        {formatRupees(dish.price)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', borderWidth: StyleSheet.hairlineWidth },
  menuRow: { flexDirection: 'row' },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  priceRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  tile: { width: 140, borderWidth: StyleSheet.hairlineWidth },
});
