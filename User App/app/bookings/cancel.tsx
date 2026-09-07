import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Icon, Text } from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import { cancellationReasons } from '@/data/bookings';
import { useTheme } from '@/context/ThemeContext';
import { ApiError, useBooking } from '@/services';
import { cancelBooking } from '@/services/api/bookings.api';

/**
 * Cancelling a real booking, for real — `POST /customers/bookings/:id/cancel`.
 *
 * This used to end at `router.replace('/bookings/cancelled')` with nothing
 * sent anywhere, drawing a refund breakdown (a LAMPOSE fee, a UPI refund
 * destination, an arrival date) that has no backend behind it: rent on a stay
 * is paid to the owner directly, never held by Lampose, so there is no refund
 * to compute here. That block is gone; what is real is the reason — kept,
 * because it was already a good question — and the button, which now
 * actually cancels the booking the id in the URL names.
 *
 * Refused by the server once the owner has already checked the student in
 * (`NOT_CANCELLABLE`) — see the note on `cancelBooking` in
 * `customerBooking.controller.js`.
 */
export default function CancelBooking() {
  const { colors, space, layout, mode, radius, touch } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { booking, loading: loadingBooking } = useBooking(id);

  const [reasonId, setReasonId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!id) return;
    setSubmitting(true);
    setError(null);
    try {
      const reasonLabel = cancellationReasons.find((r) => r.id === reasonId)?.label;
      await cancelBooking(id, { reason: reasonLabel });
      router.replace('/bookings/cancelled');
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
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingBottom: insets.bottom }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <StandardHeader
        title="Cancel your booking"
        actionIcon="close"
        onAction={() => router.back()}
      />

      <ScrollView
        contentContainerStyle={{ padding: layout.gutter, gap: space[6], paddingBottom: space[8] }}
      >
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
          <Text variant="title3">
            {loadingBooking ? 'Your booking' : booking?.propertyName ?? 'Your booking'}
          </Text>
          <Text variant="body" color="secondary">
            The bed goes back on the market straight away, and the owner is told right away too.
            You would have to request it again.
          </Text>
          {booking?.paidAmount ? (
            <Text variant="caption" color="tertiary">
              Anything you paid the owner directly is between the two of you — Lampose has not held it.
            </Text>
          ) : null}
        </View>

        <View style={{ gap: space[3] }}>
          <View style={[styles.headRow, { gap: space[3] }]}>
            <Text variant="title3">Why are you leaving?</Text>
            <Text variant="caption" color="tertiary">
              optional
            </Text>
          </View>
          <Text variant="caption" color="secondary">
            It goes to us, not to the owner, and it does not change anything above.
          </Text>

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
        </View>

        {error ? (
          <Text variant="caption" color="danger">
            {error}
          </Text>
        ) : null}

        <View style={{ gap: space[2] }}>
          <Button
            label="Cancel this booking"
            variant="destructive"
            fullWidth
            loading={submitting}
            disabled={!id || submitting}
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
  headRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  reason: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  flex: { flex: 1 },
});
