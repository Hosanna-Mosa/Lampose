import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { Text } from './Text';
import { easing } from '@/constants/motion';
import { clocks } from '@/constants/tokens';
import { useReduceMotion, useTheme } from '@/context/ThemeContext';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/* ------------------------------------------------------------------ *
 * Spinner
 * ------------------------------------------------------------------ */

export type SpinnerProps = { size?: 'small' | 'large'; color?: string; label?: string };

/**
 * Only where the layout is unknowable: inside a button, on pull-to-refresh, on
 * a retry. Everywhere the shape of the result is already known, a skeleton
 * tells the user more.
 *
 * Under reduced motion the ring stops and the word "Loading" carries it — an
 * indefinite spin is movement with no information in it.
 */
export function Spinner({ size = 'small', color, label }: SpinnerProps) {
  const { colors, space } = useTheme();
  const reduceMotion = useReduceMotion();
  const tint = color ?? colors.brand;

  if (reduceMotion) {
    return (
      <View style={[styles.row, { gap: space[2] }]}>
        <View style={[styles.staticRing, { borderColor: colors.border, borderTopColor: tint }]} />
        <Text variant="caption" color="secondary">
          {label ?? 'Loading'}
        </Text>
      </View>
    );
  }

  return <ActivityIndicator size={size} color={tint} accessibilityLabel={label ?? 'Loading'} />;
}

/* ------------------------------------------------------------------ *
 * Progress bar
 * ------------------------------------------------------------------ */

export type ProgressBarProps = { label: string; progress: number };

/**
 * Determinate whenever a byte count exists. The width eases to each new value
 * rather than tweening linearly to 100%, so a stalled upload looks stalled.
 */
export function ProgressBar({ label, progress }: ProgressBarProps) {
  const { colors, space, radius } = useTheme();
  const clamped = Math.max(0, Math.min(1, progress));

  return (
    <View style={{ gap: space[2] }}>
      <View style={styles.labelRow}>
        <Text variant="bodyStrong" style={styles.flexLabel}>
          {label}
        </Text>
        <Text variant="numMeta" color="secondary">
          {Math.round(clamped * 100)}%
        </Text>
      </View>
      <View
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
        style={[styles.progressTrack, { backgroundColor: colors.surfaceSunken, borderRadius: radius.pill }]}
      >
        <View
          style={[
            styles.progressFill,
            { width: `${clamped * 100}%`, backgroundColor: colors.brand, borderRadius: radius.pill },
          ]}
        />
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Skeletons
 * ------------------------------------------------------------------ */

export type SkeletonProps = { width?: number | `${number}%`; height?: number; radius?: number; style?: ViewStyle };

/**
 * A plain block, with no shimmer.
 *
 * The shimmer was cut by the Batch 12 audit: the skeleton's shape already says
 * "content is coming, and this is its layout", and a continuous highlight
 * sweeping a scrolling list is the single most common cause of jank on the
 * mid-range Android hardware this app targets.
 *
 * The radius must match the real element it stands in for, or the reveal jumps.
 *
 * The fill is one step LIGHTER than the surface in dark mode, not darker:
 * `surfaceSunken` there is #0A0B0C, below the page itself, so a block drawn in
 * it read as a hole punched through the card rather than content arriving.
 */
export function Skeleton({ width = '100%', height = 12, radius: r, style }: SkeletonProps) {
  const { colors, radius, mode } = useTheme();
  const fill = mode === 'dark' ? colors.surfaceRaised : colors.surfaceSunken;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width, height, borderRadius: r ?? radius.chip, backgroundColor: fill }, style]}
    />
  );
}

/**
 * The listing-card skeleton.
 *
 * The price block is the tallest bar on purpose, so the eye is already resting
 * where the number is about to appear.
 */
export function SkeletonCard() {
  const { colors, space, radius } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: radius.card,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
        overflow: 'hidden',
      }}
    >
      <Skeleton height={160} radius={0} />
      <View style={{ padding: space[4], gap: space[3] }}>
        <Skeleton width="70%" height={16} />
        <Skeleton width="45%" height={12} />
        <Skeleton width="35%" height={24} />
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Page skeletons
 *
 * What a screen shows while its first read is in flight, so the page is
 * already there — header, layout, the shapes about to fill — instead of a
 * spinner on a blank screen that reads as "nothing is happening". All of them
 * breathe with the stay feed's pulse (`ListingFeedSkeleton`), and stop under
 * reduced motion.
 * ------------------------------------------------------------------ */

/** The slow fade every skeleton breathes with. */
export function SkeletonPulse({
  children,
  label = 'Loading',
  style,
}: {
  children: React.ReactNode;
  label?: string;
  style?: StyleProp<ViewStyle>;
}) {
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

export type SkeletonRowsProps = {
  count?: number;
  /** The leading shape: a round avatar/icon, a square thumbnail, or none. */
  lead?: 'circle' | 'square' | 'none';
  /** Draw each row as a bordered card rather than a plain list line. */
  card?: boolean;
  label?: string;
  style?: StyleProp<ViewStyle>;
};

/** A list still on its way — notifications, tickets, orders, addresses. */
export function SkeletonRows({ count = 5, lead = 'circle', card = false, label, style }: SkeletonRowsProps) {
  const { colors, space, radius } = useTheme();
  return (
    <SkeletonPulse label={label} style={[{ gap: card ? space[3] : space[4] }, style]}>
      {Array.from({ length: count }, (_, key) => (
        <View
          key={key}
          style={[
            styles.skeletonRow,
            { gap: space[3] },
            card && {
              padding: space[3],
              borderRadius: radius.card,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: colors.border,
              backgroundColor: colors.surface,
            },
          ]}
        >
          {lead === 'circle' ? <Skeleton width={40} height={40} radius={20} /> : null}
          {lead === 'square' ? <Skeleton width={56} height={56} radius={radius.chip} /> : null}
          <View style={{ flex: 1, gap: space[2] }}>
            <Skeleton width={key % 2 ? '58%' : '72%'} height={14} />
            <Skeleton width={key % 2 ? '86%' : '64%'} height={11} />
            {card ? <Skeleton width="32%" height={11} /> : null}
          </View>
        </View>
      ))}
    </SkeletonPulse>
  );
}

export type SkeletonDetailProps = {
  /** Height of the photo across the top; 0 for a page without one. */
  hero?: number;
  /** How many content blocks follow the title. */
  blocks?: number;
  label?: string;
  style?: StyleProp<ViewStyle>;
};

/** A detail page still on its way — a listing, a booking, a support thread. */
export function SkeletonDetail({ hero = 0, blocks = 3, label, style }: SkeletonDetailProps) {
  const { space, layout, radius } = useTheme();
  return (
    <SkeletonPulse label={label} style={style}>
      {hero > 0 ? <Skeleton height={hero} radius={0} /> : null}
      <View style={{ padding: layout.gutter, gap: space[4] }}>
        <View style={{ gap: space[2] }}>
          <Skeleton width="70%" height={22} />
          <Skeleton width="45%" height={13} />
        </View>
        {Array.from({ length: blocks }, (_, key) => (
          <View key={key} style={{ gap: space[2] }}>
            <Skeleton width="38%" height={12} />
            <Skeleton height={key === 0 ? 72 : 52} radius={radius.card} />
          </View>
        ))}
      </View>
    </SkeletonPulse>
  );
}

/* ------------------------------------------------------------------ *
 * Countdown ring
 * ------------------------------------------------------------------ */

const RING_RADIUS = 26;
const RING_STROKE = 4;
const RING_SIZE = (RING_RADIUS + RING_STROKE) * 2;
const CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export type CountdownRingProps = {
  /** Seconds left. Derive it from an absolute server deadline, never a duration. */
  secondsRemaining: number;
  totalSeconds: number;
  label?: string;
};

/**
 * One timer slot per screen.
 *
 * Two visible countdowns means the booking is in an impossible state — that is
 * a state-machine bug, not a layout problem.
 *
 * Under sixty seconds the ring turns to the danger set. That colour shift is
 * information, so it still runs under reduced motion; only the breathing scale
 * that normally accompanies it is dropped.
 */
export function CountdownRing({ secondsRemaining, totalSeconds, label }: CountdownRingProps) {
  const { colors, space } = useTheme();
  const remaining = Math.max(0, secondsRemaining);
  const fraction = totalSeconds > 0 ? remaining / totalSeconds : 0;
  const critical = remaining <= clocks.criticalThresholdSeconds;

  const offset = useDerivedValue(
    () => withTiming(CIRCUMFERENCE * (1 - fraction), { duration: 240, easing: easing.standard }),
    [fraction],
  );

  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: offset.value }));

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const readout = `${minutes}:${String(seconds).padStart(2, '0')}`;
  const stroke = critical ? colors.danger.base : colors.brand;

  return (
    <View style={[styles.row, { gap: space[3] }]}>
      <View style={{ width: RING_SIZE, height: RING_SIZE }}>
        <Svg width={RING_SIZE} height={RING_SIZE}>
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            stroke={colors.surfaceSunken}
            strokeWidth={RING_STROKE}
            fill="none"
          />
          <AnimatedCircle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            stroke={stroke}
            strokeWidth={RING_STROKE}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            animatedProps={animatedProps}
            transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
          />
        </Svg>
        <View style={[StyleSheet.absoluteFill, styles.ringCentre]}>
          <Text variant="numMeta" style={{ color: stroke }}>
            {readout}
          </Text>
        </View>
      </View>
      {label ? (
        <View style={{ gap: 2 }}>
          <Text variant="caption" color="secondary">
            {label}
          </Text>
          {/* The urgency is stated in words, not left to the colour. */}
          <Text variant="bodyStrong" color={critical ? 'danger' : 'primary'}>
            {critical ? 'Under a minute left' : `${minutes} min left`}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  skeletonRow: { flexDirection: 'row', alignItems: 'center' },
  labelRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  flexLabel: { flex: 1 },
  progressTrack: { height: 8, overflow: 'hidden' },
  progressFill: { height: 8 },
  staticRing: { width: 16, height: 16, borderRadius: 999, borderWidth: 2 },
  ringCentre: { alignItems: 'center', justifyContent: 'center' },
});
