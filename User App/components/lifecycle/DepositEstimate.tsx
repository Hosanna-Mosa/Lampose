import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';
import { formatRupees } from '@/utils/money';
import type { DepositEstimateLine } from '@/types/booking';
import { useDepositMark } from '@/components/ui/DepositMark';

/**
 * What you should get back, before anyone has measured anything.
 *
 * The ≈ is deliberate and it is the entire design. The final figure depends on
 * a meter reading and a room inspection that both happen on the last day, with
 * the student present. Typesetting an estimate like a settled amount is how a
 * product manufactures a dispute: the student remembers the exact number they
 * were shown and treats any shortfall as theft.
 *
 * So: the header says "an estimate, not a promise", every uncertain line is
 * badged `est.`, and the total wears a ≈. A ₹0 deduction is shown rather than
 * hidden — seeing "Damage −₹0" is what makes the electricity figure above it
 * believable.
 */

export type DepositEstimateProps = {
  depositPaid: number;
  lines: readonly DepositEstimateLine[];
  /** "Within 14 days of 13 Sep". */
  settlementWindowLabel: string;
  /** Overrides the default explanation of why the figure is approximate. */
  note?: string;
};

export function DepositEstimate({
  depositPaid,
  lines,
  settlementWindowLabel,
  note,
}: DepositEstimateProps) {
  const { colors, space, radius } = useTheme();
  const depositMark = useDepositMark();

  const total = lines.reduce((sum, line) => sum + line.amount, depositPaid);
  const approximate = lines.some((line) => line.estimate);

  return (
    <View style={{ gap: space[3] }}>
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
        <View style={[styles.headRow, { gap: space[3] }]}>
          <Text variant="title3">Deposit estimate</Text>
          <Text variant="caption" color="tertiary">
            an estimate, not a promise
          </Text>
        </View>

        <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.borderSubtle }} />

        <View style={[styles.lineRow, { gap: space[4] }]}>
          <Text variant="body" style={styles.flex}>
            Deposit paid
          </Text>
          <Text variant="priceSm">{formatRupees(depositPaid)}</Text>
        </View>

        {lines.map((line) => (
          <View key={line.label} style={[styles.lineRow, { gap: space[4] }]}>
            <View style={styles.flex}>
              <Text variant="body">{line.label}</Text>
              {/* Who decides this, and when. A deduction with no named source
                  is the one a student will argue about. */}
              <Text variant="numMeta" color="tertiary">
                {line.detail}
              </Text>
            </View>
            <Text variant="priceSm" color={line.amount < 0 ? 'secondary' : 'primary'}>
              {line.amount < 0 ? `−${formatRupees(Math.abs(line.amount))}` : formatRupees(0)}
              {line.estimate ? ' est.' : ''}
            </Text>
          </View>
        ))}

        <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />

        <View style={[styles.lineRow, { gap: space[4] }]}>
          <View style={styles.flex}>
            <Text variant="bodyStrong">You should get back</Text>
            <Text variant="numMeta" color="tertiary">
              {settlementWindowLabel}
            </Text>
          </View>
          <Text
            variant="priceLg"
            style={depositMark}
          >
            {approximate ? '≈' : ''}
            {formatRupees(total)}
          </Text>
        </View>
      </View>

      <Text variant="caption" color="secondary">
        {note ??
          'The ≈ is deliberate. The final figure depends on your last meter reading and the room inspection — both happen on your last day, with you there.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  lineRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  flex: { flex: 1 },
});
