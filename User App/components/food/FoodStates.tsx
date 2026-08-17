import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Icon, Skeleton, Text, type IconName } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';

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
  tone?: 'neutral' | 'problem';
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
  const palette = tone === 'problem' ? colors.danger : colors.info;

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

      <View style={{ alignSelf: 'stretch', gap: space[2], maxWidth: 320, width: '100%', alignItems: 'stretch' }}>
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
 * The feed's loading shape.
 *
 * It is the real layout at the real sizes, not a generic stack of bars: the
 * rail is four cells, the cards are 56pt thumbs beside three lines. A skeleton
 * whose geometry differs from what arrives produces a visible jump on every
 * load, which is worse than a spinner because it happens after the wait rather
 * than during it.
 */
export function FoodFeedSkeleton() {
  const { space, layout, radius } = useTheme();

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ paddingHorizontal: layout.gutter, gap: space[3], paddingTop: space[2] }}
    >
      <View style={[styles.railRow, { gap: space[2] }]}>
        {[0, 1, 2, 3].map((cell) => (
          <Skeleton key={cell} height={48} radius={radius.button} style={{ flex: 1 }} />
        ))}
      </View>

      <Skeleton height={44} radius={radius.button} />
      <Skeleton height={56} radius={radius.card} />

      <Skeleton width="45%" height={12} />

      {[0, 1, 2].map((card) => (
        <View key={card} style={[styles.skeletonCard, { gap: space[3] }]}>
          <Skeleton width={56} height={56} radius={radius.chip} />
          <View style={{ flex: 1, gap: space[2] }}>
            <Skeleton width="62%" height={13} />
            <Skeleton width="46%" height={10} />
            <Skeleton width="34%" height={10} />
          </View>
        </View>
      ))}
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
});
