import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, Text, type IconName } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';
import type { FoodOrder, FoodOrderStatus } from '@/types/food';
import { formatRupees } from '@/utils/money';

/* ------------------------------------------------------------------ *
 * Status chip
 * ------------------------------------------------------------------ */

type ChipShape = 'tinted' | 'filledBrand' | 'filledGraphite';

type StatusDescriptor = {
  label: string;
  glyph: IconName;
  shape: ChipShape;
  tone: 'success' | 'warning' | 'danger' | 'info';
};

/**
 * Eleven states, and only three of them are filled chips.
 *
 * A filled chip means the student is being waited on or has been handed
 * something: the food is at a counter, or it has arrived. Everything else is
 * tinted, which reads as "here is where your order is". If every state were
 * loud, Ready would stop meaning anything — and Ready is the one that has a
 * twenty-minute hold behind it.
 *
 * Colour is the second signal in all eleven. Each carries a glyph and a word,
 * so a student who cannot separate the green from the amber still knows
 * whether the kitchen has started.
 */
const STATUS: Record<FoodOrderStatus, StatusDescriptor> = {
  placed: { label: 'Placed', glyph: 'check', shape: 'tinted', tone: 'info' },
  confirmed: { label: 'Confirmed', glyph: 'check', shape: 'tinted', tone: 'success' },
  preparing: { label: 'Preparing', glyph: 'clock', shape: 'tinted', tone: 'success' },
  ready: { label: 'Ready', glyph: 'check', shape: 'filledBrand', tone: 'success' },
  onTheWay: { label: 'On the way', glyph: 'commute', shape: 'tinted', tone: 'success' },
  delivered: { label: 'Delivered', glyph: 'check', shape: 'filledGraphite', tone: 'success' },
  pickedUp: { label: 'Picked up', glyph: 'check', shape: 'filledGraphite', tone: 'success' },
  pending: { label: 'Payment pending', glyph: 'clock', shape: 'tinted', tone: 'warning' },
  cancelled: { label: 'Cancelled', glyph: 'close', shape: 'tinted', tone: 'danger' },
  refunded: { label: 'Refunded', glyph: 'rupee', shape: 'tinted', tone: 'success' },
  failed: { label: 'Payment failed', glyph: 'alert', shape: 'tinted', tone: 'danger' },
};

export function FoodStatusChip({
  status,
  /** Appended to the label — the refunded chip carries its own amount. */
  amount,
  onDark,
}: {
  status: FoodOrderStatus;
  amount?: number;
  onDark?: boolean;
}) {
  const { colors, space, radius } = useTheme();
  const descriptor = STATUS[status];
  const tone = colors[descriptor.tone];

  const background =
    descriptor.shape === 'filledBrand'
      ? colors.brand
      : descriptor.shape === 'filledGraphite'
        ? onDark
          ? colors.graphiteRaised
          : colors.graphite
        : onDark
          ? colors.graphiteRaised
          : tone.tint;

  const ink =
    descriptor.shape === 'filledBrand'
      ? colors.onBrand
      : descriptor.shape === 'filledGraphite'
        ? colors.onGraphite
        : onDark
          ? colors.onGraphite
          : tone.ink;

  const label = amount !== undefined ? `${descriptor.label} ${formatRupees(amount)}` : descriptor.label;

  return (
    <View
      accessibilityLabel={label}
      style={[
        styles.chip,
        { backgroundColor: background, borderRadius: radius.pill, paddingHorizontal: space[2] + 2, gap: 4 },
      ]}
    >
      <Icon name={descriptor.glyph} size={16} color={ink} />
      <Text variant="label" style={{ color: ink, letterSpacing: 0.3 }}>
        {label}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Timeline
 * ------------------------------------------------------------------ */

/**
 * Where the order is, as a list of things that have and have not happened.
 *
 * The last two steps swap by mode — delivery ends *On the way → Delivered*,
 * pickup ends *Ready → Picked up* — because a student walking to a counter and
 * a student waiting in their room are watching for different events. The dot
 * carries done / current / pending; the label and the timestamp say the same
 * thing in words.
 */
export function FoodTimeline({
  steps,
  currentIndex,
}: {
  steps: readonly { label: string; at?: string; note?: string }[];
  currentIndex: number;
}) {
  const { colors, space, radius } = useTheme();

  return (
    <View
      style={[
        styles.timeline,
        { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.card, paddingHorizontal: space[4] },
      ]}
    >
      {steps.map((step, index) => {
        const done = index < currentIndex;
        const current = index === currentIndex;
        return (
          <View key={step.label} style={[styles.step, { paddingVertical: space[2] + 2, gap: space[3] }]}>
            <View style={styles.dotColumn}>
              {/* The halo is what marks "this is happening now" without adding a
                  fourth colour to a list that already carries three states. It
                  is drawn behind the dot so the dot keeps its exact size. */}
              {current ? <View style={[styles.halo, { borderColor: colors.brandTint }]} /> : null}
              <View
                style={[
                  styles.dot,
                  {
                    backgroundColor: done ? colors.brand : current ? colors.graphite : 'transparent',
                    borderColor: done || current ? 'transparent' : colors.border,
                    borderWidth: done || current ? 0 : 1.5,
                  },
                ]}
              />
            </View>

            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="title3" style={{ color: done || current ? colors.textPrimary : colors.textTertiary }}>
                {step.label}
              </Text>
              {step.at ? (
                <Text variant="numMeta" color="tertiary" style={{ marginTop: 2 }}>
                  {step.at}
                </Text>
              ) : null}
              {step.note ? (
                <Text variant="caption" color="tertiary" style={{ marginTop: 2 }}>
                  {step.note}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** Which timeline step an order status is standing on. */
export function timelineIndex(order: FoodOrder): number {
  switch (order.status) {
    case 'placed':
      return 0;
    case 'confirmed':
      return 1;
    case 'preparing':
      return 2;
    case 'ready':
    case 'onTheWay':
      return 3;
    case 'delivered':
    case 'pickedUp':
      return 4;
    default:
      return 0;
  }
}

/* ------------------------------------------------------------------ *
 * The live order
 * ------------------------------------------------------------------ */

/**
 * The order in flight, pinned above everything else.
 *
 * It is the inverted surface because it is the only thing on the Orders screen
 * a student has come back for — everything under it is history. On a dark
 * screen this is the one light-on-dark card, and that is intended: it is the
 * thing you opened the app to see.
 */
export function ActiveOrderCard({
  order,
  headline,
  detail,
  actionLabel,
  onPress,
}: {
  order: FoodOrder;
  headline: string;
  detail: string;
  actionLabel: string;
  onPress: () => void;
}) {
  const { colors, space, radius } = useTheme();

  return (
    <View
      style={[
        { backgroundColor: colors.graphite, borderRadius: radius.card, padding: space[4], gap: space[2] },
      ]}
    >
      <View style={styles.activeHead}>
        <FoodStatusChip status={order.status} onDark />
        <Text variant="numMeta" style={{ color: colors.onGraphiteMuted }}>
          Order {order.id}
        </Text>
      </View>

      <Text variant="display2" style={{ color: colors.onGraphite, marginTop: space[1] }}>
        {headline}
      </Text>
      <Text variant="caption" style={{ color: colors.onGraphiteMuted }}>
        {detail}
      </Text>

      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={actionLabel}
        style={({ pressed }) => [
          styles.activeAction,
          {
            backgroundColor: pressed ? colors.onGraphiteMuted : colors.onGraphite,
            borderRadius: radius.chip,
            marginTop: space[3],
          },
        ]}
      >
        <Text variant="title3" style={{ color: colors.graphite }}>
          {actionLabel}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, alignSelf: 'flex-start' },
  timeline: { borderWidth: StyleSheet.hairlineWidth },
  step: { flexDirection: 'row' },
  dotColumn: { width: 10, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 5 },
  dot: { width: 9, height: 9, borderRadius: 999 },
  halo: { position: 'absolute', top: 2, width: 15, height: 15, borderRadius: 999, borderWidth: 3 },
  activeHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  activeAction: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
