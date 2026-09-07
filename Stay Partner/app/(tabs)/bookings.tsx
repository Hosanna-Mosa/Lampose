import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Screen,
  Text,
  Chip,
  ChipRow,
  BookingStatusBadge,
  PaymentStatusBadge,
  EmptyState,
} from '@/components/ui';
import { formatINR, formatStayRange } from '@/lib/format';
import { type Booking, payoutOf } from '@/lib/bookings';
import { toBooking } from '@/lib/bookings';
import { fetchBookings } from '@/services/api/domain.api';
import { ApiError } from '@/services/api/client';
import { onBookingEvent } from '@/services/realtimeSocket';
import { radius } from '@/constants/layout';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';
import { logWarn } from '@/lib/log';

type Tab = 'upcoming' | 'history';
type Outcome = 'all' | 'completed' | 'cancelled';

const OUTCOMES: { key: Outcome; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
];

/* The mapping lives in `lib/bookings.ts` now — this screen, the detail screen
   and the four action screens behind it all read one `toBooking`, so a field
   only one of them mapped (the entry PIN and the move-in stamps were the
   detail screen's alone) cannot go missing on the others again. */
/* Wrapped rather than passed straight to `.map`, which would hand the array
   INDEX to `toBooking`'s second parameter as the fallback id. */
const mapBackendBookingToUI = (raw: any): Booking => toBooking(raw);

export default function BookingsTab() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('upcoming');
  const [outcome, setOutcome] = useState<Outcome>('all');
  const [allBookings, setAllBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadBookings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchBookings();
      /*
       * Set unconditionally, including when the server returns nothing.
       *
       * This was guarded by `data.length > 0`, which means an empty response
       * left whatever was in state — so a booking that had since been
       * cancelled stayed on the screen through every refresh, and the list
       * could only ever grow. An empty list is a result, not a non-answer.
       */
      setAllBookings(Array.isArray(data) ? data.map(mapBackendBookingToUI) : []);
      setError(null);
    } catch (err) {
      /* A failed load is not "no bookings". Leaving the empty state up would
         tell an owner they have none when we simply could not ask. */
      logWarn('Failed to fetch bookings:', err);
      setError(err instanceof ApiError ? err.displayMessage : 'We could not load your bookings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBookings();
  }, [loadBookings]);

  /* The live half — a student cancelling from their own app must not wait
     for this owner to pull to refresh to find out. This screen fetches by
     hand rather than through react-query, so the socket event triggers the
     same reload the pull-to-refresh gesture does rather than an invalidated
     cache key. */
  useEffect(() => onBookingEvent(() => { loadBookings(); }), [loadBookings]);

  const upcomingList = useMemo(
    () => allBookings.filter((b) => b.status === 'inHouse' || b.status === 'confirmed'),
    [allBookings]
  );

  const historyList = useMemo(() => {
    const past = allBookings.filter((b) => b.status === 'completed' || b.status === 'cancelled');
    return outcome === 'all' ? past : past.filter((b) => b.status === outcome);
  }, [allBookings, outcome]);

  const rows = tab === 'upcoming' ? upcomingList : historyList;

  const open = (b: Booking) =>
    router.push({ pathname: '/booking/[id]', params: { id: b.id } });

  return (
    <Screen
      tabBarSpacing contentStyle={styles.stack}
      stickyHeader={
        <>
          <Text variant="screenTitle" style={styles.title}>
            Bookings
          </Text>
        </>
      }
    >

      <ChipRow style={styles.filters}>
        <Chip
          label="Upcoming"
          size="sm"
          selected={tab === 'upcoming'}
          onPress={() => setTab('upcoming')}
        />
        <Chip
          label="History"
          size="sm"
          selected={tab === 'history'}
          onPress={() => setTab('history')}
        />
      </ChipRow>

      {tab === 'history' ? (
        <ChipRow style={styles.filters}>
          {OUTCOMES.map((o) => (
            <Chip
              key={o.key}
              label={o.label}
              size="sm"
              subtle
              tone="neutral"
              selected={outcome === o.key}
              onPress={() => setOutcome(o.key)}
            />
          ))}
        </ChipRow>
      ) : null}

      {/* A failure and an empty list are different facts and must not share a
          screen. "No upcoming bookings" over a dropped connection tells an
          owner they have none when we simply could not ask — and this is the
          screen they check before turning a guest away at the door. */}
      {error ? (
        <EmptyState
          icon="clock"
          title="We could not load your bookings"
          body={error}
          actionLabel="Try again"
          onAction={loadBookings}
          style={styles.empty}
        />
      ) : loading ? (
        <EmptyState icon="bookings" title="Loading…" body="" style={styles.empty} />
      ) : rows.length > 0 ? (
        rows.map((b) => <BookingRow key={b.id} booking={b} onPress={() => open(b)} />)
      ) : (
        <EmptyState
          icon={tab === 'upcoming' ? 'bookings' : 'clock'}
          title={tab === 'upcoming' ? 'No upcoming bookings' : `No ${outcome} stays`}
          body={
            tab === 'upcoming'
              ? 'Confirmed stays appear here once you accept a request.'
              : 'Stays move here once they finish or are called off.'
          }
          style={styles.empty}
        />
      )}
    </Screen>
  );
}

/**
 * The request card layout, minus the countdown. Booking state and payment state
 * sit side by side as two separate badges and are never merged.
 */
function BookingRow({ booking, onPress }: { booking: Booking; onPress: () => void }) {
  const c = useColors();
  // A cancelled stay is still a record, but it isn't live — the design dims it.
  const dimmed = booking.status === 'cancelled';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${booking.guest}, ${booking.roomType}, ${formatINR(payoutOf(booking))}`}
      style={({ pressed }) => [
        styles.card,
        {
          borderColor: c.borderCard,
          backgroundColor: c.surface,
          opacity: pressed ? 0.75 : dimmed ? 0.7 : 1,
        },
      ]}
    >
      <View style={styles.topRow}>
        <View style={styles.identity}>
          <Text style={styles.guest}>{booking.guest}</Text>
          <Text variant="caption" color="textSecondary" style={styles.meta}>
            {formatStayRange(booking.checkIn, booking.checkOut)} · {booking.roomType}
          </Text>
        </View>
        <Text tabular style={styles.amount}>
          {formatINR(payoutOf(booking))}
        </Text>
      </View>

      <View style={styles.badges}>
        <BookingStatusBadge status={booking.status} size="sm" />
        <PaymentStatusBadge status={booking.payment} size="sm" />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  title: { marginBottom: 2 },
  filters: { marginBottom: 6 },
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  identity: { flex: 1 },
  guest: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 20 },
  meta: { fontSize: 13, marginTop: 1 },
  amount: { fontFamily: fonts.extrabold, fontSize: 15, lineHeight: 20 },
  badges: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  empty: { minHeight: 320, borderRadius: radius.card },
});
