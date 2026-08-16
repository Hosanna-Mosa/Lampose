import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Icon, Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';
import { formatRupees } from '@/utils/money';
import type { PastStay } from '@/types/booking';

/**
 * A finished stay.
 *
 * The design decision that makes this screen worth building: **it carries
 * today's price and availability, not only what was paid.** A returning
 * student's real question is not "what did I pay in 2026" — they remember. It
 * is "can I go back, and what does it cost now". History that only shows the
 * past cannot answer the question it is opened to answer.
 *
 * The deposit outcome is stated on every card, in words rather than a figure:
 * "returned in full" or "₹1,200 kept for unpaid electricity". That is what a
 * student actually remembers about a place a year later, and it is the single
 * most useful thing to show someone deciding whether to go back.
 *
 * A delisted place keeps its card. Removing it would silently rewrite someone's
 * history, and the receipts hanging off it still have to be reachable.
 */

export type PastStayCardProps = {
  stay: PastStay;
  onRebook?: () => void;
  onReceipts?: () => void;
};

export function PastStayCard({ stay, onRebook, onReceipts }: PastStayCardProps) {
  const { colors, space, radius } = useTheme();

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
      <View style={[styles.headRow, { gap: space[3] }]}>
        {/* The two-letter mark, as the carousels draw it. Never colour alone. */}
        <View
          style={[
            styles.mark,
            { backgroundColor: colors.category[stay.category].tint, borderRadius: radius.chip },
          ]}
        >
          <Text variant="numMeta" style={{ color: colors.category[stay.category].ink }}>
            {colors.category[stay.category].code}
          </Text>
        </View>
        <Text variant="numMeta" color="tertiary">
          {stay.reference}
        </Text>
      </View>

      <View style={{ gap: space[1] }}>
        <Text variant="title3">{stay.propertyName}</Text>
        <Text variant="numMeta" color="secondary">
          {stay.periodLabel} · {stay.monthsStayed} months
        </Text>
        {/* What it cost, and how the deposit actually ended. */}
        <Text variant="numMeta" color="secondary">
          {stay.sharingLabel} · {formatRupees(stay.rentPaid)}/mo · {stay.depositOutcome}
        </Text>
      </View>

      {/* Today, not then. This block is the point of the screen. */}
      {stay.stillListed ? (
        <View
          style={{
            backgroundColor: colors.surfaceSunken,
            borderRadius: radius.chip,
            padding: space[3],
            gap: space[2],
          }}
        >
          <Text variant="caption" color="secondary">
            Rent is {formatRupees(stay.currentRent ?? stay.rentPaid)} now
            {stay.currentAvailability ? `, and ${stay.currentAvailability}` : ''}.
            {stay.ownerStillRuns && stay.ownerName
              ? ` ${stay.ownerName} still runs it.`
              : ' It has changed hands since you left.'}
          </Text>
          <Button label="Book here again" size="sm" variant="secondary" onPress={onRebook} />
        </View>
      ) : (
        <Text variant="caption" color="tertiary">
          This place is no longer listed on LAMPOSE. Your receipts stay here either way.
        </Text>
      )}

      <View style={[styles.actions, { gap: space[2] }]}>
        <Button label="Receipts" size="sm" variant="ghost" onPress={onReceipts} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mark: { minWidth: 28, paddingHorizontal: 6, paddingVertical: 3, alignItems: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
});
