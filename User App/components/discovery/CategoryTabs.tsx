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
 * asserts an adjacency and a direction that moving from PG to Hotels does
 * not have.
 *
 * The monogram tile stays visible in both states. It is the category's
 * identity, not decoration awarded to the active one.
 */
export function CategoryTabs({ value, onChange, categories = CATEGORY_ORDER }: CategoryTabsProps) {
  const { space, layout, touch } = useTheme();

  return (
    /*
     * The host View is load bearing. It is not a wrapper for styling.
     *
     * This row is dropped straight into the feed's vertical scroll column, and
     * React Native's `ScrollView` ships `flexShrink: 1` in its own base style —
     * so a bare one is the single child of that column the layout is permitted
     * to squeeze. When the keyboard closes, the column is re-measured against a
     * bounded height, Yoga takes the shrink out of this row alone, and a 44pt
     * pill ends up in a 15pt box: the tabs are sliced off halfway down and the
     * search field below them rides up into the space that was taken away.
     *
     * A plain View defaults to `flexShrink: 0` in React Native (unlike the web,
     * where it is 1), so it absorbs that pressure and the rail keeps its height.
     * `FilterChipRow` directly below has never shown the bug for exactly this
     * reason — it happens to wrap its own rail in a View.
     *
     * `minHeight` is the second line of defence: even if something else in the
     * tree ever bounds this row, it cannot collapse past the height of the pill
     * it exists to show. It is a floor, not a cap, so a larger OS font setting
     * still grows the row normally.
     */
    <View style={[styles.host, { minHeight: touch.min }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole="tablist"
        accessibilityLabel="Stay type"
        /* Neither grows nor shrinks inside the host — its height is the pills'
           height and nothing is entitled to negotiate it. */
        style={styles.rail}
        contentContainerStyle={{
          paddingHorizontal: layout.gutter,
          gap: space[2],
          /* Centred rather than stretched: a pill that stretches to fill a
             taller row loses its own pill geometry. */
          alignItems: 'center',
        }}
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
    </View>
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
  host: { flexGrow: 0, flexShrink: 0, justifyContent: 'center' },
  rail: { flexGrow: 0, flexShrink: 0 },
  tab: { flexDirection: 'row', alignItems: 'center' },
  monogram: { minWidth: 30, height: 30, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  restLabel: { alignItems: 'flex-start', justifyContent: 'center' },
});
