import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';
import type { Kitchen, MealWindow } from '@/types/food';
import { clockLabel, minutesUntilClose } from '@/types/food';
import { formatRupees } from '@/utils/money';

import { FoodPhoto, RatingPill } from './FoodMarks';

export type KitchenCardProps = {
  kitchen: Kitchen;
  /** The area the student picked on the entry screen — never the kitchen's. */
  locality: string;
  window: MealWindow;
  now: Date;
  open: boolean;
  /** When closed, the window it next cooks — the card must say when to come back. */
  reopensAt?: string;
  onPress: () => void;
};

/**
 * A kitchen in the feed.
 *
 * Closed kitchens are NOT hidden. At 4 pm most of a student's list is shut, and
 * a feed that drops them looks like a product with two kitchens in it rather
 * than a product with fourteen, three of which are cooking. So a closed kitchen
 * keeps its card, loses its colour, and gains the one fact that makes it worth
 * seeing: the time it opens.
 *
 * The fee row is always three facts in the same order — pickup, delivery,
 * minimum — because that is the row a student compares across cards, and a row
 * that reorders itself cannot be compared at all.
 */
export function KitchenCard({ kitchen, locality, window, now, open, reopensAt, onPress }: KitchenCardProps) {
  const { colors, space, radius } = useTheme();

  const closesIn = open ? minutesUntilClose(window, now) : null;
  const closingSoon = closesIn !== null && closesIn <= 30;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${kitchen.name}, ${kitchen.cuisine}, ${open ? 'open now' : `opens ${reopensAt ?? 'later'}`}`}
      style={({ pressed }) => [
        styles.card,
        {
          borderRadius: radius.card,
          padding: space[2] + 2,
          gap: space[3],
          backgroundColor: open ? (pressed ? colors.surfaceSunken : colors.surface) : colors.surfaceRaised,
          borderColor: open ? colors.border : colors.borderSubtle,
        },
      ]}
    >
      <FoodPhoto height={56} width={56} radius={radius.chip} uri={kitchen.photo} muted={!open} />

      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={styles.titleRow}>
          <Text
            variant="title2"
            numberOfLines={1}
            style={{ flex: 1, color: open ? colors.textPrimary : colors.textTertiary }}
          >
            {kitchen.name}
          </Text>
          {open ? (
            <RatingPill rating={kitchen.rating} count={kitchen.ratingCount} />
          ) : (
            <View
              style={[
                styles.closedTag,
                { backgroundColor: colors.surfaceSunken, borderRadius: radius.chip, paddingHorizontal: space[2] },
              ]}
            >
              <Text variant="numMeta" color="secondary">
                {reopensAt ? `Opens ${reopensAt}` : 'Closed'}
              </Text>
            </View>
          )}
        </View>

        <Text variant="caption" color="tertiary" numberOfLines={1}>
          {kitchen.cuisine} · {locality} · {kitchen.walkMinutes} min walk
        </Text>

        {open ? (
          <View style={[styles.feeRow, { gap: space[2], marginTop: space[1] }]}>
            <View
              style={[
                styles.feeChip,
                { backgroundColor: colors.brandTint, borderRadius: radius.chip, paddingHorizontal: space[2] - 2 },
              ]}
            >
              <Text variant="numMeta" style={{ color: colors.brandInk }}>
                Free pickup
              </Text>
            </View>
            <Text variant="numMeta" color="tertiary" numberOfLines={1} style={{ flex: 1 }}>
              {kitchen.deliveryFee === 0 ? 'Free delivery' : `${formatRupees(kitchen.deliveryFee)} delivery`} · min{' '}
              {formatRupees(kitchen.minOrder)}
            </Text>
          </View>
        ) : (
          <Text variant="numMeta" color="tertiary" numberOfLines={1} style={{ marginTop: space[1] }}>
            Cooks {kitchen.windows.length === 1 ? 'one window' : `${kitchen.windows.length} windows`} · min{' '}
            {formatRupees(kitchen.minOrder)}
          </Text>
        )}

        {closingSoon ? (
          <Text variant="numMeta" style={{ color: colors.warning.ink, marginTop: space[1] }}>
            Closing at {clockLabel(window.endMinute)} · {closesIn} min left
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', borderWidth: StyleSheet.hairlineWidth },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  closedTag: { paddingVertical: 3 },
  feeRow: { flexDirection: 'row', alignItems: 'center' },
  feeChip: { paddingVertical: 3 },
});
