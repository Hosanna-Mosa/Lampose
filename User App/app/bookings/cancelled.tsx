import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Icon, Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';
import { useBooking } from '@/services';
import { formatRupees } from '@/utils/money';

/**
 * Screen 57 — cancellation confirmed.
 *
 * No celebration disc, no green tick the size of a fist. Someone has just lost
 * a place to live; the screen's job is to be calm and complete.
 *
 * ## Every figure here is the server's
 *
 * This used to print `cancellationPolicy` from `data/bookings.ts` — ₹26,499
 * paid, a ₹499 fee kept, reference CNL-4192, arriving 19 August — on every
 * cancellation, of every booking, for every student. Those numbers belonged
 * to a design fixture. On the screen a student reads to find out whether
 * their money is coming back, that is the worst place in the app to show an
 * invented figure.
 *
 * What is drawn now is the refund the cancel actually opened, read back from
 * the booking. A free booking has no refund block at all, because there is
 * no money — the rule is full refund, and nothing else, so there is no
 * "kept" line to draw either.
 */
export default function CancellationConfirmed() {
  const { colors, space, layout, mode, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { booking, refetch } = useBooking(id);

  const refund = booking?.refund ?? null;
  const awaitingDetails = refund?.status === 'awaiting_details';

  /* `useBooking` has no `isFetching` of its own, so the pull gesture tracks
     its own flag — same pattern as `addresses/index.tsx`. */
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingBottom: insets.bottom }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />

      <ScrollView
        contentContainerStyle={{
          padding: layout.gutter,
          gap: space[6],
          paddingTop: space[8],
          paddingBottom: space[8],
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />
        }
      >
        <View style={{ gap: space[3] }}>
          <View style={[styles.disc, { borderRadius: radius.pill, backgroundColor: colors.surfaceSunken }]}>
            <Icon name="check" size={20} color={colors.textSecondary} />
          </View>
          <Text variant="display1">Booking cancelled</Text>
          <Text variant="bodyLg" color="secondary">
            {booking?.propertyName ? `${booking.propertyName} has been told.` : 'The owner has been told.'}
            {' '}The room is free for someone else.
          </Text>
        </View>

        {refund ? (
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
            <Text variant="title3">Your refund</Text>
            <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.borderSubtle }} />

            <View style={[styles.lineRow, { gap: space[4] }]}>
              <View style={styles.flex}>
                <Text variant="bodyStrong">Coming back to you</Text>
                <Text variant="numMeta" color="tertiary">
                  In full. Lampose keeps nothing.
                </Text>
              </View>
              <Text variant="priceLg">{formatRupees(refund.amount)}</Text>
            </View>

            <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.borderSubtle }} />

            {awaitingDetails ? (
              <Text variant="body" color="secondary">
                We need to know which account to send it to. Add your bank details on the next
                screen and we will transfer it.
              </Text>
            ) : refund.bank ? (
              <Text variant="body" color="secondary">
                To {refund.bank.accountName} · {refund.bank.ifsc} · account ending {refund.bank.accountLast4}.
                A person at Lampose makes the transfer; it usually shows within 3–5 working days of
                being sent, and we will tell you when it is.
              </Text>
            ) : null}
          </View>
        ) : booking ? (
          <Text variant="body" color="secondary">
            Nothing was paid for this booking, so there is nothing to refund.
          </Text>
        ) : null}

        <View style={{ gap: space[2] }}>
          {refund ? (
            <Button
              label={awaitingDetails ? 'Add bank details for the refund' : 'Track this refund'}
              fullWidth
              onPress={() => router.replace({ pathname: '/bookings/refund', params: { id } })}
            />
          ) : null}
          <Button
            label="Find another place"
            variant={refund ? 'secondary' : 'primary'}
            fullWidth
            onPress={() => router.replace('/home')}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  disc: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  lineRow: { flexDirection: 'row', alignItems: 'center' },
});
