import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { Icon, Spinner, Text, type IconName } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useBottomBar } from '@/context/BottomBarContext';
import { useTheme } from '@/context/ThemeContext';
import { useTableBookings } from '@/services/hooks/useTableBookings';
import { isUpcomingTableBooking, type TableBooking, type TableBookingStatus } from '@/types/food';

import { foodHref } from './routes';
import { FoodEmptyState } from './FoodStates';
import { FoodNotice, FoodSectionHeader } from './FoodNotices';
import { useFoodPaused } from './FoodPaused';

/* ------------------------------------------------------------------ *
 * Status
 * ------------------------------------------------------------------ */

type StatusDescriptor = {
  label: string;
  glyph: IconName;
  tone: 'success' | 'warning' | 'danger' | 'info';
};

/**
 * Seven states, each a glyph and a word before it is a colour.
 *
 * Amber is waiting, green is good news, red is a booking that will not
 * happen — and `expired` is neutral rather than red. Nobody refused it and
 * nobody failed: the restaurant simply did not answer in time, which is worth
 * telling apart from a kitchen that said no.
 */
const STATUS: Record<TableBookingStatus, StatusDescriptor> = {
  requested: { label: 'Waiting', glyph: 'clock', tone: 'warning' },
  confirmed: { label: 'Confirmed', glyph: 'check', tone: 'success' },
  declined: { label: 'Declined', glyph: 'close', tone: 'danger' },
  expired: { label: 'No answer', glyph: 'expired', tone: 'info' },
  cancelled: { label: 'Cancelled', glyph: 'close', tone: 'danger' },
  arrived: { label: 'Arrived', glyph: 'checkedIn', tone: 'success' },
  no_show: { label: 'No-show', glyph: 'alert', tone: 'danger' },
};

export function tableBookingStatus(status: TableBookingStatus): StatusDescriptor {
  return STATUS[status];
}

export function TableBookingStatusChip({ status }: { status: TableBookingStatus }) {
  const { colors, space, radius } = useTheme();
  const descriptor = STATUS[status];
  const tone = colors[descriptor.tone];

  return (
    <View
      accessibilityLabel={descriptor.label}
      style={[
        styles.chip,
        { backgroundColor: tone.tint, borderRadius: radius.pill, paddingHorizontal: space[2] + 2, gap: 4 },
      ]}
    >
      <Icon name={descriptor.glyph} size={16} color={tone.ink} />
      <Text variant="label" style={{ color: tone.ink, letterSpacing: 0.3 }}>
        {descriptor.label}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * One booking in a list
 * ------------------------------------------------------------------ */

export function TableBookingCard({ booking, onPress }: { booking: TableBooking; onPress: () => void }) {
  const { colors, space, radius } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Table at ${booking.restaurantName}, ${booking.dayLabel} ${booking.timeLabel}, ${STATUS[booking.status].label}`}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: pressed ? colors.surfaceSunken : colors.surface,
          borderColor: colors.border,
          borderRadius: radius.card,
          padding: space[3],
          gap: space[2],
        },
      ]}
    >
      <View style={styles.head}>
        <TableBookingStatusChip status={booking.status} />
        <Text variant="numMeta" color="tertiary">
          {booking.reference}
        </Text>
      </View>

      <View style={[styles.body, { gap: space[3] }]}>
        <View
          style={[
            styles.tile,
            { backgroundColor: colors.surfaceSunken, borderRadius: radius.chip },
          ]}
        >
          <Icon name="dining" size={20} color={colors.textSecondary} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="title3" numberOfLines={1}>
            {booking.restaurantName}
          </Text>
          <Text variant="caption" color="tertiary" numberOfLines={1}>
            {booking.dayLabel} · {booking.timeLabel} · {booking.partySize}{' '}
            {booking.partySize === 1 ? 'guest' : 'guests'}
            {booking.tableNumber ? ` · Table ${booking.tableNumber}` : ''}
          </Text>
        </View>
        <Icon name="chevronRight" size={16} color={colors.textTertiary} />
      </View>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ *
 * The Orders tab's "Table bookings" half
 * ------------------------------------------------------------------ */

/**
 * Every table this diner has asked for — the ones still to come first, the
 * soonest at the top, then everything that has already happened.
 *
 * The server sends them newest sitting first and leaves the split to the app,
 * because "upcoming" is a question about now and the list may be read long
 * after it was fetched.
 */
export function TableBookingsPanel({ onHome }: { onHome: () => void }) {
  const { colors, space, layout } = useTheme();
  const router = useRouter();
  const { status, requireSignIn } = useAuth();
  const signedIn = status === 'signedIn';
  const { onScroll: barScroll, height: barHeight } = useBottomBar();
  /* Off screen behind a stay tab — see `FoodPaused`. The list is kept; only
     the poll for a waiting request stops. */
  const paused = useFoodPaused();
  const { bookings, loading, error, refetch } = useTableBookings(signedIn, !paused);
  /* The spinner is for a pull, not for the poll — a list that flashes a
     spinner every ten seconds while a request waits reads as broken. */
  const [pulling, setPulling] = useState(false);
  const pull = () => {
    setPulling(true);
    void refetch().finally(() => setPulling(false));
  };

  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const ahead = bookings
      .filter((booking) => isUpcomingTableBooking(booking, now))
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
    const behind = bookings.filter((booking) => !isUpcomingTableBooking(booking, now));
    return { upcoming: ahead, past: behind };
  }, [bookings]);

  if (!signedIn && status !== 'hydrating') {
    return (
      <FoodEmptyState
        glyph="dining"
        title="Sign in to see your table bookings"
        body="Tables you book at restaurants live with your account."
        primaryLabel="Sign in"
        onPrimary={() => requireSignIn(() => {})}
      />
    );
  }
  if (loading || !signedIn) {
    return (
      <View style={{ padding: space[7], alignItems: 'center' }}>
        <Spinner color={colors.brand} />
      </View>
    );
  }
  if (error && !bookings.length) {
    return (
      <FoodEmptyState
        glyph="dining"
        tone="problem"
        title="We could not load your table bookings"
        body="Check your connection and try again."
        primaryLabel="Try again"
        onPrimary={() => { void refetch(); }}
      />
    );
  }
  if (!bookings.length) {
    return (
      <FoodEmptyState
        glyph="dining"
        title="No table bookings yet"
        body="Restaurants taking bookings show a Dine-in mark on Food home. Pick a day, a time and how many of you."
        primaryLabel="Find a table"
        onPrimary={onHome}
      />
    );
  }

  const open = (booking: TableBooking) => router.push(foodHref.tableBooking(booking.reference));

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingTop: space[2], paddingBottom: space[8] + barHeight, gap: space[4] }}
      onScroll={barScroll}
      scrollEventThrottle={16}
      refreshControl={
        <RefreshControl refreshing={pulling} onRefresh={pull} tintColor={colors.brand} />
      }
    >
      {error ? (
        <View style={{ paddingHorizontal: layout.gutter }}>
          <FoodNotice
            tone="problem"
            title="This list is not current"
            body="The last refresh did not reach us. Pull down to try again."
          />
        </View>
      ) : null}

      {upcoming.length ? (
        <View style={{ paddingHorizontal: layout.gutter, gap: space[2] }}>
          <FoodSectionHeader title="Upcoming" trailing={`${upcoming.length}`} />
          {upcoming.map((booking) => (
            <TableBookingCard key={booking.reference} booking={booking} onPress={() => open(booking)} />
          ))}
        </View>
      ) : null}

      {past.length ? (
        <View style={{ paddingHorizontal: layout.gutter, gap: space[2] }}>
          <FoodSectionHeader title="Past" />
          {past.map((booking) => (
            <TableBookingCard key={booking.reference} booking={booking} onPress={() => open(booking)} />
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', minHeight: 24 },
  card: { borderWidth: StyleSheet.hairlineWidth },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  body: { flexDirection: 'row', alignItems: 'center' },
  tile: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
});
