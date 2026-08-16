import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';
import { formatRupees } from '@/utils/money';
import type { RefundStageId, RefundState } from '@/types/booking';
import { useDepositMark } from '@/components/ui/DepositMark';

/**
 * Getting the deposit back.
 *
 * Every deduction names its evidence — "owner uploaded the bill", never
 * "adjustments". A ₹0 deduction is shown rather than hidden, because seeing
 * "damage: −₹0" is what makes the ₹740 believable.
 *
 * The step that matters most is Processing. It has to state a date and name
 * who is holding the money right now, and it may never say "soon".
 */

const STAGES: readonly { id: RefundStageId; label: string; note: string }[] = [
  { id: 'requested', label: 'Refund requested', note: 'We told the owner you have left.' },
  { id: 'inspected', label: 'Room checked', note: 'The owner has 3 days to raise anything owed.' },
  { id: 'processing', label: 'Processing', note: '' },
  { id: 'sent', label: 'Sent to your account', note: '' },
];

export type RefundStatusStepperProps = { refund: RefundState };

export function RefundStatusStepper({ refund }: RefundStatusStepperProps) {
  const { colors, space, radius } = useTheme();
  const depositMark = useDepositMark();

  const currentIndex = STAGES.findIndex((stage) => stage.id === refund.stage);

  const returning = refund.lines.reduce(
    (sum, line) => sum + (line.deduction ? -Math.abs(line.amount) : line.amount),
    0,
  );

  return (
    <View style={{ gap: space[4] }}>
      <View>
        {STAGES.map((stage, index) => {
          const done = index < currentIndex;
          const current = index === currentIndex;
          const failed = refund.failed && stage.id === 'sent' && current;

          const note =
            stage.id === 'processing' && current
              ? // A date and a name. Never "soon".
                `${refund.heldBy ?? 'Your bank'} is holding it right now. Expected by ${
                  refund.expectedBy ?? 'the date on your booking'
                }.`
              : stage.id === 'sent' && current
                ? failed
                  ? 'The transfer bounced back. Nothing is lost — we retry within one working day, or you can give us a different UPI ID.'
                  : `Sent to ${refund.destination ?? 'the account you paid from'}.`
                : stage.note;

          return (
            <View key={stage.id} style={styles.stageRow}>
              <View style={styles.rail}>
                <View
                  style={[
                    styles.disc,
                    {
                      borderRadius: radius.pill,
                      backgroundColor: failed
                        ? colors.danger.base
                        : done || current
                          ? colors.brand
                          : colors.surfaceSunken,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Icon
                    name={failed ? 'retry' : done ? 'check' : 'completed'}
                    size={16}
                    color={done || current || failed ? colors.onBrand : colors.textTertiary}
                  />
                </View>
                {index < STAGES.length - 1 ? (
                  <View
                    style={[
                      styles.connector,
                      { backgroundColor: index < currentIndex ? colors.brand : colors.border },
                    ]}
                  />
                ) : null}
              </View>

              <View style={[styles.flex, { paddingBottom: space[4], gap: 2 }]}>
                <Text
                  variant={current ? 'bodyStrong' : 'body'}
                  color={done || current ? 'primary' : 'tertiary'}
                >
                  {stage.label}
                </Text>
                {note ? (
                  <Text variant="caption" color={failed ? 'danger' : 'secondary'}>
                    {note}
                  </Text>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>

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
        <Text variant="title3">What you get back</Text>

        <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.borderSubtle }} />

        {refund.lines.map((line) => (
          <View key={line.label} style={[styles.lineRow, { gap: space[4] }]}>
            <View style={styles.flex}>
              <Text variant="body">{line.label}</Text>
              {/* The evidence is what makes the number believable. */}
              {line.evidence ? (
                <Text variant="numMeta" color="tertiary">
                  {line.evidence}
                </Text>
              ) : null}
            </View>
            <Text
              variant="priceSm"
              style={line.deduction ? { color: colors.textSecondary } : undefined}
            >
              {line.deduction ? `−${formatRupees(Math.abs(line.amount))}` : formatRupees(line.amount)}
            </Text>
          </View>
        ))}

        <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />

        <View style={[styles.lineRow, { gap: space[4] }]}>
          <View style={styles.flex}>
            <Text variant="bodyStrong">Coming back to you</Text>
            <Text variant="numMeta" color="tertiary">
              {refund.destination ?? 'To the UPI ID you paid from'}
            </Text>
          </View>
          <Text
            variant="priceLg"
            style={depositMark}
          >
            {formatRupees(returning)}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stageRow: { flexDirection: 'row', gap: 12 },
  rail: { alignItems: 'center', width: 28 },
  disc: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  connector: { width: 2, flex: 1, minHeight: 16 },
  flex: { flex: 1 },
  lineRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
});
