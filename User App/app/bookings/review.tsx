import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Icon, Text, TextField } from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import { useTheme } from '@/context/ThemeContext';
import { ApiError, useBooking } from '@/services';
import { createBookingReview } from '@/services/api/bookings.api';

/**
 * "Rate your stay" — the write side of `partner_reviews`.
 *
 * Reached from the push notification a checkout sends (`kind:
 * 'booking.checkedOut'`, see `usePushRouting`) and, on the booking itself,
 * whenever `booking.reviewed` is false and `status` is `completed`.
 *
 * One review per stay, enforced by the server (`ALREADY_REVIEWED`), which is
 * why this refuses to re-render the form once the booking's own `reviewed`
 * flag — refetched after a successful submit — comes back true: a second
 * visit to this screen from an old notification tap shows a thank-you
 * instead of a form that can only fail.
 */
export default function RateStayScreen() {
  const { colors, space, layout, mode, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { booking, loading, refetch } = useBooking(id);

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!id || rating < 1) return;
    setSubmitting(true);
    setError(null);
    try {
      await createBookingReview(id, { rating, comment: comment.trim() });
      setDone(true);
      refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.displayMessage : 'Could not send that. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const alreadyReviewed = booking?.reviewed === true;
  const showThanks = done || alreadyReviewed;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingBottom: insets.bottom }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <StandardHeader title="Rate your stay" onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={{ padding: layout.gutter, gap: space[6], paddingBottom: space[8] }}
      >
        {loading ? (
          <Text variant="body" color="tertiary">
            Loading…
          </Text>
        ) : showThanks ? (
          <View style={{ alignItems: 'center', gap: space[3], paddingVertical: space[8] }}>
            <Icon name="check" size={28} color={colors.brand} />
            <Text variant="title3" style={styles.centred}>
              Thanks for the review
            </Text>
            <Text variant="body" color="secondary" style={styles.centred}>
              It helps other students, and it goes straight to {booking?.propertyName ?? 'the owner'}.
            </Text>
          </View>
        ) : (
          <>
            {booking?.propertyName ? (
              <Text variant="title3">{booking.propertyName}</Text>
            ) : null}

            <View style={{ gap: space[3] }}>
              <Text variant="label" color="secondary">
                How was it?
              </Text>
              <View style={styles.stars}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Pressable
                    key={n}
                    onPress={() => setRating(n)}
                    accessibilityRole="button"
                    accessibilityLabel={`${n} star${n === 1 ? '' : 's'}`}
                    hitSlop={8}
                  >
                    <Icon
                      name="star"
                      size={28}
                      color={n <= rating ? colors.brand : colors.borderInput}
                    />
                  </Pressable>
                ))}
              </View>
            </View>

            <TextField
              label="Tell other students about it"
              value={comment}
              onChangeText={setComment}
              multiline
              placeholder="The room, the owner, what surprised you…"
            />

            {error ? (
              <Text variant="caption" color="danger">
                {error}
              </Text>
            ) : null}

            <Button
              label="Submit review"
              variant="primary"
              fullWidth
              disabled={rating < 1 || submitting}
              loading={submitting}
              onPress={submit}
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  centred: { textAlign: 'center' },
  stars: { flexDirection: 'row', gap: 10 },
});
