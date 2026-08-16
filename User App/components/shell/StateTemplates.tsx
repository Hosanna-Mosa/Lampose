import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { Button, Icon, Skeleton, SkeletonCard, Text } from '@/components/ui';
import { signature } from '@/constants/motion';
import type { StateCopy } from '@/constants/copy';
import { useReduceMotion, useTheme } from '@/context/ThemeContext';
import { useDepositMark } from '@/components/ui/DepositMark';

/**
 * The illustration slot.
 *
 * It stays a dashed box until real artwork exists. A stock-looking spot
 * illustration would undo the whole visual direction, and an obvious hole is
 * easier to notice than a wrong-looking drawing.
 */
function IllustrationSlot() {
  const { colors, radius } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.illustration,
        { borderColor: colors.border, borderRadius: radius.card, backgroundColor: colors.surfaceSunken },
      ]}
    >
      <Text variant="numMeta" color="tertiary">
        120 × 120
      </Text>
    </View>
  );
}

export type StateTemplateProps = {
  copy: StateCopy;
  onPrimary: () => void;
  onSecondary?: () => void;
  /** Errors that are genuinely errors. A taken listing is not one. */
  tone?: 'neutral' | 'error';
  /** Overrides the footnote the copy carries, e.g. with a booking reference. */
  footnote?: string;
};

/**
 * One template for every empty and error state.
 *
 * The tone is neutral by default on purpose: most of these are not failures.
 * "This bed is taken" gets no red, because nothing broke — the market moved.
 */
export function StateTemplate({ copy, onPrimary, onSecondary, tone = 'neutral', footnote }: StateTemplateProps) {
  const { colors, space, layout } = useTheme();
  const reduceMotion = useReduceMotion();

  return (
    <Animated.View
      entering={reduceMotion ? FadeIn.duration(120) : FadeIn.duration(200)}
      style={[styles.stateHost, { padding: layout.gutter, gap: space[5] }]}
    >
      <IllustrationSlot />

      <View style={[styles.centred, { gap: space[2] }]}>
        <Text variant="title1" style={styles.centredText}>
          {copy.headline}
        </Text>
        <Text variant="bodyLg" color="secondary" style={styles.centredText}>
          {copy.body}
        </Text>
      </View>

      <View style={[styles.actions, { gap: space[2] }]}>
        <Button
          label={copy.primaryAction}
          onPress={onPrimary}
          variant={copy.calm ? 'secondary' : 'primary'}
          fullWidth
        />
        {copy.secondaryAction && onSecondary ? (
          <Button label={copy.secondaryAction} onPress={onSecondary} variant="ghost" fullWidth />
        ) : null}
      </View>

      {footnote ?? copy.footnote ? (
        <Text variant="numMeta" color="tertiary" style={styles.centredText}>
          {footnote ?? copy.footnote}
        </Text>
      ) : null}

      {tone === 'error' ? (
        <View style={{ height: 2, width: 40, backgroundColor: colors.danger.base, borderRadius: 1 }} />
      ) : null}
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ *
 * Success
 * ------------------------------------------------------------------ */

export type SuccessStateProps = {
  headline: string;
  body: string;
  /** Booking id, amounts — the receipt block. */
  rows: readonly { label: string; value: string; refundable?: boolean }[];
  primaryAction: string;
  onPrimary: () => void;
  secondaryAction?: string;
  onSecondary?: () => void;
};

/**
 * Sequenced: the confirmation disc lands first, then the receipt block at
 * +280ms. No confetti — this is a large amount of someone's money.
 */
export function SuccessState({
  headline,
  body,
  rows,
  primaryAction,
  onPrimary,
  secondaryAction,
  onSecondary,
}: SuccessStateProps) {
  const { colors, space, radius, layout } = useTheme();
  const depositMark = useDepositMark();
  const reduceMotion = useReduceMotion();

  return (
    <View style={[styles.stateHost, { padding: layout.gutter, gap: space[5] }]}>
      <Animated.View
        entering={reduceMotion ? FadeIn.duration(120) : FadeIn.duration(signature.successConfirm.duration)}
        style={[styles.successDisc, { backgroundColor: colors.success.base, borderRadius: radius.pill }]}
      >
        <Icon name="check" size={28} color={colors.success.on} />
      </Animated.View>

      <View style={[styles.centred, { gap: space[2] }]}>
        <Text variant="title1" style={styles.centredText}>
          {headline}
        </Text>
        <Text variant="bodyLg" color="secondary" style={styles.centredText}>
          {body}
        </Text>
      </View>

      <Animated.View
        entering={reduceMotion ? FadeIn.duration(120) : FadeInDown.duration(220).delay(280)}
        style={{
          alignSelf: 'stretch',
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: radius.card,
          padding: space[4],
          gap: space[3],
        }}
      >
        {rows.map((row) => (
          <View key={row.label} style={styles.receiptRow}>
            {/* A receipt is the worst place in the app for a truncated amount,
                so the label is what gives way. */}
            <Text variant="caption" color="secondary" style={styles.receiptLabel}>
              {row.label}
            </Text>
            <Text
              variant="priceSm"
              style={
                row.refundable
                  ? depositMark
                  : undefined
              }
            >
              {row.value}
            </Text>
          </View>
        ))}
      </Animated.View>

      <View style={[styles.actions, { gap: space[2] }]}>
        <Button label={primaryAction} onPress={onPrimary} fullWidth />
        {secondaryAction && onSecondary ? (
          <Button label={secondaryAction} onPress={onSecondary} variant="secondary" fullWidth />
        ) : null}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Skeletons
 * ------------------------------------------------------------------ */

export type ListSkeletonProps = { count?: number };

/**
 * The list skeleton.
 *
 * Filter chips are drawn solid rather than as loading blocks: they arrive from
 * local state instantly, so pretending they load would be a lie about where
 * the latency is.
 */
export function ListSkeleton({ count = 3 }: ListSkeletonProps) {
  const { space, radius, layout } = useTheme();
  const reduceMotion = useReduceMotion();

  return (
    <View style={{ padding: layout.gutter, gap: space[4] }}>
      <View style={[styles.chipRow, { gap: space[2] }]}>
        {[64, 80, 72].map((width, index) => (
          <Skeleton key={index} width={width} height={40} radius={radius.pill} />
        ))}
      </View>
      {Array.from({ length: count }).map((_, index) => (
        <Animated.View
          key={index}
          entering={
            reduceMotion
              ? undefined
              : FadeInDown.duration(signature.skeletonReveal.duration).delay(
                  // Capped at the on-screen count — never animate a row the
                  // user will only scroll to later.
                  Math.min(index, 4) * signature.skeletonReveal.stagger,
                )
          }
        >
          <SkeletonCard />
        </Animated.View>
      ))}
    </View>
  );
}

/**
 * The detail skeleton keeps the real field-row rhythm, so the label column and
 * the value column do not shift when the data lands.
 */
export function DetailSkeleton() {
  const { space, layout } = useTheme();

  return (
    <View style={{ gap: space[4] }}>
      <Skeleton height={280} radius={0} />
      <View style={{ paddingHorizontal: layout.gutter, gap: space[4] }}>
        <Skeleton width="75%" height={22} />
        <Skeleton width="55%" height={14} />
        {/* The widest block is the price — the eye is already there when the
            number arrives. */}
        <Skeleton width="45%" height={34} />
        {[0, 1, 2, 3].map((row) => (
          <View key={row} style={styles.fieldRow}>
            <Skeleton width={96} height={14} />
            <Skeleton width={120} height={14} />
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * The refresh line.
 *
 * A refresh keeps the current content and adds a 2pt line at the top. It never
 * falls back to a skeleton — replacing content the user is reading with grey
 * blocks is a regression, not a loading state.
 */
export function RefreshLine({ active }: { active: boolean }) {
  const { colors } = useTheme();
  if (!active) return null;
  return <View style={{ height: 2, backgroundColor: colors.brand }} />;
}

const styles = StyleSheet.create({
  stateHost: { alignItems: 'center', justifyContent: 'center', flexGrow: 1 },
  illustration: {
    width: 120,
    height: 120,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centred: { alignItems: 'center', maxWidth: 340 },
  centredText: { textAlign: 'center' },
  actions: { alignSelf: 'stretch' },
  successDisc: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  receiptRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  receiptLabel: { flex: 1 },
  chipRow: { flexDirection: 'row' },
  fieldRow: { flexDirection: 'row', justifyContent: 'space-between' },
});
