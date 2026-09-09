import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';
import type { Dish } from '@/types/food';
import { formatRupees } from '@/utils/money';

import { AddControl } from './AddControl';
import { FavouriteHeart } from './FavouriteHeart';
import { DietMark, FoodPhoto } from './FoodMarks';

/** The menu photograph, square, and how far the Add control hangs below it. */
const MENU_PHOTO = 112;
const ADD_OVERLAP = 16;

/**
 * Orders in the block before a dish is called highly reordered.
 *
 * A threshold, not a ranking: "highly reordered" has to mean something a
 * diner can trust, and the top three dishes of a kitchen nobody orders from
 * are not that. A dish under the bar simply carries no mark.
 */
const REORDER_MARK = 12;

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
  /**
   * Show the favourite heart.
   *
   * Opt-in rather than always-on: this row is also used inside the cart,
   * where a heart is meaningless — removing a line there is what taking the
   * quantity to zero already does.
   */
  favouritable?: boolean;
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
  favouritable = false,
}: DishRowProps) {
  const { colors, space, radius } = useTheme();

  const soldOut = disabled || dish.soldOut;
  const soldOutReason = dish.soldOut ? 'Sold out' : reason;
  const ink = soldOut ? colors.textTertiary : colors.textPrimary;

  /* The diet mark stays first and the name keeps `flex: 1`, so the scan axis
     the header describes is unchanged — the heart is appended after the name
     rather than inserted into the run of it. */
  /*
   * The heart sits on the TITLE line, not beside the Add control.
   *
   * Two reasons. It belongs with the identity of the dish rather than with the
   * transaction, and a student scanning a menu reads the title line — putting
   * it next to Add would also put a one-tap save a few pixels from a one-tap
   * purchase, and the mis-tap there costs money.
   *
   * A sold-out dish still gets one: "I want this when it is back" is exactly
   * what a favourite is for, and it is the only useful thing left to do on
   * that row.
   */
  const heart = favouritable ? (
    <FavouriteHeart kind="dish" id={dish.id} label={dish.name} size={16} />
  ) : null;

  const title = (
    <View style={[styles.titleRow, { gap: space[1] + 2 }]}>
      <DietMark diet={dish.diet} size={13} />
      <Text variant="title3" numberOfLines={1} style={{ flex: 1, color: ink }}>
        {dish.name}
      </Text>
      {heart}
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

  /*
   * The menu row, in the shape the reference listing uses.
   *
   * The reading order changed: the diet mark now sits on its OWN line above
   * the name rather than inline with it. On a menu the mark is a filter
   * result — "this is the veg one" — and a student scanning for it wants it
   * in a column they can run an eye down, not embedded at the head of a
   * different-length title each time.
   *
   * The photograph grew and squared off, and the Add control now overlaps
   * its lower edge instead of sitting under it. That is not only styling:
   * it buys back the vertical space the control used to cost every row,
   * which is what lets the description have its two lines AND the row still
   * be shorter than it was.
   */
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
        <DietMark diet={dish.diet} size={16} />

        <View style={[styles.titleRow, { gap: space[1] + 2 }]}>
          <Text variant="title2" numberOfLines={2} style={{ flex: 1, color: ink }}>
            {dish.name}
          </Text>
          {heart}
        </View>

        {/* Real, and derived: `ordersInBlock` is a count this kitchen's own
            orders produced. It is not a badge invented to fill the slot the
            reference puts a discount in — a dish nobody has ordered simply
            does not carry it. */}
        {!soldOut && (dish.ordersInBlock ?? 0) >= REORDER_MARK ? (
          <View style={[styles.reorder, { gap: space[1] + 2 }]}>
            <View style={[styles.reorderBar, { backgroundColor: colors.success.base }]} />
            <Text variant="numMeta" style={{ color: colors.success.ink }}>
              Highly reordered
            </Text>
          </View>
        ) : null}

        <View style={{ marginTop: space[1] }}>{price}</View>

        <Text variant="caption" color={soldOut ? 'tertiary' : 'secondary'} numberOfLines={2}>
          {meta ?? dish.description}
        </Text>
      </View>

      {/* The control hangs off the bottom of the photo, so the well reserves
          half of it below the image rather than a full row of its own. */}
      <View style={{ width: MENU_PHOTO, paddingBottom: ADD_OVERLAP }}>
        <FoodPhoto
          height={MENU_PHOTO}
          width={MENU_PHOTO}
          radius={radius.card}
          uri={dish.photo}
          muted={soldOut}
        />
        <View style={[styles.menuAdd, { bottom: -ADD_OVERLAP }]}>{control}</View>
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
  /* Centred on the photo's lower edge, hanging half below it. */
  menuAdd: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  reorder: { flexDirection: 'row', alignItems: 'center' },
  reorderBar: { width: 22, height: 4, borderRadius: 2 },
  priceRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  tile: { width: 140, borderWidth: StyleSheet.hairlineWidth },
});
