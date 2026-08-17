import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { Icon, Text } from '@/components/ui';
import { easing, signature } from '@/constants/motion';
import { useReduceMotion, useTheme } from '@/context/ThemeContext';
import { formatRupees } from '@/utils/money';
import { genderMeta, type Gender } from '@/types/listing';

/* ------------------------------------------------------------------ *
 * DepositBadge
 * ------------------------------------------------------------------ */

export type DepositBadgeProps = {
  /** `undefined` means the owner has not stated one. Never rendered as ₹0. */
  amount?: number;
  months?: number;
  /**
   * Server-computed. "High" is only meaningful relative to what else is
   * nearby, so without this the comparison variant is not rendered at all
   * rather than guessed.
   */
  areaMedianMonths?: number;
  /** `block` on a card, `inline` where it sits in a row of facts. */
  size?: 'block' | 'inline';
  style?: ViewStyle;
};

type DepositTone = 'none' | 'normal' | 'high' | 'unknown';

function depositTone(months: number | undefined, areaMedianMonths: number | undefined): DepositTone {
  if (months === undefined) return 'unknown';
  if (months === 0) return 'none';
  // The comparison is only drawn when the market number exists to compare to.
  if (areaMedianMonths !== undefined && months > areaMedianMonths) return 'high';
  return 'normal';
}

/**
 * The deposit, stated on the card and never behind a tap.
 *
 * A deposit is the number that decides whether a student can take a room at
 * all — it is capital, not a monthly cost — so it is never in fine print and
 * never folded into the rent.
 *
 * The multiplier glyph (1× 2× 3×) is the non-colour carrier: the tone tells a
 * sighted user quickly, and the glyph plus the sentence tell everyone else.
 * Only the no-deposit variant animates. Nothing else celebrates.
 */
export function DepositBadge({
  amount,
  months,
  areaMedianMonths,
  size = 'block',
  style,
}: DepositBadgeProps) {
  const { colors, space, radius } = useTheme();
  const reduceMotion = useReduceMotion();
  const tone = depositTone(months, areaMedianMonths);
  const scale = useSharedValue(1);

  useEffect(() => {
    if (tone !== 'none' || reduceMotion) return;
    // Once, on mount. A badge that re-animates on every list re-render turns
    // good news into a flicker.
    scale.value = withSequence(
      withTiming(signature.successConfirm.overshoot, {
        duration: signature.successConfirm.duration / 2,
        easing: easing.settle,
      }),
      withTiming(1, { duration: signature.successConfirm.duration / 2, easing: easing.settle }),
    );
  }, [tone, reduceMotion, scale]);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const set =
    tone === 'none'
      ? { bg: colors.success.tint, ink: colors.success.ink, border: colors.success.border, width: 1 }
      : tone === 'high'
        ? { bg: colors.danger.tint, ink: colors.danger.ink, border: colors.danger.border, width: 1.5 }
        : tone === 'unknown'
          ? { bg: colors.surfaceSunken, ink: colors.textSecondary, border: colors.border, width: 1 }
          : {
              bg: colors.warning.tint,
              ink: colors.warning.ink,
              border: colors.warning.border,
              // Two months is the market norm here and still gets the heavier
              // rule — normal is not the same as small.
              width: months === 2 ? 1.5 : 1,
            };

  const headline =
    tone === 'none'
      ? 'No deposit'
      : tone === 'unknown'
        ? 'Deposit not stated'
        : `${formatRupees(amount ?? 0)} deposit`;

  const detail =
    tone === 'none'
      ? "Move in with one month's rent"
      : tone === 'unknown'
        ? 'Ask before you visit'
        : tone === 'high'
          ? `${months} months · high for this area`
          : `${months} ${months === 1 ? 'month' : 'months'} · refundable`;

  const marker =
    tone === 'none' ? (
      <Icon name="check" size={16} color={set.ink} />
    ) : tone === 'unknown' ? (
      <Text variant="bodyStrong" style={{ color: set.ink }}>
        ?
      </Text>
    ) : (
      <Text variant="priceSm" style={{ color: set.ink }}>
        {months}×
      </Text>
    );

  return (
    <Animated.View
      accessible
      accessibilityLabel={`${headline}. ${detail}.`}
      style={[
        styles.depositHost,
        animatedStyle,
        {
          backgroundColor: set.bg,
          borderColor: set.border,
          borderWidth: set.width,
          borderRadius: radius.chip,
          paddingHorizontal: space[3],
          paddingVertical: size === 'block' ? space[2] : space[1],
          gap: space[2],
        },
        style,
      ]}
    >
      <View style={[styles.marker, { borderRadius: radius.chip, backgroundColor: colors.surface }]}>
        {marker}
      </View>
      <View style={styles.flex}>
        <Text variant="bodyStrong" style={{ color: set.ink }} numberOfLines={1}>
          {headline}
        </Text>
        <Text variant="numMeta" style={{ color: set.ink }} numberOfLines={1}>
          {detail}
        </Text>
      </View>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ *
 * GenderBadge
 * ------------------------------------------------------------------ */

export type GenderBadgeProps = {
  /**
   * `undefined` when nobody recorded the rule, and then nothing is drawn.
   *
   * Optional here rather than guarded at each call site, because there are
   * four of them and the failure mode of forgetting one is the badge
   * asserting a gender rule the owner never stated. A component that cannot
   * render a claim it was not given is the version that stays correct.
   */
  gender?: Gender;
  /**
   * False means this listing does not match the filter the user set. Arriving
   * at a girls' PG as a boy is a trust failure, not a filtering preference, so
   * the mismatch is stated rather than quietly sorted down the list.
   */
  matchesUser?: boolean;
  /** `onPhoto` sits over an image and gets the scrim treatment. */
  onPhoto?: boolean;
  compact?: boolean;
};

/**
 * One ink-filled chip for all three genders — colour carries nothing here.
 *
 * The carriers are the letter (B / G / BG), the shape of its tile (square for
 * boys, circle for girls, square with two letters for co-ed) and the full word,
 * which is always spelled out. Ink-on-white rather than pink-on-blue is
 * deliberate: a gendered palette would be both crude and unreadable for the
 * 8% of male users with red-green deficiency.
 */
export function GenderBadge({ gender, matchesUser = true, onPhoto = false, compact = false }: GenderBadgeProps) {
  const { colors, space, radius } = useTheme();

  // Unstated is not co-ed. See the prop's note.
  if (!gender) return null;

  const meta = genderMeta[gender];

  const background = onPhoto ? 'rgba(16,21,28,0.72)' : colors.graphite;
  const ink = colors.onGraphite;

  return (
    <View
      accessible
      accessibilityLabel={
        matchesUser ? meta.label : `${meta.label}. This does not match the gender you selected.`
      }
      style={[
        styles.genderHost,
        {
          backgroundColor: background,
          borderRadius: radius.chip,
          paddingLeft: space[1],
          paddingRight: compact ? space[2] : space[3],
          paddingVertical: space[1],
          gap: space[2],
          borderWidth: matchesUser ? 0 : 1.5,
          borderColor: colors.danger.base,
        },
      ]}
    >
      {/* The tile's shape is the second carrier: square for boys, circle for
          girls. It is doing work, not decoration. */}
      <View
        style={[
          styles.genderTile,
          {
            backgroundColor: ink,
            borderRadius: meta.shape === 'circle' ? radius.pill : 4,
          },
        ]}
      >
        <Text variant="label" style={{ color: colors.graphite, letterSpacing: 0 }}>
          {meta.letter}
        </Text>
      </View>
      <Text variant={compact ? 'numMeta' : 'bodyStrong'} style={{ color: ink }}>
        {compact ? meta.label.replace(' only', '') : meta.label}
      </Text>
      {!matchesUser ? (
        <Text variant="numMeta" style={{ color: colors.danger.base }}>
          · not your filter
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
  depositHost: { flexDirection: 'row', alignItems: 'center' },
  marker: { minWidth: 28, height: 28, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  genderHost: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' },
  genderTile: { minWidth: 22, height: 22, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
});
