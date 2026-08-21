import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from './Text';
import { money, type TypeVariant } from '@/constants/tokens';
import { useTheme } from '@/context/ThemeContext';
import { formatDigits, formatRupees } from '@/utils/money';
import { useDepositMark } from '@/components/ui/DepositMark';

/**
 * LOCKED CONTRACT — do not fork this per screen.
 *
 * One component renders rent everywhere it appears: all three listing-card
 * variants, the detail screen and the sticky CTA bar. `size` changes the type
 * scale and the label position, and nothing else.
 *
 * This is locked because the card → detail transition flies the price block as
 * a shared element. If a screen hands back a bespoke price treatment — a moved
 * label, a stacked deposit line, a deposit in a different place — the shared
 * element has nothing stable to interpolate between and the transition is
 * dead. That failure would not surface until the listing screens are built,
 * weeks after the change that caused it.
 *
 * The deposit line belongs to this component. It is never a sibling, because
 * rent and deposit must never drift apart in the layout.
 *
 * Batch 3 extended it rather than forking it. Everything the four categories
 * needed — per-bed rent, a nightly rate with a monthly equivalent, a listing
 * with no deposit, a listing whose owner has not set a rent at all, and the
 * age of the quote — is a prop here. No category may reposition the deposit
 * line, and none of them do.
 */

export type RentSize = 'card' | 'detail' | 'bar' | 'compact';

/**
 * The flight scale between card and detail is priceLg / priceMd = 1.3 — a pure
 * transform on a clone, never an animated fontSize.
 *
 * `compact` is the map preview and is deliberately outside that pair: it never
 * carries a `sharedTag`, because the map sheet does not fly into detail.
 */
const SIZE_SPEC: Record<RentSize, { amount: TypeVariant; symbol: TypeVariant; unit: TypeVariant }> = {
  card: { amount: 'priceMd', symbol: 'priceSm', unit: 'numMeta' },
  // Stepped down one rung on the detail screen and the action bar. At priceLg
  // the rupee figure was the loudest thing on a screen that already leads with
  // it in three places — the headline, the bar, and the deposit beneath both.
  detail: { amount: 'priceMd', symbol: 'priceSm', unit: 'numMeta' },
  bar: { amount: 'priceMd', symbol: 'priceSm', unit: 'numMeta' },
  compact: { amount: 'priceSm', symbol: 'numMeta', unit: 'numMeta' },
};

export type RentDisplayProps = {
  /**
   * `null` means the owner has not set a rent. It renders as a sentence —
   * never ₹0 and never a dash. The app must not look like it is asserting a
   * price it does not have.
   */
  rent: number | null;
  /** Omit only where the deposit genuinely does not exist, never to save space. */
  deposit?: number;
  depositMonths?: number;
  size?: RentSize;
  /**
   * Identifies this instance to the shared-element transition. The card and
   * the detail screen pass the same tag for the same listing.
   */
  sharedTag?: string;
  /** Rent per bed rather than per room — hostels, dormitories, sharing types. */
  perBed?: boolean;
  /** A nightly rate. Dormitories only, and the monthly line comes with it. */
  perNight?: boolean;
  /**
   * The line under the price for a dormitory: "₹7,500/month · min 3 nights".
   * A nightly rate is never the whole story, and the monthly equivalent is
   * what a student actually compares against a PG.
   */
  secondaryLine?: string;
  /**
   * How old the quote is, already formatted by the server or by
   * `freshnessLabel`. A price is a snapshot, and this component says so.
   */
  freshness?: string;
  /**
   * The listing filled while the user was browsing. The price is struck rather
   * than removed — the card stays in the list, and the number it used to ask
   * is part of why the user was looking at it.
   */
  struck?: boolean;
  /** Hides both real nodes while the clone is in flight. */
  hidden?: boolean;
  /**
   * The figure is a computed total, not a rate — so it carries no unit suffix.
   *
   * A total wearing "/month" is a lie about what will be charged. This is the
   * PG and hostel stay-length case, where the student has chosen 7 days and the
   * number in the action bar is what they will actually pay. `secondaryLine`
   * carries what the total covers.
   *
   * Extended, not forked: the Batch 3 contract is that every price in the app
   * goes through this component, and a second "total display" beside it is
   * exactly the drift that contract exists to prevent.
   */
  total?: boolean;
};

export function RentDisplay({
  rent,
  deposit,
  depositMonths,
  size = 'card',
  sharedTag,
  perBed = false,
  perNight = false,
  secondaryLine,
  freshness,
  struck = false,
  hidden = false,
  total = false,
}: RentDisplayProps) {
  const { colors, space } = useTheme();
  const depositMark = useDepositMark();
  const spec = SIZE_SPEC[size];
  const short = size === 'compact';
  const strikeStyle = struck ? ({ textDecorationLine: 'line-through' } as const) : undefined;

  const unitLabel = total
    ? ''
    : perNight
    ? money.perNightSuffix
    : perBed
      ? short
        ? money.perBedSuffix
        : money.perBedSuffixLong
      : short
        ? money.rentSuffix
        : money.rentSuffixLong;

  const readable =
    rent === null
      ? 'Price on request. The owner has not set a rent.'
      : `${formatRupees(rent)} ${total ? 'in total' : perNight ? 'per night' : perBed ? 'per bed per month' : 'per month'}${
          deposit === undefined
            ? ''
            : deposit === 0
              ? ', no deposit'
              : `, plus ${formatRupees(deposit)} refundable deposit`
        }`;

  return (
    <View
      nativeID={sharedTag}
      accessible
      accessibilityLabel={readable}
      style={{ opacity: hidden ? 0 : 1, gap: space[1] }}
    >
      {rent === null ? (
        // A missing rent is a sentence, not a zero. Batch 3 is explicit that
        // the app must never look like it is asserting a price it does not
        // have, and "₹0" or "—" both read as an assertion.
        <View style={{ gap: 2 }}>
          <Text variant={size === 'card' || size === 'compact' ? 'bodyStrong' : 'title3'}>
            Price on request
          </Text>
          <Text variant="numMeta" color="tertiary">
            owner hasn&apos;t set a rent
          </Text>
        </View>
      ) : (
        <View style={styles.amountRow}>
          {/* The symbol is smaller and lighter than the number. The number is
              the fact; the currency is context. */}
          <Text variant={spec.symbol} color="secondary" style={strikeStyle}>
            {money.symbol}
          </Text>
          {/* The only 700-weight numeral on the surface. */}
          <Text variant={spec.amount} style={strikeStyle}>
            {formatDigits(rent)}
          </Text>
          <Text variant={spec.unit} color="secondary" style={strikeStyle}>
            {unitLabel}
          </Text>
        </View>
      )}

      {/* Hotels only: the monthly equivalent and the minimum stay. It sits
          under the nightly rate rather than beside it, because a student
          comparing a dorm against a PG is comparing months. */}
      {secondaryLine ? (
        <Text variant="numMeta" color="secondary">
          {secondaryLine}
        </Text>
      ) : null}

      {deposit !== undefined ? (
        deposit === 0 ? (
          // No deposit carries no underline: the underline marks money that is
          // coming back, and there is none here to mark.
          <Text variant="numMeta" color="secondary">
            no deposit
          </Text>
        ) : (
          // Never bold, never priced-coloured, and always carrying the dotted
          // caution underline — refundable money has to read differently from
          // money that is gone.
          <View style={styles.depositRow}>
            <Text
              variant={size === 'card' || size === 'compact' ? 'numMeta' : 'priceSm'}
              style={depositMark}
            >
              + {formatRupees(deposit)} {short ? 'dep' : 'deposit'}
            </Text>
            {depositMonths ? (
              <Text variant="numMeta" color="secondary">
                · {depositMonths} mo
              </Text>
            ) : null}
          </View>
        )
      ) : null}

      {freshness ? (
        <Text variant="numMeta" color="tertiary">
          {freshness}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  amountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  depositRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, flexWrap: 'wrap' },
});
