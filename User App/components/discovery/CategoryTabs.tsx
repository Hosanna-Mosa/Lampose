import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from 'react-native-reanimated';

import { Text } from '@/components/ui';
import { easing } from '@/constants/motion';
import { usePressAnimation } from '@/hooks/usePressAnimation';
import { useTheme } from '@/context/ThemeContext';
import type { StayCategory } from '@/constants/tokens';

export const CATEGORY_ORDER: readonly StayCategory[] = [
  'PG_HOSTEL',
  'BACHELOR',
  'COLIVE',
  'HOTEL',
];

export const CATEGORY_LABEL: Record<StayCategory, string> = {
  // PG and hostel merged: students use the words interchangeably, and the
  // decision facts — meals, sharing, gate timing — are the same for both.
  PG_HOSTEL: 'PG / Hostel',
  BACHELOR: 'Bachelor',
  COLIVE: 'House / Co-live',
  HOTEL: 'Hotel',
};

/**
 * What each category leads with.
 *
 * This is not marketing copy — it is the promise the card below then keeps.
 * A PG card promotes meals and gate timing; a hotel card promotes tonight.
 */
export const CATEGORY_BLURB: Record<StayCategory, string> = {
  PG_HOSTEL: 'Meals, gate timing and how many share your room.',
  BACHELOR: 'The deposit, the notice period, and a place of your own.',
  COLIVE: 'A whole house or a room in one, shared with people like you.',
  HOTEL: 'Per-night price, rooms free tonight, and the minimum stay.',
};

/**
 * The same fact, short enough for a 2x2 tile.
 *
 * Each one keeps the *distinguishing* fact rather than the most appealing one,
 * because a first-time renter often does not know how a co-live differs from a
 * PG and this is where they find out. The long form above is still the
 * accessibility hint, so a screen reader gets the fuller sentence.
 */
export const CATEGORY_TILE_BLURB: Record<StayCategory, string> = {
  PG_HOSTEL: 'Meals and a gate timing',
  BACHELOR: 'A place of your own',
  COLIVE: 'Shared house, own room',
  HOTEL: 'Per night, short stays',
};

const CROSSFADE = { duration: 160, easing: easing.standard };

export type CategoryTabsProps = {
  value: StayCategory;
  onChange: (category: StayCategory) => void;
  categories?: readonly StayCategory[];
};

/**
 * The category row.
 *
 * There is no travelling indicator, for the same reason the tab bar has none:
 * the four categories are peers, not points on a line, and a sliding pill
 * asserts an adjacency and a direction that moving from PG to Dormitory does
 * not have.
 *
 * The monogram tile stays visible in both states. It is the category's
 * identity, not decoration awarded to the active one.
 */
export function CategoryTabs({ value, onChange, categories = CATEGORY_ORDER }: CategoryTabsProps) {
  const { space, layout } = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="tablist"
      accessibilityLabel="Stay type"
      contentContainerStyle={{ paddingHorizontal: layout.gutter, gap: space[2] }}
    >
      {categories.map((category) => (
        <CategoryTab
          key={category}
          category={category}
          active={category === value}
          onPress={() => onChange(category)}
        />
      ))}
    </ScrollView>
  );
}

function CategoryTab({
  category,
  active,
  onPress,
}: {
  category: StayCategory;
  active: boolean;
  onPress: () => void;
}) {
  const { colors, space, radius, touch } = useTheme();
  const { animatedStyle, onPressIn, onPressOut } = usePressAnimation('chip');
  const set = colors.category[category];

  const progress = useDerivedValue(() => withTiming(active ? 1 : 0, CROSSFADE), [active]);

  // Background and border cross to the category's own tint and solid. Both are
  // colour, so both survive reduced motion.
  const surfaceStyle = useAnimatedStyle(
    () => ({
      backgroundColor: interpolateColor(progress.value, [0, 1], [colors.surface, set.tint]),
      borderColor: interpolateColor(progress.value, [0, 1], [colors.border, set.mark]),
      borderWidth: active ? 1.5 : 1,
    }),
    [colors, set, active],
  );

  const strongStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const restStyle = useAnimatedStyle(() => ({ opacity: 1 - progress.value }));

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={CATEGORY_LABEL[category]}
      accessibilityHint={CATEGORY_BLURB[category]}
    >
      <Animated.View
        style={[
          styles.tab,
          animatedStyle,
          surfaceStyle,
          {
            minHeight: touch.min,
            borderRadius: radius.pill,
            paddingLeft: space[1] + 2,
            paddingRight: space[4],
            gap: space[2],
          },
        ]}
      >
        <View style={[styles.monogram, { backgroundColor: set.mark, borderRadius: radius.chip }]}>
          <Text variant="label" style={{ color: colors.onBrand, letterSpacing: 0 }}>
            {set.code}
          </Text>
        </View>

        {/* Two overlaid label nodes rather than an animated fontWeight, which
            React Native cannot interpolate. The 600 copy defines the layout
            box, so the row does not reflow when the selection moves.

            BOTH COPIES MUST BE THE SAME SIZE. The resting copy was `bodyLg`
            (15pt) sitting in a box measured by `bodyStrong` (13.5pt), so the
            visible label was wider than the box holding it and got clipped —
            "Bachelor" rendered as "Bachelo". This pair crossfades WEIGHT and
            nothing else; a size difference here is always a bug. */}
        <View>
          <Animated.View style={strongStyle}>
            <Text variant="bodyStrong" style={{ color: active ? set.ink : colors.textPrimary }}>
              {CATEGORY_LABEL[category]}
            </Text>
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, styles.restLabel, restStyle]}>
            <Text variant="body" color="secondary">
              {CATEGORY_LABEL[category]}
            </Text>
          </Animated.View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tab: { flexDirection: 'row', alignItems: 'center' },
  monogram: { minWidth: 30, height: 30, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  restLabel: { alignItems: 'flex-start', justifyContent: 'center' },
});
