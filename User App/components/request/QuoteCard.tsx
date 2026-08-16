import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';
import { formatRupees } from '@/utils/money';
import { quoteTotal, refundable, type Quote } from '@/types/request';
import { useDepositMark } from '@/components/ui/DepositMark';

/**
 * The quote, and the two things that can happen to it.
 *
 * **It expires.** The quote does not vanish — the prices grey to 55% and a
 * banner replaces the timer. Nothing the user typed is lost, there is no
 * navigation and no modal, and there is no red: an expired quote is
 * housekeeping, not an error.
 *
 * **It re-prices.** Both numbers are shown, the old struck through, with the
 * change stated in words on the affected line only. Silently swapping a number
 * a user has already read destroys more trust than the price rise itself — and
 * a price *drop* is announced exactly the same way, in the same tone.
 */

export type QuoteCardProps = {
  quote: Quote;
  /** Prices grey out and the total is no longer actionable. */
  expired?: boolean;
};

export function QuoteCard({ quote, expired = false }: QuoteCardProps) {
  const { colors, space, radius } = useTheme();
  const depositMark = useDepositMark();

  const total = quoteTotal(quote);
  const back = refundable(quote);
  const realCost = total - back;

  const lines: {
    label: string;
    explainer: string;
    amount: number;
    payee: string;
    refundable?: boolean;
    discount?: boolean;
    was?: number;
  }[] = [
    {
      label: "First month's rent",
      explainer: `${quote.moveInLabel} onward, for the room you picked.`,
      amount: quote.rent,
      payee: 'to the owner',
      was: quote.previous?.rent,
    },
    {
      label: 'Security deposit',
      explainer: `${quote.depositMonths} months' rent, returned within 14 days of leaving.`,
      amount: quote.deposit,
      payee: 'to the owner',
      refundable: true,
      was: quote.previous?.deposit,
    },
    {
      label: 'Joining charge',
      explainer: 'One time · a deep clean and fresh bedding before you arrive.',
      amount: quote.joiningCharge,
      payee: 'to the owner',
    },
    {
      label: 'LAMPOSE fee',
      explainer: 'One time · covers holding the bed for you.',
      amount: quote.lamposeFee,
      payee: 'to LAMPOSE',
    },
  ];

  if (quote.discount > 0) {
    lines.push({
      label: 'First-booking discount',
      explainer: 'Applied automatically · no code needed.',
      amount: -quote.discount,
      payee: 'from LAMPOSE',
      discount: true,
    });
  }

  return (
    <View style={{ gap: space[3] }}>
      {expired ? (
        // Replaces the timer. Amber, never red — nothing has gone wrong.
        <View
          style={[
            styles.banner,
            {
              backgroundColor: colors.warning.tint,
              borderColor: colors.warning.border,
              borderRadius: radius.chip,
              padding: space[3],
              gap: space[2],
            },
          ]}
        >
          <Icon name="clock" size={20} color={colors.warning.ink} />
          <Text variant="caption" style={{ color: colors.warning.ink, flex: 1 }}>
            This quote has expired. Nothing you entered is lost — fetch today&apos;s price and carry on
            from here.
          </Text>
        </View>
      ) : null}

      <View
        style={{
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: radius.card,
          padding: space[4],
          gap: space[3],
          opacity: expired ? 0.55 : 1,
        }}
      >
        <View style={{ gap: 2 }}>
          <Text variant="title3">{quote.propertyName}</Text>
          <Text variant="numMeta" color="secondary">
            {quote.sharingLabel} · {quote.gender} · {quote.locality}
          </Text>
          <Text variant="numMeta" color="secondary">
            Moving in {quote.moveInLabel}
          </Text>
        </View>

        <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.borderSubtle }} />

        {lines.map((line) => (
          <View key={line.label} style={[styles.line, { gap: space[4] }]}>
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
                {line.payee}
              </Text>
              {/* Stated in words, on the affected line only. */}
              {line.was !== undefined && line.was !== line.amount ? (
                <Text variant="numMeta" style={{ color: colors.warning.ink }}>
                  {line.amount > line.was
                    ? `Up ${formatRupees(line.amount - line.was)} since you last looked.`
                    : `Down ${formatRupees(line.was - line.amount)} since you last looked.`}
                </Text>
              ) : null}
            </View>

            <View style={styles.amountCol}>
              {/* Both numbers, never a silent swap. */}
              {line.was !== undefined && line.was !== line.amount ? (
                <Text variant="numMeta" color="tertiary" style={styles.struck}>
                  {formatRupees(line.was)}
                </Text>
              ) : null}
              <Text
                variant="priceSm"
                style={
                  line.refundable
                    ? depositMark
                    : line.discount
                      ? { color: colors.success.ink }
                      : undefined
                }
              >
                {line.discount ? `−${formatRupees(Math.abs(line.amount))}` : formatRupees(line.amount)}
              </Text>
            </View>
          </View>
        ))}

        <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />

        <View style={[styles.line, { gap: space[4] }]}>
          <View style={styles.flex}>
            <Text variant="title3">Pay if she accepts</Text>
            <Text variant="caption" color="secondary">
              One payment. Nothing is charged today.
            </Text>
          </View>
          <Text variant="priceLg">{formatRupees(total)}</Text>
        </View>

        {/* The sentence worth fighting for. */}
        <View
          style={[
            styles.banner,
            { backgroundColor: colors.success.tint, borderRadius: radius.chip, padding: space[3], gap: space[2] },
          ]}
        >
          <Icon name="check" size={20} color={colors.success.base} />
          <Text variant="caption" style={{ color: colors.success.ink, flex: 1 }}>
            {formatRupees(back)} of this comes back to you. Your real cost to move in is{' '}
            {formatRupees(realCost)}.
          </Text>
        </View>

        <Text variant="numMeta" color="tertiary">
          {quote.quotedAtLabel}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  flex: { flex: 1 },
  line: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  amountCol: { alignItems: 'flex-end' },
  struck: { textDecorationLine: 'line-through' },
  banner: { flexDirection: 'row', alignItems: 'flex-start', borderWidth: StyleSheet.hairlineWidth, borderColor: 'transparent' },
});
