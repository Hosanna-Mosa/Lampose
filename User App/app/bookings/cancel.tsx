import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Icon, Text, TextField } from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import { cancellationReasons } from '@/data/bookings';
import { useTheme } from '@/context/ThemeContext';
import { ApiError, useBooking } from '@/services';
import { cancelBooking } from '@/services/api/bookings.api';
import { formatRupees } from '@/utils/money';

/**
 * Cancel a booking.
 *
 * ## The bank account
 *
 * A paid hotel stay is refunded IN FULL, by bank transfer, whoever cancelled.
 * So when the server says this booking is `refundable`, the form asks where
 * to send the money before the Cancel button is enabled — the one moment the
 * guest is certainly here to answer. Skipping it is allowed by the server
 * (the refund opens as "awaiting details" and the booking screen asks again),
 * but this screen does not offer the skip: asking now saves a second trip.
 *
 * The three fields are validated to the same shape the server enforces —
 * `refund.service.js#normaliseBank` — so a typo is caught before the tap,
 * not after the booking is already gone.
 *
 * ## Nothing here invents a figure
 *
 * The amount shown is what the server says was paid. A free booking (PG,
 * co-living, bachelor) has no refund block at all, because there is no money.
 */
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;

export default function CancelBooking() {
  const { colors, space, layout, mode, radius, touch } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { booking } = useBooking(id);

  const [reasonId, setReasonId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [touched, setTouched] = useState(false);

  const refundable = Boolean(booking?.refundable);
  const paid = booking?.totalAmount ?? 0;

  const bankErrors = useMemo(() => {
    const cleanAccount = accountNumber.replace(/\s/g, '');
    const cleanIfsc = ifsc.trim().toUpperCase();
    return {
      accountName: accountName.trim() ? null : 'Enter the account holder’s name.',
      accountNumber: /^\d{6,20}$/.test(cleanAccount) ? null : 'Enter the account number, digits only.',
      ifsc: IFSC.test(cleanIfsc) ? null : 'An IFSC looks like HDFC0001234.',
    };
  }, [accountName, accountNumber, ifsc]);

  const bankValid = !bankErrors.accountName && !bankErrors.accountNumber && !bankErrors.ifsc;
  const canSubmit = Boolean(id) && !submitting && (!refundable || bankValid);

  const submit = async () => {
    if (!id) return;
    setTouched(true);
    if (refundable && !bankValid) return;

    setSubmitting(true);
    setError(null);
    try {
      const reasonLabel = cancellationReasons.find((r) => r.id === reasonId)?.label;
      await cancelBooking(id, {
        reason: reasonLabel,
        bank: refundable
          ? {
            accountName: accountName.trim(),
            accountNumber: accountNumber.replace(/\s/g, ''),
            ifsc: ifsc.trim().toUpperCase(),
          }
          : undefined,
      });
      router.replace({ pathname: '/bookings/cancelled', params: { id } });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'NOT_CANCELLABLE') {
        setError('This booking can no longer be cancelled from the app — it has already started or ended.');
      } else {
        setError(err instanceof ApiError ? err.displayMessage : 'Could not cancel this booking. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <StandardHeader
        title="Cancel your booking"
        actionIcon="close"
        onAction={() => router.back()}
      />

      <ScrollView
        contentContainerStyle={{
          padding: layout.gutter,
          gap: space[6],
          paddingBottom: insets.bottom + space[8],
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: space[2] }}>
          <Text variant="display2">Why are you cancelling?</Text>
          <Text variant="body" color="secondary">
            Optional, but it helps the owner and it helps us.
          </Text>
        </View>

        <View style={{ gap: space[2] }}>
          {cancellationReasons.map((reason) => {
            const active = reason.id === reasonId;
            return (
              <Pressable
                key={reason.id}
                onPress={() => setReasonId(active ? null : reason.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                style={({ pressed }) => [
                  styles.reason,
                  {
                    minHeight: touch.min,
                    borderRadius: radius.button,
                    paddingHorizontal: space[4],
                    gap: space[3],
                    backgroundColor: active ? colors.surfaceSunken : colors.surface,
                    borderColor: active ? colors.brand : colors.border,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Text variant="body" style={styles.flex}>
                  {reason.label}
                </Text>
                {active ? <Icon name="check" size={20} color={colors.brandInk} /> : null}
              </Pressable>
            );
          })}
        </View>

        {refundable ? (
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
              <Text variant="title3">Where should we send your refund?</Text>
              <Text variant="body" color="secondary">
                You paid {formatRupees(paid)} for this stay. All of it comes back to you by bank
                transfer — we just need the account.
              </Text>
            </View>

            <TextField
              label="Account holder name"
              value={accountName}
              onChangeText={setAccountName}
              placeholder="Exactly as your bank has it"
              autoCapitalize="words"
              error={touched ? bankErrors.accountName ?? undefined : undefined}
            />
            <TextField
              label="Account number"
              value={accountNumber}
              onChangeText={(v) => setAccountNumber(v.replace(/[^\d\s]/g, ''))}
              keyboardType="number-pad"
              error={touched ? bankErrors.accountNumber ?? undefined : undefined}
            />
            <TextField
              label="IFSC code"
              value={ifsc}
              onChangeText={(v) => setIfsc(v.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              placeholder="HDFC0001234"
              autoCapitalize="characters"
              error={touched ? bankErrors.ifsc ?? undefined : undefined}
            />

            <Text variant="caption" color="tertiary">
              A person at Lampose makes the transfer and records the reference. It usually shows in
              your account within 3–5 working days of being sent.
            </Text>
          </View>
        ) : null}

        {error ? (
          <Text variant="body" color="danger">
            {error}
          </Text>
        ) : null}

        <View style={{ gap: space[2] }}>
          <Button
            label={refundable ? 'Cancel and request refund' : 'Cancel this booking'}
            variant="destructive"
            fullWidth
            loading={submitting}
            disabled={!canSubmit}
            onPress={submit}
          />
          <View style={{ marginTop: space[2] }}>
            <Button label="Keep my booking" variant="ghost" fullWidth onPress={() => router.back()} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  reason: { flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth },
});
