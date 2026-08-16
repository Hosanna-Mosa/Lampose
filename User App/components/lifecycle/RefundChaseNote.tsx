import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';

/**
 * A named date, and explicit permission to chase us after it.
 *
 * This tiny block is the most load-bearing thing on either money-back screen.
 * "We'll process it soon" is precisely how refunds turn into support tickets:
 * with no date, every day after the second is a day the student suspects the
 * money is gone, and the only available action is to complain.
 *
 * Giving a date and a reference converts an anxious open loop into a closed
 * one. The student stops checking. And when the date does pass, they arrive at
 * support with the reference already in hand, which is cheaper for everyone
 * than the alternative.
 *
 * Two rules, both non-negotiable:
 *  · the date is absolute and named — "by 19 August", never "3–5 days"
 *  · the timing note says whose delay it is. A bank's four days blamed on us
 *    costs trust we did not need to spend.
 */

export type RefundChaseNoteProps = {
  /** "19 August". */
  arrivesByLabel: string;
  /** "3–5 working days — your bank's timing, not ours." */
  timingNote: string;
  /** "CNL-4192" or "RFD-4192-A". Quoted back to us when chasing. */
  reference: string;
  /** Already-happened half of the pair: "Refund started today 13 Aug, 9:41 am". */
  startedLabel?: string;
};

export function RefundChaseNote({
  arrivesByLabel,
  timingNote,
  reference,
  startedLabel,
}: RefundChaseNoteProps) {
  const { colors, space, radius } = useTheme();

  return (
    <View style={{ gap: space[3] }}>
      <View
        style={{
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: radius.card,
          padding: space[4],
          gap: space[4],
        }}
      >
        <Text variant="title3">When it arrives</Text>

        {startedLabel ? (
          <View style={[styles.row, { gap: space[3] }]}>
            <Icon name="check" size={20} color={colors.success.base} />
            <View style={styles.flex}>
              <Text variant="body">Refund started</Text>
              <Text variant="numMeta" color="tertiary">
                {startedLabel} · reference {reference}
              </Text>
            </View>
          </View>
        ) : null}

        <View style={[styles.row, { gap: space[3] }]}>
          <Icon name="clock" size={20} color={colors.textSecondary} />
          <View style={styles.flex}>
            {/* The named date. This is the whole component. */}
            <Text variant="bodyStrong">In your account by {arrivesByLabel}</Text>
            <Text variant="caption" color="secondary">
              {timingNote}
            </Text>
          </View>
        </View>
      </View>

      {/* Permission to chase, with the reference already supplied. */}
      <View
        style={[
          styles.row,
          {
            backgroundColor: colors.info.tint,
            borderRadius: radius.card,
            padding: space[4],
            gap: space[3],
          },
        ]}
      >
        <Icon name="alert" size={20} color={colors.info.base} />
        <Text variant="caption" style={{ color: colors.info.ink, flex: 1 }}>
          If it hasn’t arrived by {arrivesByLabel}, message us with {reference} and we’ll chase the
          bank. You don’t have to wait longer than that.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  flex: { flex: 1 },
});
