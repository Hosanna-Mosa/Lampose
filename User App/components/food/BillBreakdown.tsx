import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
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
  /** A summary row that opens and closes the lines whose `group` is its id —
      "GST & other charges", tapped to show what it is made of. */
  expandable?: boolean;
  /** Folded under the `expandable` line with this id; shown when it is open. */
  group?: string;
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
  const [open, setOpen] = useState<Record<string, boolean>>({});

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.card, padding: space[4] },
      ]}
    >
      {lines.map((line) => {
        if (line.group && !open[line.group]) return null;
        const sub = line.sub || !!line.group;
        const tone = line.discount ? colors.brandInk : sub ? colors.textTertiary : colors.textSecondary;
        const row = (
          <View style={[styles.row, { paddingBottom: space[2] - 1, paddingLeft: sub ? space[3] : 0 }]}>
            <View style={[styles.labelWrap, { gap: space[1] }]}>
              <Text
                variant={sub ? 'caption' : 'body'}
                numberOfLines={2}
                style={{
                  color: tone,
                  flexShrink: 1,
                  ...(line.expandable ? { textDecorationLine: 'underline' as const, textDecorationStyle: 'dashed' as const } : null),
                }}
              >
                {line.label}
              </Text>
              {line.expandable ? (
                <View style={{ transform: [{ rotate: open[line.id] ? '-90deg' : '90deg' }] }}>
                  <Icon name="chevronRight" size={14} color={colors.textTertiary} />
                </View>
              ) : null}
            </View>
            <Text variant={sub ? 'numMeta' : 'priceSm'} style={{ color: tone }}>
              {line.amountLabel ?? `${line.discount ? '−' : ''}${formatRupees(Math.abs(line.amount))}`}
            </Text>
          </View>
        );
        return line.expandable ? (
          <Pressable
            key={line.id}
            accessibilityRole="button"
            accessibilityState={{ expanded: !!open[line.id] }}
            accessibilityHint="Shows what this charge is made of"
            onPress={() => setOpen((current) => ({ ...current, [line.id]: !current[line.id] }))}
          >
            {row}
          </Pressable>
        ) : (
          <React.Fragment key={line.id}>{row}</React.Fragment>
        );
      })}

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
  labelWrap: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  rule: { borderTopWidth: StyleSheet.hairlineWidth },
});
