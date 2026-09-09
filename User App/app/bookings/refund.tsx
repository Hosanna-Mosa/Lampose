import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Text, TextField } from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import { RefundStatusStepper } from '@/components/booking';
import { useTheme } from '@/context/ThemeContext';
import { ApiError, useBooking } from '@/services';
import { submitRefundDetails, type CustomerRefund } from '@/services/api/bookings.api';
import type { RefundStageId, RefundState } from '@/types/booking';
import { formatRupees } from '@/utils/money';

/**
 * Where a cancelled booking's money is.
 *
 * ## This used to be a fixture
 *
 * `refundInProgress` in `data/bookings.ts` — a ₹17,000 deposit with a ₹740
 * electricity deduction, "expected 19 September", held by "our payments
 * partner" — rendered for every booking, whatever had actually happened. It
 * was a design specimen for a DEPOSIT refund, which is a different product
 * from the one this screen now shows.
 *
 * ## What it shows now
 *
 * The refund the server opened when the booking was cancelled: the full
 * amount paid, where it is going, whether it has been sent, and the reference
 * once it has. Four stages, all of which are true things that happen:
 *
 *   requested   the booking was cancelled and the money is owed
 *   inspected   ("Account received") the guest has said where to send it
 *   processing  a person at Lampose is making the transfer
 *   sent        transferred, with the bank reference
 *
 * `inspected` keeps its id because `RefundStageId` is a closed union shared
 * with the deposit stepper; its LABEL is what changes, via the `stages` prop.
 *
 * ## The bank form
 *
 * Reached here rather than on the cancel screen when the OWNER cancelled —
 * the guest was not at a form to be asked — or when they skipped it. Until
 * they answer, the refund cannot be paid, and the screen says so plainly
 * instead of showing a stage that is not moving.
 */
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;

const STAGES: readonly { id: RefundStageId; label: string; note: string }[] = [
  { id: 'requested', label: 'Booking cancelled', note: 'The full amount you paid is owed back to you.' },
  { id: 'inspected', label: 'Account received', note: 'We know where to send it.' },
  { id: 'processing', label: 'Being transferred', note: 'A person at Lampose is making the transfer.' },
  { id: 'sent', label: 'Sent to your account', note: '' },
];

const stageFor = (refund: CustomerRefund): RefundStageId => {
  switch (refund.status) {
    case 'awaiting_details': return 'requested';
    case 'pending': return 'inspected';
    case 'paid': return 'sent';
    case 'rejected': return 'processing';
    default: return 'requested';
  }
};

export default function CancellationRefund() {
  const { colors, space, layout, mode, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { booking, loading, refetch } = useBooking(id);

  const refund = booking?.refund ?? null;

  /* No `isFetching` on this hook, so the pull gesture tracks its own flag.
     The bank-details fields below are typed fresh, not seeded from the
     fetch, so a refresh underneath them never discards a draft. */
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errors = useMemo(() => ({
    accountName: accountName.trim() ? null : 'Enter the account holder’s name.',
    accountNumber: /^\d{6,20}$/.test(accountNumber.replace(/\s/g, '')) ? null : 'Enter the account number, digits only.',
    ifsc: IFSC.test(ifsc.trim().toUpperCase()) ? null : 'An IFSC looks like HDFC0001234.',
  }), [accountName, accountNumber, ifsc]);
  const valid = !errors.accountName && !errors.accountNumber && !errors.ifsc;

  const save = async () => {
    if (!id) return;
    setTouched(true);
    if (!valid) return;
    setSaving(true);
    setError(null);
    try {
      await submitRefundDetails(id, {
        accountName: accountName.trim(),
        accountNumber: accountNumber.replace(/\s/g, ''),
        ifsc: ifsc.trim().toUpperCase(),
      });
      await refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.displayMessage : 'Could not save those details. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const state: RefundState | null = refund
    ? {
      stage: stageFor(refund),
      lines: [{ label: 'Paid for the stay', amount: refund.amount }],
      heldBy: refund.status === 'paid' ? undefined : 'Lampose',
      destination: refund.bank
        ? `${refund.bank.ifsc} · account ending ${refund.bank.accountLast4}`
        : 'Waiting for your bank details',
      failed: refund.status === 'rejected',
    }
    : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingBottom: insets.bottom }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <StandardHeader title="Your refund" actionIcon="close" onAction={() => router.back()} />

      <ScrollView
        contentContainerStyle={{ padding: layout.gutter, gap: space[6], paddingBottom: space[8] }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />
        }
      >
        {!booking && loading ? (
          <Text variant="body" color="secondary">Loading…</Text>
        ) : !refund ? (
          <View style={{ gap: space[2] }}>
            <Text variant="display2">No refund on this booking</Text>
            <Text variant="body" color="secondary">
              Nothing was paid through Lampose for this stay, so there is nothing to send back.
            </Text>
          </View>
        ) : (
          <>
            <View style={{ gap: space[1] }}>
              <Text variant="display2">{formatRupees(refund.amount)}</Text>
              <Text variant="body" color="secondary">
                {refund.status === 'paid'
                  ? 'Sent to your account.'
                  : refund.status === 'rejected'
                    ? 'This refund was not sent.'
                    : 'Coming back to you in full. Lampose keeps nothing.'}
              </Text>
            </View>

            {state ? <RefundStatusStepper refund={state} stages={STAGES} /> : null}

            {refund.status === 'awaiting_details' ? (
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
                <View style={{ gap: space[1] }}>
                  <Text variant="title3">Where should we send it?</Text>
                  <Text variant="body" color="secondary">
                    We cannot transfer the money until we have an account for it.
                  </Text>
                </View>
                <TextField
                  label="Account holder name"
                  value={accountName}
                  onChangeText={setAccountName}
                  placeholder="Exactly as your bank has it"
                  autoCapitalize="words"
                  error={touched ? errors.accountName ?? undefined : undefined}
                />
                <TextField
                  label="Account number"
                  value={accountNumber}
                  onChangeText={(v) => setAccountNumber(v.replace(/[^\d\s]/g, ''))}
                  keyboardType="number-pad"
                  error={touched ? errors.accountNumber ?? undefined : undefined}
                />
                <TextField
                  label="IFSC code"
                  value={ifsc}
                  onChangeText={(v) => setIfsc(v.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  placeholder="HDFC0001234"
                  autoCapitalize="characters"
                  error={touched ? errors.ifsc ?? undefined : undefined}
                />
                {error ? <Text variant="body" color="danger">{error}</Text> : null}
                <Button label="Save bank details" fullWidth loading={saving} disabled={saving} onPress={save} />
              </View>
            ) : null}

            {refund.status === 'paid' ? (
              <View
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderRadius: radius.card,
                  padding: space[4],
                  gap: space[2],
                }}
              >
                <Text variant="title3">When it arrives</Text>
                <Text variant="body" color="secondary">
                  Bank transfers usually show within 3–5 working days of being sent. If it has not
                  appeared by then, give your bank this reference.
                </Text>
                <Text variant="numMeta">{refund.reference ? `Ref ${refund.reference}` : 'No reference recorded'}</Text>
              </View>
            ) : null}

            {refund.status === 'rejected' && refund.rejectedReason ? (
              <View
                style={{
                  backgroundColor: colors.danger.tint,
                  borderColor: colors.danger.border,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderRadius: radius.card,
                  padding: space[4],
                  gap: space[1],
                }}
              >
                <Text variant="bodyStrong" color="danger">Why</Text>
                <Text variant="body" color="danger">{refund.rejectedReason}</Text>
              </View>
            ) : null}

            <Button
              label="Get help with this refund"
              variant="secondary"
              fullWidth
              onPress={() => router.push('/support/new' as never)}
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}
