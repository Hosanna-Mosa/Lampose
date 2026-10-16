import React, { useEffect } from 'react';
import { StyleSheet, View, useWindowDimensions, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Button, Icon, Skeleton, Text, type IconName } from '@/components/ui';
import { useReduceMotion, useTheme } from '@/context/ThemeContext';

import { PHOTO_ASPECT } from './RestaurantListCard';

/* ------------------------------------------------------------------ *
 * Empty and error states
 * ------------------------------------------------------------------ */

export type FoodEmptyStateProps = {
  glyph?: IconName;
  title: string;
  /**
   * One sentence of what is possible RIGHT NOW — the window, the kitchen
   * count, the price. An empty screen that only says what is missing leaves a
   * student with nothing to do; one that says "lunch runs until 3:30 pm and six
   * kitchens near you are cooking" has already answered the next question.
   */
  body: string;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** `reward` is the logo's yellow, for an empty screen about coupons or
   *  offers — the colour those wear everywhere else in the app. */
  tone?: 'neutral' | 'problem' | 'reward';
  /** Error code, reference, timestamp — the line support will ask for. */
  footnote?: string;
};

/**
 * One template for every empty and error state in the module.
 *
 * Neutral by default, because most of these are not failures: a kitchen that
 * opens at 6:30 pm has not broken, and dressing it in red teaches a student to
 * ignore red.
 */
export function FoodEmptyState({
  glyph = 'food',
  title,
  body,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  tone = 'neutral',
  footnote,
}: FoodEmptyStateProps) {
  const { colors, space, layout, radius } = useTheme();
  const palette = tone === 'problem' ? colors.danger : tone === 'reward' ? colors.deal : colors.info;

  return (
    <View style={[styles.state, { padding: layout.gutter, gap: space[4] }]}>
      <View
        style={[
          styles.disc,
          { backgroundColor: palette.tint, borderColor: palette.border, borderRadius: radius.pill },
        ]}
      >
        <Icon name={glyph} size={26} color={palette.ink} />
      </View>

      <View style={{ gap: space[2], alignItems: 'center' }}>
        <Text variant="display2" style={styles.center}>
          {title}
        </Text>
        <Text variant="body" color="secondary" style={[styles.center, styles.measure]}>
          {body}
        </Text>
      </View>

      {/* Centred, not stretched: a stretched box capped at 320pt sits flush
          left on any screen wider than that. */}
      <View style={{ alignSelf: 'center', gap: space[2], maxWidth: 320, width: '100%', alignItems: 'stretch' }}>
        <Button label={primaryLabel} onPress={onPrimary} fullWidth />
        {secondaryLabel && onSecondary ? (
          <Button label={secondaryLabel} variant="secondary" onPress={onSecondary} fullWidth />
        ) : null}
      </View>

      {footnote ? (
        <Text variant="numMeta" color="tertiary" style={styles.center}>
          {footnote}
        </Text>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Skeletons
 * ------------------------------------------------------------------ */

/**
 * The slow fade every food skeleton breathes with — the stay feed's
 * `ListingFeedSkeleton` pulse, so the two modules wait the same way.
 */
function Breathing({ children, label, style }: { children: React.ReactNode; label: string; style?: ViewStyle }) {
  const reduceMotion = useReduceMotion();
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(pulse);
      pulse.value = 1;
      return undefined;
    }
    pulse.value = withRepeat(withTiming(0.55, { duration: 850, easing: Easing.inOut(Easing.quad) }), -1, true);
    return () => cancelAnimation(pulse);
  }, [reduceMotion, pulse]);

  const breathing = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View accessibilityRole="progressbar" accessibilityLabel={label} style={[style, breathing]}>
      {children}
    </Animated.View>
  );
}

/** One `RestaurantListCard` before it arrives: its photo at its ratio, its
 *  name and rating, its two caption lines. */
function RestaurantCardShape() {
  const { colors, space, radius, layout } = useTheme();
  const { width } = useWindowDimensions();
  const photoHeight = Math.round((width - layout.gutter * 2) / PHOTO_ASPECT);

  return (
    <View
      style={[
        styles.card,
        { borderRadius: radius.card, borderColor: colors.border, backgroundColor: colors.surface },
      ]}
    >
      <Skeleton height={photoHeight} radius={0} />
      <View style={{ padding: space[3], gap: space[2] }}>
        <View style={[styles.railRow, { alignItems: 'center', gap: space[2] }]}>
          <Skeleton width="58%" height={18} />
          <View style={{ flex: 1 }} />
          <Skeleton width={44} height={20} radius={radius.pill} />
        </View>
        <Skeleton width="36%" height={12} />
        <Skeleton width="48%" height={12} />
      </View>
    </View>
  );
}

/**
 * Restaurant cards still on their way — the first page under the real banner,
 * or the next page at the end of the feed.
 */
export function RestaurantCardSkeleton({ count = 2 }: { count?: number }) {
  const { space, layout } = useTheme();
  return (
    <Breathing label="Loading kitchens" style={{ paddingHorizontal: layout.gutter, gap: space[3] }}>
      {Array.from({ length: count }, (_, key) => (
        <RestaurantCardShape key={key} />
      ))}
    </Breathing>
  );
}

/** The cuisine rail's round chips, and the section header under them. */
export function CuisineRailSkeleton() {
  const { space, layout } = useTheme();
  return (
    <Breathing label="Loading cuisines" style={{ paddingHorizontal: layout.gutter, gap: space[4] }}>
      <View style={[styles.railRow, { justifyContent: 'space-between', paddingTop: space[2] }]}>
        {[0, 1, 2, 3, 4].map((chip) => (
          <View key={chip} style={{ alignItems: 'center', gap: space[2] }}>
            <Skeleton width={56} height={56} radius={28} />
            <Skeleton width={44} height={10} />
          </View>
        ))}
      </View>
      <View style={[styles.railRow, { justifyContent: 'space-between' }]}>
        <Skeleton width="48%" height={16} />
        <Skeleton width="22%" height={12} />
      </View>
    </Breathing>
  );
}

/**
 * The feed's loading shape, for the places that cannot draw the real banner
 * above it (Dine-in, and the frame before the food module is built).
 *
 * It is the real layout at the real sizes, not a generic stack of bars: the
 * same full-width cards `RestaurantListCard` draws. A skeleton whose geometry
 * differs from what arrives produces a visible jump on every load, which is
 * worse than a spinner because it happens after the wait rather than during it.
 */
export function FoodFeedSkeleton() {
  const { space } = useTheme();

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ gap: space[4], paddingTop: space[2] }}
    >
      <CuisineRailSkeleton />
      <RestaurantCardSkeleton count={2} />
    </View>
  );
}

/** The kitchen menu's loading shape — text column left, tile and control right. */
export function FoodMenuSkeleton() {
  const { space, layout, radius } = useTheme();

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ paddingHorizontal: layout.gutter, gap: space[4], paddingTop: space[3] }}
    >
      <View style={{ gap: space[2] }}>
        <Skeleton width="56%" height={15} />
        <Skeleton width="74%" height={10} />
      </View>
      <View style={[styles.railRow, { gap: space[2] }]}>
        <Skeleton height={52} radius={radius.button} style={{ flex: 1 }} />
        <Skeleton height={52} radius={radius.button} style={{ flex: 1 }} />
      </View>
      {[0, 1, 2].map((row) => (
        <View key={row} style={[styles.skeletonCard, { gap: space[3] }]}>
          <View style={{ flex: 1, gap: space[2] }}>
            <Skeleton width="62%" height={13} />
            <Skeleton width="92%" height={10} />
            <Skeleton width="40%" height={16} />
          </View>
          <View style={{ width: 88, gap: space[2] }}>
            <Skeleton height={62} radius={radius.chip} />
            <Skeleton height={34} radius={radius.chip} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  state: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  disc: { width: 68, height: 68, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  center: { textAlign: 'center' },
  measure: { maxWidth: 300 },
  railRow: { flexDirection: 'row' },
  skeletonCard: { flexDirection: 'row' },
  card: { overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
});
