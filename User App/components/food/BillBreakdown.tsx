import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';
import { formatRupees } from '@/utils/money';

export type BillLine = {
  id: string;
  label: string;
  amount: number;
  /** Printed instead of the amount — "Free", "Included". */
  amountLabel?: string;
  /** Indented under the line above it: an add-on inside its dish. */
  sub?: boolean;
  /** A saving. Rendered green and signed, because it moves the total down. */
  discount?: boolean;
};

export type BillBreakdownProps = {
  lines: readonly BillLine[];
  total: number;
  /** "To pay" in a cart, "Paid" on a receipt, "Refunding" on a cancellation. */
  totalLabel: string;
  /** Small print under the total — what the total does and does not include. */
  footnote?: string;
};

/**
 * The bill.
 *
 * Every line is a label and a tabular amount, the total is the largest numeral
 * on the screen, and a discount is signed and green so it cannot be mistaken
 * for another charge. Taxes are shown only when there are any — a "₹0 taxes"
 * row teaches a student to skim the block, and the block is the one thing on a
 * checkout that must not be skimmed.
 *
 * The same component prints the cart, the receipt and the refund. Three
 * separately-written breakdowns is three places for the arithmetic to disagree,
 * and a student comparing a receipt against a cart they remember will find that
 * disagreement before anyone else does.
 */
export function BillBreakdown({ lines, total, totalLabel, footnote }: BillBreakdownProps) {
  const { colors, space, radius } = useTheme();

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.card, padding: space[4] },
      ]}
    >
      {lines.map((line) => (
        <View key={line.id} style={[styles.row, { paddingBottom: space[2] - 1, paddingLeft: line.sub ? space[3] : 0 }]}>
          <Text
            variant={line.sub ? 'caption' : 'body'}
            numberOfLines={2}
            style={{ flex: 1, color: line.discount ? colors.brandInk : line.sub ? colors.textTertiary : colors.textSecondary }}
          >
            {line.label}
          </Text>
          <Text
            variant={line.sub ? 'numMeta' : 'priceSm'}
            style={{ color: line.discount ? colors.brandInk : line.sub ? colors.textTertiary : colors.textSecondary }}
          >
            {line.amountLabel ?? `${line.discount ? '−' : ''}${formatRupees(Math.abs(line.amount))}`}
          </Text>
        </View>
      ))}

      <View style={[styles.rule, { borderTopColor: colors.borderSubtle, marginTop: space[1], paddingTop: space[3] }]}>
        <View style={styles.row}>
          <Text variant="title2" style={{ flex: 1 }}>
            {totalLabel}
          </Text>
          <Text variant="priceHero">{formatRupees(total)}</Text>
        </View>
      </View>

      {footnote ? (
        <Text variant="caption" color="tertiary" style={{ marginTop: space[2] }}>
          {footnote}
        </Text>
      ) : null}
    </View>
  );
}

/** A label/value pair for the event log under a receipt. */
export function ReceiptLine({ label, value, last }: { label: string; value: string; last?: boolean }) {
  const { colors, space } = useTheme();
  return (
    <View
      style={[
        styles.row,
        {
          paddingVertical: space[3] - 1,
          borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
          borderBottomColor: colors.borderSubtle,
        },
      ]}
    >
      <Text variant="body" color="tertiary" style={{ flex: 1 }}>
        {label}
      </Text>
      <Text variant="priceSm" style={{ color: colors.textPrimary }}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth },
});
