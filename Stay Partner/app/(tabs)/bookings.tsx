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
  RequestCard,
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
import { secondsLeft, useStayRequests } from '@/services/hooks/useStayRequests';
import { toRequestCard } from './requests';

type Tab = 'upcoming' | 'history';
type Outcome = 'all' | 'completed' | 'cancelled';

const OUTCOMES: { key: Outcome; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
];

/*
 * The four real categories, plus "all" — matching `Backend/src/shared/
 * constants/categories.js`'s enum and label table exactly (each frontend
 * keeps its own copy of the label rather than fetching it; the CODE is what
 * must never drift, and that is what is sent to the server below).
 */
type CategoryFilter = 'all' | 'PG_HOSTEL' | 'BACHELOR' | 'HOTEL' | 'COLIVE';
const CATEGORIES: { key: CategoryFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'PG_HOSTEL', label: 'PG / Hostel' },
  { key: 'BACHELOR', label: 'Bachelor' },
  { key: 'HOTEL', label: 'Hotels' },
  { key: 'COLIVE', label: 'House / Co-live' },
];
const categoryLabel = (key: CategoryFilter): string =>
  CATEGORIES.find((c) => c.key === key)?.label ?? 'All';

/*
 * History used to mean two different things in two different places.
 *
 * This tab already showed COMPLETED and CANCELLED bookings — stays that
 * happened, one way or the other. The Requests tab separately kept its own
 * "answered" list: every request once it had an outcome, win or lose. The
 * two overlapped for exactly the requests that were ACCEPTED, because an
 * accepted request becomes one of the bookings already shown here — so
 * showing both lists in full would have printed some students twice.
 *
 * What the Requests tab's history had that this one did not is DECLINED and
 * EXPIRED requests, and a request the STUDENT cancelled before the owner
 * ever answered — none of which becomes a booking, so none of which could
 * ever appear here on its own. Those three are folded in below, and
 * `useStayRequests` already carries every request this owner has ever
 * received — the same real endpoint the Requests tab reads, not a second
 * source that could disagree with it.
 */
const REQUEST_HISTORY_STATUSES = new Set(['declined', 'expired', 'cancelled']);

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
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [allBookings, setAllBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* The declined/expired/pre-accept-cancelled half of history — see the note
     above. Same hook the Requests tab itself uses, so this can never show a
     request that screen would disagree about. */
  const {
    groups: requestGroups, isPending: requestsLoading, clockOffset, refetch: refetchRequests,
  } = useStayRequests();

  const [refreshing, setRefreshing] = useState(false);

  /*
   * `silent` skips the full-screen loading placeholder — pull-to-refresh
   * already shows its own spinner via `RefreshControl`, and flipping
   * `loading` here would swap the whole list out from underneath it.
   */
  const loadBookings = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      /* The filter is sent to the SERVER — `fetchBookings` only asks for
         this category's rows in the first place, rather than fetching
         everything and narrowing it here. See the note on `?category=` in
         `getBookings` on the backend for why an owner with hundreds of
         bookings across several categories should not have to download all
         of them to look at one. */
      const data = await fetchBookings(category === 'all' ? undefined : category);
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
      if (!opts?.silent) setLoading(false);
    }
  }, [category]);

  /* Re-runs whenever `category` changes too, since that is now part of
     `loadBookings`'s own identity — picking a different category chip is a
     real reload, not a silent background one, so the full-screen "Loading…"
     state is what should show while it's in flight. */
  useEffect(() => {
    loadBookings();
  }, [loadBookings]);

  /* The live half — a student cancelling from their own app must not wait
     for this owner to pull to refresh to find out. This screen fetches by
     hand rather than through react-query, so the socket event triggers the
     same reload the pull-to-refresh gesture does rather than an invalidated
     cache key. */
  useEffect(() => onBookingEvent(() => { loadBookings(); }), [loadBookings]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadBookings({ silent: true }), refetchRequests()]);
    } finally {
      setRefreshing(false);
    }
  }, [loadBookings, refetchRequests]);

  /*
   * Everything still live, with today's business first.
   *
   * `arriving` and `departing` are new members of this list rather than a new
   * tab: an owner opening Bookings wants one list of who is here and who is
   * coming, and splitting it would hide an arrival behind a tab nobody taps.
   * They sort to the top instead, because they are the two that need doing
   * today.
   */
  const upcomingList = useMemo(() => {
    const live = allBookings.filter(
      (b) => b.status === 'inHouse' || b.status === 'confirmed'
        || b.status === 'arriving' || b.status === 'departing'
        || b.status === 'overdueArrival' || b.status === 'overdueDeparture',
    );
    /* Overdue outranks everything — it is the one that needs a decision,
       not just a look, so it leads the list rather than sitting wherever its
       original (long-past) date would otherwise sort it. */
    const rank: Record<string, number> = {
      overdueArrival: 0,
      overdueDeparture: 1,
      arriving: 2,
      departing: 3,
      inHouse: 4,
      confirmed: 5,
    };
    return [...live].sort(
      (a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9)
        || a.checkIn.getTime() - b.checkIn.getTime(),
    );
  }, [allBookings]);

  /*
   * History: past bookings and the requests that never became one, as one
   * list rather than two.
   *
   * A `HistoryRow` is a discriminated union rather than a merged shape —
   * `Booking` and `BackendPartnerRequest` describe genuinely different
   * things (a stay that happened; an ask that did not go anywhere), and
   * flattening them into one fake-common type would mean inventing fields
   * on whichever side does not really have them. Each kind keeps its own
   * card instead: `BookingRow` for a stay, the same `RequestCard` the
   * Requests tab itself draws for an unanswered ask.
   */
  const historyBookings = useMemo(
    () => allBookings.filter((b) => b.status === 'completed' || b.status === 'cancelled'),
    [allBookings],
  );
  const historyRequests = useMemo(
    () => requestGroups.answered.filter(
      (r) => REQUEST_HISTORY_STATUSES.has(r.status)
        /* `useStayRequests` has no server-side category filter — it backs
           the live Requests tab too, where an owner wants to see every
           incoming ask regardless of kind. So the category chip narrows
           these client-side instead, which is fine here: this is already a
           small, already-fetched "answered" list, not the full bookings
           table `loadBookings` is deliberately not over-fetching above. */
        && (category === 'all' || r.category === category),
    ),
    [requestGroups.answered, category],
  );

  const historyRows = useMemo(() => {
    type Row =
      | { kind: 'booking'; key: string; sortAt: number; booking: Booking }
      | { kind: 'request'; key: string; sortAt: number; request: (typeof historyRequests)[number] };

    const bookingRows: Row[] = historyBookings
      .filter((b) => outcome === 'all' || b.status === outcome)
      .map((booking) => ({
        kind: 'booking', key: `b-${booking.id}`, sortAt: booking.checkOut.getTime(), booking,
      }));

    /* "Completed" names a stay that happened, which a request that went
       nowhere never did — so a request-history row only appears under All
       or Cancelled, matching the one status ('cancelled') it can actually
       carry. Declined and expired have no home in the two existing chips
       and stay under All, same as they always did on the Requests tab. */
    const requestRows: Row[] = (outcome === 'completed' ? [] : historyRequests)
      .filter((r) => outcome !== 'cancelled' || r.status === 'cancelled')
      .map((request) => ({
        kind: 'request',
        key: `r-${request.id}`,
        /* Whichever timestamp the server actually stamped for this outcome —
           a declined/expired/cancelled request has no checkout to sort by. */
        sortAt: Date.parse(request.decidedAt || request.cancelledAt || request.createdAt),
        request,
      }));

    return [...bookingRows, ...requestRows].sort((a, b) => b.sortAt - a.sortAt);
  }, [historyBookings, historyRequests, outcome]);

  const open = (b: Booking) =>
    router.push({ pathname: '/booking/[id]', params: { id: b.id } });

  return (
    <Screen
      tabBarSpacing contentStyle={styles.stack}
      refreshing={refreshing}
      onRefresh={onRefresh}
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

      {/* Which kind of place — applies to both Upcoming and History, since an
          owner running several kinds of listings wants "just my hotels"
          whichever tab they're on. Picking one re-asks the server rather
          than hiding rows already on the phone — see the note on
          `loadBookings`. */}
      <ChipRow style={styles.filters}>
        {CATEGORIES.map((c) => (
          <Chip
            key={c.key}
            label={c.label}
            size="sm"
            subtle
            tone="neutral"
            selected={category === c.key}
            onPress={() => setCategory(c.key)}
          />
        ))}
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
          screen they check before turning a guest away at the door.

          History additionally waits on `requestsLoading`: showing the
          bookings half alone while the requests half is still in flight
          would flash a list that is missing rows it is about to gain. */}
      {error ? (
        <EmptyState
          icon="clock"
          title="We could not load your bookings"
          body={error}
          actionLabel="Try again"
          onAction={loadBookings}
          style={styles.empty}
        />
      ) : loading || (tab === 'history' && requestsLoading && !historyRows.length) ? (
        <EmptyState icon="bookings" title="Loading…" body="" style={styles.empty} />
      ) : tab === 'upcoming' ? (
        upcomingList.length > 0 ? (
          upcomingList.map((b) => <BookingRow key={b.id} booking={b} onPress={() => open(b)} />)
        ) : (
          <EmptyState
            icon="bookings"
            title="No upcoming bookings"
            body={category === 'all'
              ? 'Confirmed stays appear here once you accept a request.'
              : `No upcoming ${categoryLabel(category).toLowerCase()} bookings right now — try "All" to see every kind.`}
            style={styles.empty}
          />
        )
      ) : historyRows.length > 0 ? (
        historyRows.map((row) => (row.kind === 'booking'
          ? <BookingRow key={row.key} booking={row.booking} onPress={() => open(row.booking)} />
          : (
            <RequestCard
              key={row.key}
              request={toRequestCard(row.request, clockOffset.current)}
              onPress={() => router.push({ pathname: '/requests/[id]', params: { id: row.request.id } })}
            />
          )))
      ) : (
        <EmptyState
          icon="clock"
          title={`No ${outcome} stays`}
          body={
            category !== 'all'
              ? `No ${categoryLabel(category).toLowerCase()} history for this filter yet.`
              : outcome === 'completed'
                ? 'Stays move here once they finish.'
                : 'Declines, expired requests and cancellations are kept here.'
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
        {/* Never for PG/Hostel or Co-living — see the note on the same
            guard in `booking/[id].tsx`. These categories' payment figure is
            always 0/0, so the badge always read "Pending" regardless of how
            the stay is actually going. */}
        {booking.category !== 'PG_HOSTEL' && booking.category !== 'COLIVE' ? (
          <PaymentStatusBadge status={booking.payment} size="sm" />
        ) : null}
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
