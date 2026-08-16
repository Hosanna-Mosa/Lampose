import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Icon, Text } from '@/components/ui';
import { useReduceMotion, useTheme } from '@/context/ThemeContext';
import { formatDigits, formatRupees } from '@/utils/money';
import type { CostBreakdownData, CostLine } from '@/types/booking';
import { useDepositMark } from '@/components/ui/DepositMark';

/**
 * The cost breakdown — the component that decides whether this product is
 * trusted.
 *
 * Its rules, in order of how much trust each one buys:
 *
 *  1. Every line has a one-sentence explainer. A line item a first-time renter
 *     cannot explain to a parent is a line item they will not pay.
 *  2. Every line says who receives it — the owner, or LAMPOSE.
 *  3. Refundable money is badged and dotted-underlined, and the footer restates
 *     the real cost once the deposit comes back.
 *  4. Our fee is called the LAMPOSE fee and justified in the same breath. Never
 *     "convenience fee", "service charge" or "taxes and fees".
 *  5. Pay-now and pay-at-move-in are separate blocks and are never summed. One
 *     figure mixing app payments with cash owed to an owner is a number nobody
 *     can act on.
 *  6. Estimates are visually distinct and sourced. An estimate typeset like a
 *     fixed charge is a lie.
 *  7. Discounts are negative lines with a reason, never a struck-through
 *     inflated original.
 *  8. The quote's freshness and validity travel with the total.
 */

function lineTotal(lines: readonly CostLine[]): number {
  return lines.reduce((sum, line) => sum + (line.estimate ? 0 : line.amount), 0);
}

function refundableTotal(lines: readonly CostLine[]): number {
  return lines.reduce((sum, line) => sum + (line.refundable ? line.amount : 0), 0);
}

/* ------------------------------------------------------------------ *
 * Collapsed summary
 * ------------------------------------------------------------------ */

export type CostSummaryProps = {
  data: CostBreakdownData;
  onExpand: () => void;
};

/**
 * The one-line version always names the refundable share.
 *
 * A single large number with no context is exactly what a deposit-anxious
 * student refuses to tap.
 */
export function CostSummary({ data, onExpand }: CostSummaryProps) {
  const { colors, space, radius, touch } = useTheme();
  const depositMark = useDepositMark();
  const total = lineTotal(data.payNow);
  const refundable = refundableTotal(data.payNow);

  return (
    <Pressable
      onPress={onExpand}
      accessibilityRole="button"
      accessibilityLabel={`Pay now ${formatRupees(total)}. ${formatRupees(refundable)} of this is a refundable deposit. See the full breakdown.`}
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: radius.card,
        padding: space[4],
        gap: space[2],
        minHeight: touch.min,
      }}
    >
      <View style={styles.totalRow}>
        <Text variant="title3">Pay now</Text>
        <Text variant="priceLg">{formatRupees(total)}</Text>
      </View>
      {refundable > 0 ? (
        <Text
          variant="numMeta"
          style={depositMark}
        >
          {formatRupees(refundable)} of this is a refundable deposit
        </Text>
      ) : null}
      <View style={[styles.row, { gap: space[1] }]}>
        <Text variant="bodyStrong" color="brand">
          See what this covers
        </Text>
        <Icon name="chevronRight" size={16} color={colors.brandInk} />
      </View>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ *
 * Full breakdown
 * ------------------------------------------------------------------ */

function Line({ line }: { line: CostLine }) {
  const { colors, space, radius } = useTheme();
  const depositMark = useDepositMark();
  /*
   * One composition at every width. No breakpoint, and none needed.
   *
   * A Batch 12 note here claimed the label and the value collide above 1.4x,
   * and a device-width breakpoint was added to drop the amount beneath its
   * label. The collision cannot happen: the label block carries `flex: 1` and
   * the amount column carries no flex at all, so flexbox gives the amount its
   * intrinsic width and hands the remainder to the label — which wraps, since
   * nothing here sets `numberOfLines`. Growing text makes the row taller, never
   * wider than the card.
   *
   * Worst case measured at 320dp and fontScale 1.3: the widest amount string
   * is about 64dp, leaving 176dp for the label — enough for the longest one
   * ("First-booking discount", ~171dp) on a single line. Every wider device has
   * more room again.
   */

  const amountLabel = line.estimate
    ? `${formatRupees(line.estimate.low)}–${formatDigits(line.estimate.high)}`
    : line.discount
      ? `−${formatRupees(Math.abs(line.amount))}`
      : formatRupees(line.amount);

  return (
    <View
      style={[styles.lineRow, { gap: space[4] }]}
    >
      <View style={styles.flex}>
        <View style={[styles.row, { gap: space[2] }]}>
          <Text variant="bodyStrong">{line.label}</Text>
          {line.refundable ? (
            <View
              style={{
                backgroundColor: colors.warning.tint,
                borderRadius: radius.chip,
                paddingHorizontal: space[2],
                paddingVertical: 2,
              }}
            >
              <Text variant="label" style={{ color: colors.warning.ink }}>
                Refundable
              </Text>
            </View>
          ) : null}
        </View>
        <Text variant="caption" color="secondary">
          {line.explainer}
        </Text>
        <Text variant="numMeta" color="tertiary">
          {line.payee === 'owner' ? 'paid to the owner' : 'paid to LAMPOSE'}
          {line.estimate ? ` · ${line.estimate.source}` : ''}
        </Text>
      </View>

      <View style={styles.amountCol}>
        {/* An estimate is never typeset like a fixed charge. It takes the
            lighter numeric variant — weight 500 rather than 600 — and carries
            a range and its source, so it cannot be mistaken for a price. */}
        <Text
          variant={line.estimate ? 'numMeta' : 'priceSm'}
          style={
            line.refundable
              ? depositMark
              : line.discount
                ? { color: colors.success.ink }
                : undefined
          }
        >
          {amountLabel}
        </Text>
        {line.monthly || line.estimate ? (
          <Text variant="numMeta" color="tertiary">
            {line.monthly ? '/mo' : ''}
            {line.estimate ? ' est.' : ''}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export type CostBreakdownProps = {
  data: CostBreakdownData;
  onCollapse?: () => void;
};

export function CostBreakdown({ data, onCollapse }: CostBreakdownProps) {
  const { colors, space, radius } = useTheme();
  const reduceMotion = useReduceMotion();

  const payNowTotal = lineTotal(data.payNow);
  const refundable = refundableTotal(data.payNow);
  const realCost = payNowTotal - refundable;

  return (
    // Separate mount rather than a height animation — animating height is
    // banned, and a summary and a full sheet are two different things anyway.
    <Animated.View
      entering={reduceMotion ? undefined : FadeInDown.duration(220)}
      style={{ gap: space[4] }}
    >
      <Text variant="caption" color="secondary">
        {data.propertyLine}
      </Text>

      {/* Block one. It is never added to block two. */}
      <View
        style={{
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: radius.card,
          padding: space[4],
          gap: space[3],
        }}
      >
        <View style={{ gap: 2 }}>
          <Text variant="title3">Pay now</Text>
          <Text variant="numMeta" color="secondary">
            in the app
          </Text>
        </View>

        <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.borderSubtle }} />

        {data.payNow.map((line) => (
          <Line key={line.id} line={line} />
        ))}

        <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />

        <View style={[styles.lineRow, { gap: space[4] }]}>
          <View style={styles.flex}>
            <Text variant="title3">Pay now</Text>
            <Text variant="caption" color="secondary">
              One payment. UPI, card or netbanking.
            </Text>
          </View>
          <Text variant="priceLg">{formatRupees(payNowTotal)}</Text>
        </View>

        {/* The sentence worth fighting for. Every competitor shows the gross
            figure and lets a stressed student do the subtraction, usually
            wrongly, usually with a parent asking why it costs so much. */}
        {refundable > 0 ? (
          <View
            style={[
              styles.row,
              {
                backgroundColor: colors.success.tint,
                borderRadius: radius.chip,
                padding: space[3],
                gap: space[2],
              },
            ]}
          >
            <Icon name="check" size={20} color={colors.success.base} />
            <Text variant="caption" style={{ color: colors.success.ink, flex: 1 }}>
              {formatRupees(refundable)} of this comes back to you. Your real cost to move in is{' '}
              {formatRupees(realCost)}.
            </Text>
          </View>
        ) : null}

        {data.quote ? (
          <Text variant="numMeta" color="tertiary">
            {data.quote.quotedLabel}
          </Text>
        ) : null}
      </View>

      {/* Block two. Different money, different recipient, its own header. */}
      {data.payAtMoveIn.length > 0 ? (
        <View
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderWidth: StyleSheet.hairlineWidth,
            borderRadius: radius.card,
            padding: space[4],
            gap: space[3],
          }}
        >
          <View style={{ gap: 2 }}>
            <Text variant="title3">Pay at move-in</Text>
            <Text variant="numMeta" color="secondary">
              directly to the owner · not collected by LAMPOSE. Ask for a receipt.
            </Text>
          </View>

          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.borderSubtle }} />

          {data.payAtMoveIn.map((line) => (
            <Line key={line.id} line={line} />
          ))}

          {data.payAtMoveIn.some((line) => line.estimate) ? (
            <View
              style={[
                styles.row,
                {
                  backgroundColor: colors.warning.tint,
                  borderRadius: radius.chip,
                  padding: space[3],
                  gap: space[2],
                },
              ]}
            >
              <Icon name="clock" size={20} color={colors.warning.base} />
              <Text variant="caption" style={{ color: colors.warning.ink, flex: 1 }}>
                The estimate above comes from what residents actually paid — it is not a charge we can
                promise. Everything else on this page is fixed.
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {onCollapse ? (
        <Pressable
          onPress={onCollapse}
          accessibilityRole="button"
          accessibilityLabel="Hide the breakdown"
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <Text variant="bodyStrong" color="brand">
            Hide the breakdown
          </Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
  totalRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  lineRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  amountCol: { alignItems: 'flex-end' },
});
