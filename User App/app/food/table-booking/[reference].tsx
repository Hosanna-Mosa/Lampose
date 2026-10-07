import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { Button, Icon, Text, useAlert } from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import {
  FoodEmptyState,
  FoodMenuSkeleton,
  ReceiptLine,
  TableBookingStatusChip,
  tableBookingStatus,
} from '@/components/food';
import { foodHref } from '@/components/food/routes';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { ApiError } from '@/services/api/client';
import { cancelTableBooking } from '@/services/api/tableBookings.api';
import { useRememberTableBooking, useTableBooking } from '@/services/hooks/useTableBookings';
import { AREA_LABEL, SEATING_LABEL, type TableBooking } from '@/types/food';

/** "4:59" — minutes and seconds left, never negative. */
function countdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

const guestsLabel = (n: number) => `${n} ${n === 1 ? 'guest' : 'guests'}`;

/**
 * The head of the screen: what has happened to this booking, in one line and
 * one sentence. Every status has its own words — "cancelled" by the diner, by
 * the restaurant and by the system are three different pieces of news.
 */
function headlineOf(booking: TableBooking, msLeft: number): { title: string; body: string } {
  const name = booking.restaurantName;
  switch (booking.status) {
    case 'requested':
      return {
        title: 'Waiting for the restaurant',
        body: msLeft > 0
          ? `${name} has your request. We will tell you the moment they answer.`
          : 'Their time to answer is up. Checking for an answer…',
      };
    case 'confirmed':
      return {
        title: 'Table confirmed',
        /* "Today" and "Tomorrow" read inside a sentence; a date needs its "on". */
        body: `See you ${booking.dayLabel === 'Today' || booking.dayLabel === 'Tomorrow'
          ? booking.dayLabel.toLowerCase()
          : `on ${booking.dayLabel}`} at ${booking.timeLabel}. Please arrive on time.`,
      };
    case 'declined':
      return {
        title: `${name} could not take this booking`,
        /* The restaurant's own words, quoted rather than reworded. */
        body: booking.reason
          ? `They said: “${booking.reason.replace(/[.!\s]+$/, '')}”. Try another time, or another restaurant.`
          : 'Try another time, or another restaurant.',
      };
    case 'expired':
      return {
        title: 'No answer from the restaurant',
        body: `${name} did not answer in time, so nothing is booked. Try another time.`,
      };
    case 'cancelled':
      return {
        title: booking.cancelledBy === 'customer'
          ? 'You cancelled this booking'
          : booking.cancelledBy === 'restaurant'
            ? `${name} cancelled your table`
            : 'This booking was cancelled',
        body: booking.reason
          ? booking.cancelledBy === 'customer' ? `Your reason: ${booking.reason}` : booking.reason
          : booking.cancelledBy === 'customer'
            ? 'The restaurant has been told.'
            : 'Nothing is booked. Try another time.',
      };
    case 'arrived':
      return { title: 'You are at your table', body: 'Enjoy your meal.' };
    case 'no_show':
      return {
        title: 'Marked as a no-show',
        body: `${name} marked this table as not turned up. If that is wrong, tell us from Help & support.`,
      };
  }
}

/**
 * One table booking — waiting, confirmed, or over.
 *
 * Like an order, it is one screen that ages: while the restaurant has the
 * request a live countdown to `respondBy` is the whole head; once it answers,
 * the answer is. Every status draws from the server's own word for it, which
 * already accounts for a request whose window has closed (`expired`).
 *
 * ## Staying current
 *
 * The socket (`table_booking_updated`), a ten-second poll while it is
 * `requested`, and a re-read every time the screen comes back into focus —
 * see `useTableBooking`. The countdown itself is local: the clock is only used
 * to draw it, never to decide the status.
 *
 * ## Cancel is the server's to allow
 *
 * The button is drawn only when `canCancel` says it will be taken — a request
 * any time before the sitting, a confirmed table until half an hour before.
 * After that the caption says it is too close to cancel here.
 */
export default function TableBookingScreen() {
  const { colors, space, layout, radius, mode } = useTheme();
  const router = useRouter();
  const { reference } = useLocalSearchParams<{ reference: string }>();
  const { status: authStatus, requireSignIn } = useAuth();
  const signedIn = authStatus === 'signedIn';
  const { alert, confirm } = useAlert();
  const remember = useRememberTableBooking();
  const { booking, loading, error, refetch } = useTableBooking(signedIn ? reference : null);

  const [cancelling, setCancelling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  /* Every return to this screen re-reads it — the first focus is the
     query's own first read, so it is skipped. */
  const focusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedOnce.current) void refetch();
      focusedOnce.current = true;
    }, [refetch]),
  );

  /* The countdown's clock, ticking only while there is something to count. */
  const waiting = booking?.status === 'requested';
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!waiting) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [waiting]);
  const msLeft = booking ? new Date(booking.respondBy).getTime() - now : 0;

  /* The moment the window closes, ask once rather than waiting out the poll:
     the server will already be calling it expired. */
  const askedAtZero = useRef(false);
  useEffect(() => {
    if (!waiting) {
      askedAtZero.current = false;
      return;
    }
    if (msLeft <= 0 && !askedAtZero.current) {
      askedAtZero.current = true;
      void refetch();
    }
  }, [waiting, msLeft, refetch]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/home'));

  const onRefresh = () => {
    setRefreshing(true);
    void refetch().finally(() => setRefreshing(false));
  };

  const cancel = async () => {
    if (!booking || cancelling) return;
    const ok = await confirm({
      title: 'Cancel this booking?',
      message: `${booking.dayLabel} at ${booking.timeLabel}, ${guestsLabel(booking.partySize)}. ${booking.restaurantName} will be told.`,
      confirmLabel: 'Cancel booking',
      cancelLabel: 'Keep it',
      destructive: true,
    });
    if (!ok) return;
    setCancelling(true);
    try {
      remember(await cancelTableBooking(booking.reference));
    } catch (err) {
      void alert({
        title: 'We could not cancel that',
        message: err instanceof ApiError ? err.displayMessage : (err as Error)?.message || 'Please try again.',
        tone: 'error',
      });
      void refetch();
    } finally {
      setCancelling(false);
    }
  };

  /* ── Nothing to draw yet ──────────────────────────────────────────── */

  /* A cold start from a push lands here while the session is still being
     read back — that is a wait, not a guest. */
  if (!signedIn) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        <StandardHeader title="Table booking" onBack={back} />
        {authStatus === 'hydrating' ? (
          <FoodMenuSkeleton />
        ) : (
          <FoodEmptyState
            glyph="dining"
            title="Sign in to see this booking"
            body="Table bookings live with the account that made them."
            primaryLabel="Sign in"
            onPrimary={() => requireSignIn(() => {})}
          />
        )}
      </View>
    );
  }

  if (!booking) {
    const gone = error instanceof ApiError && error.status === 404;
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        <StandardHeader title="Table booking" onBack={back} />
        {loading ? (
          <FoodMenuSkeleton />
        ) : (
          <FoodEmptyState
            glyph="dining"
            tone={gone ? 'neutral' : 'problem'}
            title={gone ? 'We cannot find that booking' : 'Could not load this booking'}
            body={
              gone
                ? 'The link may be old, or the booking is on a different account. Your table bookings are under Orders in Food.'
                : 'This is usually the connection. Your booking is not affected.'
            }
            primaryLabel="Try again"
            onPrimary={() => { void refetch(); }}
            secondaryLabel="Back"
            onSecondary={back}
          />
        )}
      </View>
    );
  }

  const tone = colors[tableBookingStatus(booking.status).tone];
  const head = headlineOf(booking, msLeft);
  const preference = [
    booking.preference.seating ? SEATING_LABEL[booking.preference.seating] : null,
    booking.preference.area ? AREA_LABEL[booking.preference.area] : null,
  ].filter(Boolean).join(', ');
  const finished = !['requested', 'confirmed'].includes(booking.status);

  /* Said even when the button is gone, so "where did Cancel go" is answered
     on the screen it is asked from. */
  const cancelHint = booking.canCancel
    ? booking.status === 'requested'
      ? 'Free to cancel any time before your table.'
      : 'You can cancel up to 30 minutes before your time.'
    : booking.status === 'confirmed'
      ? 'It is too close to your time to cancel here.'
      : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <StandardHeader title="Table booking" subtitle={booking.restaurantName} onBack={back} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: layout.gutter, paddingBottom: space[8] * 2, gap: space[3] }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      >
        {/* What has happened — coloured by meaning, and never by colour alone:
            the glyph and the words say the same thing. */}
        <View
          style={[
            styles.head,
            {
              backgroundColor: tone.tint,
              borderColor: tone.border,
              borderRadius: radius.card,
              padding: space[4],
              gap: space[2],
            },
          ]}
        >
          <View style={styles.headRow}>
            <TableBookingStatusChip status={booking.status} />
            <Text variant="numMeta" style={{ color: tone.ink }}>
              {booking.reference}
            </Text>
          </View>
          <Text variant="display2" style={{ color: tone.ink }}>
            {head.title}
          </Text>
          <Text variant="body" style={{ color: tone.ink }}>
            {head.body}
          </Text>
          {booking.status === 'requested' && msLeft > 0 ? (
            <View style={[styles.countdown, { gap: space[2], marginTop: space[1] }]}>
              <Text
                variant="priceHero"
                accessibilityLabel={`${countdown(msLeft)} left to confirm`}
                style={{ color: tone.ink }}
              >
                {countdown(msLeft)}
              </Text>
              <Text variant="caption" style={{ color: tone.ink }}>
                left to confirm
              </Text>
            </View>
          ) : null}
        </View>

        {/* The booking itself. */}
        <View
          style={[
            styles.group,
            { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.card, paddingHorizontal: space[3] },
          ]}
        >
          <ReceiptLine label="Reference" value={booking.reference} />
          <ReceiptLine label="When" value={`${booking.dayLabel} · ${booking.timeLabel}`} />
          <ReceiptLine label="Guests" value={guestsLabel(booking.partySize)} />
          {booking.tableNumber ? (
            <ReceiptLine
              label="Table"
              value={`${booking.tableNumber} · seats ${booking.tableSeats ?? booking.partySize}${booking.tableChosen ? ' · your pick' : ''}`}
            />
          ) : booking.tableSeats ? (
            <ReceiptLine label="Table" value={`Seats ${booking.tableSeats}`} />
          ) : null}
          {preference ? <ReceiptLine label="Preference" value={`${preference} (on request)`} /> : null}
          <ReceiptLine
            label={booking.forSomeoneElse ? 'Booked for' : 'Name'}
            value={booking.forSomeoneElse && booking.guestPhone
              ? `${booking.guestName} · ${booking.guestPhone}`
              : booking.guestName || '—'}
            last={!booking.note}
          />
          {booking.note ? (
            <View style={{ paddingVertical: space[3] - 1, gap: 2 }}>
              <Text variant="body" color="tertiary">
                Note
              </Text>
              <Text variant="body">{booking.note}</Text>
            </View>
          ) : null}
        </View>

        {/* The restaurant, and a way to reach it. */}
        <View
          style={[
            styles.group,
            { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.card, padding: space[3], gap: space[3] },
          ]}
        >
          <Pressable
            onPress={() => booking.restaurantId && router.push(foodHref.kitchen(booking.restaurantId))}
            accessibilityRole="button"
            accessibilityLabel={`Open ${booking.restaurantName}`}
            style={styles.restaurantRow}
          >
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text variant="title3" numberOfLines={1}>
                {booking.restaurantName}
              </Text>
              {booking.restaurantAddress ? (
                <Text variant="caption" color="secondary">
                  {booking.restaurantAddress}
                </Text>
              ) : null}
            </View>
            <Icon name="chevronRight" size={16} color={colors.textTertiary} />
          </Pressable>
        </View>

        {booking.canCancel ? (
          <Button
            label="Cancel booking"
            variant="destructive"
            fullWidth
            loading={cancelling}
            loadingLabel="Cancelling…"
            disabled={cancelling}
            onPress={() => { void cancel(); }}
          />
        ) : null}
        {cancelHint ? (
          <Text variant="caption" color="tertiary" style={styles.center}>
            {cancelHint}
          </Text>
        ) : null}

        {finished && booking.restaurantId && booking.status !== 'arrived' ? (
          <Button
            label="Book another time"
            variant="secondary"
            fullWidth
            onPress={() => router.push(foodHref.bookTable(booking.restaurantId))}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { borderWidth: StyleSheet.hairlineWidth },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  group: { borderWidth: StyleSheet.hairlineWidth },
  restaurantRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  countdown: { flexDirection: 'row', alignItems: 'baseline' },
  center: { textAlign: 'center' },
});
