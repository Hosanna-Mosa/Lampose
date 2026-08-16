import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Icon, Text } from '@/components/ui';
import { StandardHeader, StateTemplate } from '@/components/shell';
import { CostBreakdown, CountdownTimer } from '@/components/booking';
import { PaymentMethodPicker } from '@/components/payment';
import { errorStates } from '@/constants/copy';
import { useTheme } from '@/context/ThemeContext';
import { findListing } from '@/data/listings';
import { formatRupees } from '@/utils/money';
import { PAYMENT_WINDOW_MINUTES } from '@/types/request';
import type { CostBreakdownData } from '@/types/booking';

/**
 * How to pay.
 *
 * The breakdown is EXPANDED by default here — nobody pays from a one-line
 * summary. Every line says who receives the money.
 *
 * The CTA carries the amount, always. A "Continue" button on a ₹26,499 payment
 * is how people come to feel tricked.
 */
export default function PaymentMethod() {
  const { colors, space, layout, mode, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const listing = useMemo(() => (id ? findListing(id) : undefined), [id]);
  const [method, setMethod] = useState<string | null>('gpay');

  const deadline = useMemo(
    () => new Date(Date.now() + PAYMENT_WINDOW_MINUTES * 60_000).toISOString(),
    [],
  );

  if (!listing || listing.rent === null) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        <StateTemplate copy={errorStates.notFound()} onPrimary={() => router.replace('/home')} />
      </View>
    );
  }

  const rent = listing.rent;
  const deposit = listing.deposit ?? 0;
  const total = rent + deposit + 1000 + 499 - 500;

  const cost: CostBreakdownData = {
    propertyLine: `${listing.name} · ${listing.sharingLabel ?? 'one bed'} · move in 5 Sep`,
    payNow: [
      {
        id: 'rent',
        label: "First month's rent",
        explainer: '1 Sep – 30 Sep, for the room you picked.',
        amount: rent,
        payee: 'owner',
      },
      {
        id: 'deposit',
        label: 'Security deposit',
        explainer: 'Held by the owner · back within 14 days of leaving.',
        amount: deposit,
        payee: 'owner',
        refundable: true,
      },
      {
        id: 'joining',
        label: 'Joining charge',
        explainer: 'One time · a deep clean and fresh bedding before you arrive.',
        amount: 1000,
        payee: 'owner',
      },
      {
        id: 'fee',
        label: 'LAMPOSE fee',
        explainer: 'One time · covers holding the bed for you.',
        amount: 499,
        payee: 'lampose',
      },
      {
        id: 'discount',
        label: 'First-booking discount',
        explainer: 'Applied automatically · no code needed.',
        amount: -500,
        payee: 'lampose',
        discount: true,
      },
    ],
    payAtMoveIn: [
      {
        id: 'maintenance',
        label: 'Maintenance',
        explainer: 'Monthly · cleaning, water and the common areas.',
        amount: 500,
        payee: 'owner',
        monthly: true,
      },
      {
        id: 'electricity',
        label: 'Electricity',
        explainer: 'Metered and split between roommates. Not a fixed charge.',
        amount: 0,
        payee: 'owner',
        monthly: true,
        estimate: { low: 600, high: 900, source: 'what residents paid last summer' },
      },
    ],
    quote: { validUntil: deadline, quotedLabel: 'quoted 4 min ago' },
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <StandardHeader
        title="Pay to confirm"
        subtitle={`LAM-4192 · ${listing.name}`}
        onBack={() => router.back()}
      />

      <ScrollView
        contentContainerStyle={{
          padding: layout.gutter,
          paddingBottom: insets.bottom + space[8],
          gap: space[5],
        }}
      >
        {/* The deadline stays on screen through the whole flow. */}
        <CountdownTimer
          context="payment"
          deadline={deadline}
          totalSeconds={PAYMENT_WINDOW_MINUTES * 60}
        />

        {/* Expanded by default. Nobody pays from a summary. */}
        <CostBreakdown data={cost} />

        <PaymentMethodPicker value={method} onChange={setMethod} />

        {/* The person tapping through the app is very often not the person with
            the money. Rather than pretend otherwise, this is a first-class
            action — the parent pays on their own phone, from their own bank,
            and the booking updates. */}
        <View
          style={[
            styles.share,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: radius.card,
              padding: space[4],
              gap: space[2],
            },
          ]}
        >
          <Text variant="title3">Someone else paying?</Text>
          <Text variant="body" color="secondary">
            Send them a link with this exact breakdown. They pay from their own phone and your booking
            updates — nothing here changes.
          </Text>
          <Button label="Send this to whoever is paying" variant="secondary" onPress={() => {}} fullWidth />
        </View>

        <View style={{ gap: space[2] }}>
          {/* The amount is on the button, always. */}
          <Button
            label={`Pay ${formatRupees(total)}`}
            disabled={!method}
            onPress={() => router.push({ pathname: '/pay/processing', params: { id: listing.id } })}
            fullWidth
          />
          <View style={[styles.row, { gap: space[2] }]}>
            <Icon name="check" size={16} color={colors.success.base} />
            <Text variant="caption" color="secondary" style={styles.flex}>
              {formatRupees(deposit)} of this comes back to you when you leave.
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
  share: { borderWidth: StyleSheet.hairlineWidth },
});
