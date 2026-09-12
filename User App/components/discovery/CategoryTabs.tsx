import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import * as Haptics from 'expo-haptics';
import { Icon, Text, type IconName } from '@/components/ui';
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
 * The same four, as the Explore hero's pill row says them.
 *
 * Plural and spelled out, because a pill row is read as a shelf of things to
 * browse ("Bachelor Rooms") rather than as a type to classify a listing by
 * ("Bachelor"). `CATEGORY_LABEL` stays the singular, classifying form: it is
 * pluralised in sentence copy (`${CATEGORY_LABEL[c].toLowerCase()}s`) and
 * reused as a heading in the filter sheet, and neither of those survives a
 * label that is already plural.
 *
 * The slash forms are spelled with "&". A slash inside a pill reads as a
 * divider between two pills at a glance, which is exactly the thing a row of
 * pills must not be ambiguous about.
 */
export const CATEGORY_CHIP_LABEL: Record<StayCategory, string> = {
  PG_HOSTEL: 'PGs & Hostels',
  BACHELOR: 'Bachelor Rooms',
  COLIVE: 'Houses',
  HOTEL: 'Hotels',
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
  /**
   * `airbnb` displays modern Airbnb-style pill tabs with category icons, spring bounce, and active indicators.
   * `mark` carries each category's monogram tile in its own taxonomy colour.
   * `plain` drops both: a bare pill, and the ONE accent fill marks the selected one.
   */
  variant?: 'mark' | 'plain' | 'airbnb';
  /** Extra room at the ends of the rail, over the screen gutter. */
  contentInset?: number;
};

const CATEGORY_ICON_MAP: Record<StayCategory, IconName> = {
  PG_HOSTEL: 'sharing',
  BACHELOR: 'home',
  COLIVE: 'houseIcon',
  HOTEL: 'calendar',
};

/**
 * The category row.
 *
 * Modernized with Airbnb-style icon pills, spring physics, and tactile haptic feedback.
 */
export function CategoryTabs({
  value,
  onChange,
  categories = CATEGORY_ORDER,
  variant = 'airbnb',
  contentInset = 0,
}: CategoryTabsProps) {
  const { space, layout, touch } = useTheme();

  return (
    <View style={[styles.host, { minHeight: touch.min }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole="tablist"
        accessibilityLabel="Stay type"
        style={styles.rail}
        contentContainerStyle={{
          paddingHorizontal: layout.gutter + contentInset,
          gap: space[2],
          alignItems: 'center',
        }}
      >
        {categories.map((category) => (
          <CategoryTab
            key={category}
            category={category}
            active={category === value}
            variant={variant}
            onPress={() => {
              try {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              } catch {}
              onChange(category);
            }}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function CategoryTab({
  category,
  active,
  variant,
  onPress,
}: {
  category: StayCategory;
  active: boolean;
  variant: 'mark' | 'plain' | 'airbnb';
  onPress: () => void;
}) {
  const { colors, space, radius, mode, touch } = useTheme();
  const { animatedStyle, onPressIn, onPressOut } = usePressAnimation('chip');
  const set = colors.category[category];
  const isAirbnb = variant === 'airbnb';
  const plain = variant === 'plain';

  const label = isAirbnb || plain ? CATEGORY_CHIP_LABEL[category] : CATEGORY_LABEL[category];
  const iconName = CATEGORY_ICON_MAP[category];

  const scale = useSharedValue(active ? 1.02 : 1);

  React.useEffect(() => {
    scale.value = withSpring(active ? 1.04 : 1, { damping: 14, stiffness: 220 });
  }, [active, scale]);

  const progress = useDerivedValue(() => withTiming(active ? 1 : 0, CROSSFADE), [active]);

  const activeSurface = isAirbnb
    ? mode === 'dark' ? '#0F4C3A' : '#0B473A'
    : plain ? colors.brand : set.tint;
  const activeEdge = isAirbnb
    ? mode === 'dark' ? '#0F4C3A' : '#0B473A'
    : plain ? colors.brand : set.mark;
  const activeInk = isAirbnb
    ? '#FFFFFF'
    : plain ? colors.onBrand : set.ink;
  const restInk = isAirbnb ? (mode === 'dark' ? '#E2E8F0' : '#1E293B') : plain ? colors.textPrimary : colors.textSecondary;

  const surfaceStyle = useAnimatedStyle(
    () => ({
      backgroundColor: interpolateColor(
        progress.value,
        [0, 1],
        [isAirbnb ? colors.surface : colors.surface, activeSurface]
      ),
      borderColor: interpolateColor(
        progress.value,
        [0, 1],
        [isAirbnb ? colors.borderSubtle : colors.border, activeEdge]
      ),
      borderWidth: StyleSheet.hairlineWidth,
      transform: [{ scale: scale.value }],
    }),
    [colors, activeSurface, activeEdge, isAirbnb]
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
      accessibilityLabel={label}
      accessibilityHint={CATEGORY_BLURB[category]}
    >
      <Animated.View
        style={[
          styles.tab,
          animatedStyle,
          surfaceStyle,
          {
            minHeight: isAirbnb ? 40 : touch.min,
            borderRadius: radius.pill,
            paddingLeft: isAirbnb ? space[3] + 2 : plain ? space[4] + 2 : space[1] + 2,
            paddingRight: isAirbnb ? space[3] + 4 : plain ? space[4] + 2 : space[4],
            paddingVertical: isAirbnb ? 8 : 0,
            gap: isAirbnb ? 6 : plain ? 0 : space[2],
            shadowColor: '#000000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: active && isAirbnb ? 0.12 : 0,
            shadowRadius: 6,
            elevation: active && isAirbnb ? 2 : 0,
          },
        ]}
      >
        {isAirbnb ? (
          <Icon
            name={iconName}
            size={16}
            color={active ? activeInk : (mode === 'dark' ? '#94A3B8' : '#1E293B')}
          />
        ) : plain ? null : (
          <View style={[styles.monogram, { backgroundColor: set.mark, borderRadius: radius.chip }]}>
            <Text variant="label" style={{ color: colors.onBrand, letterSpacing: 0 }}>
              {set.code}
            </Text>
          </View>
        )}

        <Text
          style={{
            color: active ? activeInk : restInk,
            fontWeight: active ? '700' : '500',
            fontSize: 13,
            letterSpacing: 0.1,
          }}
        >
          {label}
        </Text>
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

