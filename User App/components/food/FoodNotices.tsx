import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';

/**
 * An offer, stated as a saving.
 *
 * Amber is the app's accent colour and it is also what deadlines wear, so the
 * two are told apart by SHAPE rather than hue: an offer is a filled amber chip
 * on a plain surface card, a deadline is a fully amber-tinted card with no
 * chip. One offer strip per screen, ever — a feed with three of them is an
 * advertisement, and this one exists because ₹20 off a ₹99 meal is a fifth of
 * the price to the person reading it.
 */
export function OfferStrip({
  headline,
  body,
  onDismiss,
}: {
  headline: string;
  body: string;
  onDismiss?: () => void;
}) {
  const { colors, space, radius } = useTheme();

  return (
    <View
      accessibilityLabel={`Offer: ${headline}. ${body}`}
      style={[
        styles.strip,
        {
          backgroundColor: colors.surface,
          borderColor: colors.warning.border,
          borderRadius: radius.card,
          paddingHorizontal: space[3],
          paddingVertical: space[2] + 2,
          gap: space[2] + 2,
        },
      ]}
    >
      <View
        style={[
          styles.offerChip,
          { backgroundColor: colors.warning.base, borderRadius: radius.chip, paddingHorizontal: space[2] },
        ]}
      >
        <Text variant="label" style={{ color: colors.warning.on, letterSpacing: 0.3 }}>
          {headline}
        </Text>
      </View>

      <Text variant="caption" color="secondary" style={{ flex: 1 }} numberOfLines={2}>
        {body}
      </Text>

      {onDismiss ? (
        <Pressable onPress={onDismiss} hitSlop={10} accessibilityRole="button" accessibilityLabel="Dismiss offer">
          <Icon name="close" size={16} color={colors.textTertiary} />
        </Pressable>
      ) : null}
    </View>
  );
}

export type FoodNoticeTone = 'info' | 'deadline' | 'good' | 'problem';

/**
 * A notice: what is true, then what to do about it.
 *
 * Never more than a heading and a line. The moment a notice needs a paragraph
 * it is not a notice, it is a state — and the module has a state template for
 * exactly that.
 */
export function FoodNotice({
  title,
  body,
  tone = 'info',
  actionLabel,
  onAction,
}: {
  title: string;
  body?: string;
  tone?: FoodNoticeTone;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { colors, space, radius } = useTheme();

  const palette =
    tone === 'deadline'
      ? colors.warning
      : tone === 'good'
        ? colors.success
        : tone === 'problem'
          ? colors.danger
          : colors.info;

  return (
    <View
      style={[
        styles.notice,
        {
          backgroundColor: palette.tint,
          borderColor: palette.border,
          borderRadius: radius.card,
          padding: space[3],
          gap: space[1],
        },
      ]}
    >
      <Text variant="title3" style={{ color: palette.ink }}>
        {title}
      </Text>
      {body ? (
        <Text variant="caption" style={{ color: palette.ink }}>
          {body}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} accessibilityRole="button" style={{ marginTop: space[1], minHeight: 28, justifyContent: 'center' }}>
          <Text variant="bodyStrong" style={{ color: palette.ink, textDecorationLine: 'underline' }}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** The uppercase rule that separates one part of a long screen from the next. */
export function FoodSectionHeader({ title, trailing }: { title: string; trailing?: string }) {
  const { space } = useTheme();
  return (
    <View style={[styles.sectionHeader, { paddingBottom: space[2] }]}>
      <Text variant="eyebrow" color="tertiary" style={{ flex: 1 }}>
        {title}
      </Text>
      {trailing ? (
        <Text variant="numMeta" color="tertiary">
          {trailing}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth },
  offerChip: { paddingVertical: 4 },
  notice: { borderWidth: StyleSheet.hairlineWidth },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
});
