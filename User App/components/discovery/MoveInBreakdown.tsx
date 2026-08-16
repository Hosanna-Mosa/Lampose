import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';
import { formatRupees } from '@/utils/money';
import { useDepositMark } from '@/components/ui/DepositMark';

export type MoveInBreakdownProps = {
  firstMonthRent: number;
  deposit: number;
  /** Anything else the owner charges up front, already itemised by the server. */
  extras?: readonly { label: string; amount: number; refundable?: boolean }[];
  /** "quoted 4 min ago · valid 2h" — the quote's age and its validity window. */
  quoteNote?: string;
};

/**
 * The move-in total — only ever as a breakdown, never as a bare sum.
 *
 * This exists because a student does need to know what leaves their account on
 * day one. What it must never become is a single number that replaces rent and
 * deposit, because they are different kinds of money: rent is a monthly
 * constraint and the deposit is a capital one, and a student with ₹20,000
 * saved hits a wall on the second that has nothing to do with the first.
 *
 * It also never feeds filtering. The two ceilings stay independent and are
 * never summed — that rule is upstream of this component and this component
 * does not get to soften it.
 */
export function MoveInBreakdown({ firstMonthRent, deposit, extras = [], quoteNote }: MoveInBreakdownProps) {
  const { colors, space, radius } = useTheme();
  const depositMark = useDepositMark();

  const rows = [
    { label: 'First month', amount: firstMonthRent, refundable: false },
    { label: 'Deposit', amount: deposit, refundable: true },
    ...extras.map((extra) => ({ label: extra.label, amount: extra.amount, refundable: Boolean(extra.refundable) })),
  ];

  const total = rows.reduce((sum, row) => sum + row.amount, 0);

  return (
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
      <View style={styles.totalRow}>
        <Text variant="title3">Total to move in</Text>
        <Text variant="priceLg">{formatRupees(total)}</Text>
      </View>

      <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.borderSubtle }} />

      <View style={{ gap: space[2] }}>
        {rows.map((row) => (
          <View key={row.label} style={styles.lineRow}>
            {/* "First month's rent · refundable" is a long label against a
                numeric value that will not wrap. The label flexes. */}
            <Text variant="caption" color="secondary" style={styles.flexLabel}>
              {row.label}
              {row.refundable ? ' · refundable' : ''}
            </Text>
            <Text
              variant="priceSm"
              style={
                row.refundable
                  ? depositMark
                  : undefined
              }
            >
              {formatRupees(row.amount)}
            </Text>
          </View>
        ))}
      </View>

      {quoteNote ? (
        <Text variant="numMeta" color="tertiary">
          {quoteNote}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  totalRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  lineRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  flexLabel: { flex: 1 },
});
