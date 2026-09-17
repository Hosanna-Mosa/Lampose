import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Tappable } from '@/components/common';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Screen, Text, Button, Card, Icon, Skeleton, HeaderPill, Switch } from '@/components/common';
import { unreadCount } from '@/lib/notifications';
import { POINTS_PER_REFERRAL, POINT_VALUE_RUPEES } from '@/lib/referrals';
import { subscribeComplaints } from '@/lib/complaints';
import {
  setShareTypes,
  visibleCount as visibleShareTypes,
  subscribeShareTypes,
  isAvailable,
  setAvailable,
} from '@/lib/shareTypes';
import { formatCountdown, secondsLeft, useStayRequests } from '@/services/hooks/useStayRequests';
import { useOngoingBookings } from '@/services/hooks/useBookings';
import { OngoingStrip, type OwnerOngoingItem } from '@/components/OngoingStrip';
import { UnansweredRequestAlert } from '@/components/UnansweredRequestAlert';
import { radius, shadow } from '@/constants/layout';
import { type } from '@/constants/typography';
import colors from '@/constants/colors';
import { useColors } from '@/hooks/useColors';

// ── Static content, as shown in the design ────────────────────────────────


import { fetchSummary } from '@/services/api/portfolio.api';
import { fetchNotificationsApi, fetchShareTypesApi, toggleShareTypesAvailabilityApi } from '@/services/api/domain.api';
import { useAuth } from '@/context/AuthContext';
import { logWarn } from '@/lib/log';
import { LoadingBody } from '@/components/tabs-index/molecules/LoadingBody/LoadingBody';
import { ErrorBody } from '@/components/tabs-index/molecules/ErrorBody/ErrorBody';
import { HeroCard } from '@/components/tabs-index/organisms/HeroCard/HeroCard';
import { HeroCardBody } from '@/components/tabs-index/organisms/HeroCardBody/HeroCardBody';
import { BookingCard } from '@/components/tabs-index/organisms/BookingCard/BookingCard';
import { EarningsMiniCard } from '@/components/tabs-index/organisms/EarningsMiniCard/EarningsMiniCard';
import { RequestsBanner } from '@/components/tabs-index/organisms/RequestsBanner/RequestsBanner';
import { AddCustomerBanner } from '@/components/tabs-index/organisms/AddCustomerBanner/AddCustomerBanner';
import { ReferEarnBanner } from '@/components/tabs-index/organisms/ReferEarnBanner/ReferEarnBanner';
import { ComplaintsBanner } from '@/components/tabs-index/organisms/ComplaintsBanner/ComplaintsBanner';
import { ShareTypesBanner } from '@/components/tabs-index/organisms/ShareTypesBanner/ShareTypesBanner';
import { styles } from '@/components/tabs-index/styles';

type DashboardState = 'loading' | 'ready' | 'empty' | 'error';

function greeting(hour: number) {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** "3:30 PM" from the `HH:MM` a slot is stored as. */
const clockLabel = (hhmm: string): string => {
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

export function TodayTabScreen() {
  const c = useColors();
  const router = useRouter();
  const { partner } = useAuth();
  const { state: forced } = useLocalSearchParams<{ state?: DashboardState }>();

  const [state, setState] = useState<DashboardState>('loading');
  const [summaryData, setSummaryData] = useState<any>(null);
  const [unread, setUnread] = useState(0);
  const [available, setAvailableLocal] = useState(true);

  const [, setRevision] = useState(0);

  /*
   * The pending requests, live.
   *
   * `subscribeRequests` used to push a re-render whenever the FIXTURE array
   * changed, which is a subscription to something nobody else could see. The
   * hook polls the real endpoint while anything is pending and stops when
   * nothing is.
   */
  const { groups: requestGroups, clockOffset, refetch: refetchRequests } = useStayRequests();

  /* Bookings the owner has marked in that the guest has not confirmed — see
     `useOngoingBookings`. The one open state nothing else in the app reports. */
  const {
    ongoing: awaitingGuest, notCheckedIn, refetch: refetchOngoing,
  } = useOngoingBookings();

  /*
   * Who is actually coming today, which is not what the calendar says.
   *
   * A booking's `checkInDate` is only a real date when the student chose one.
   * A bachelor request never asks for a joining date, so `acceptAndBook`
   * writes `joining || today` — the day the OWNER accepted — and the derived
   * stage then reads `arriving` from the moment of acceptance. The strip
   * announced "Arriving today" for a guest who had not paid, had not picked a
   * slot, and had no reason to be anywhere near the building.
   *
   * So the question is asked of the REQUEST, which knows what the guest has
   * actually done:
   *
   *   a visit was paid for   the day that matters is the SCHEDULED VISIT, and
   *                          until a slot is fixed there is no day at all.
   *                          This is bachelor and co-live.
   *   nothing was paid       the check-in date is the joining date the student
   *                          picked, so the calendar stage is the answer.
   *                          This is PG/Hostel, and walk-ins.
   */
  const today = useMemo(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }, []);

  const requestById = useMemo(() => new Map(
    [...requestGroups.pending, ...requestGroups.answered].map((r) => [r.id, r]),
  ), [requestGroups.pending, requestGroups.answered]);

  const arrivingToday = useMemo(() => notCheckedIn.flatMap((b) => {
    const request = b.requestId ? requestById.get(b.requestId) : undefined;

    if (request?.payment?.required) {
      const visit = request.lamposeVisit;
      if (visit?.status !== 'scheduled' || visit.date !== today) return [];
      return [{ booking: b, at: visit.time ?? null }];
    }

    return b.status === 'arriving' ? [{ booking: b, at: null }] : [];
  }), [notCheckedIn, requestById, today]);

  /*
   * The strip above the tab bar: everything still open, in one row.
   *
   * Three states, and the tone separates them by WHOSE move it is — the
   * accent means this owner has something to do; quiet means they are waiting
   * on somebody they cannot hurry, and an urgent-looking chip on one of those
   * is noise.
   *
   *   pending request       theirs to answer, and it EXPIRES in minutes — so
   *                         it leads, even though an arrival feels louder.
   *                         Missing it loses the booking outright.
   *   arriving today        somebody is coming to the door today and has not
   *                         been checked in. The day's actual work, and the
   *                         reason an owner opens this screen at all.
   *   confirmed, unpaid     accepted, and the student still owes the ₹199.
   *                         This is the one an owner used to lose entirely:
   *                         once they leave the request screen it is not in
   *                         the Requests queue (it is answered), not in
   *                         Bookings as anything distinguishable (the row is
   *                         `upcoming` like any other), and no badge counts
   *                         it. It simply went quiet.
   *   marked in, unconfirmed  the guest has not confirmed from their phone.
   *
   * The two the owner can act on come first and wear the accent; the two they
   * are only waiting on follow, quiet.
   *
   * `payment.required` with a status short of `paid` is the same fact the
   * request screen's own "Waiting on the student" card is drawn from, so the
   * two cannot disagree about whether the money arrived.
   */
  const ongoingItems = useMemo<OwnerOngoingItem[]>(() => [
    ...requestGroups.pending.map((r) => ({
      key: `request-${r.id}`,
      title: r.customer?.name || 'New request',
      status: 'Waiting on your answer',
      tone: 'action' as const,
      icon: 'bell' as const,
      /* Where Accept and Decline are. */
      href: { pathname: '/requests/[id]', params: { id: r.id } },
    })),
    ...arrivingToday.map(({ booking: b, at }) => ({
      key: `booking-${b.id}`,
      title: b.guest,
      /* A viewing says WHEN, because the owner plans the afternoon around it.
         An arrival has no time on it — the student picked a day, not an
         hour — so claiming one would be inventing it. */
      status: at ? `Visiting today · ${clockLabel(at)}` : 'Arriving today',
      tone: 'action' as const,
      icon: 'suitcase' as const,
      /*
       * The booking, not the code screen.
       *
       * Every other row here resumes something already started, so it goes
       * straight to where it stopped. This one has not started: the guest is
       * on their way and the owner may be looking to see WHO before they open
       * anything. The detail screen names them, shows the room, and its
       * primary action is "Start check-in" — one tap, and never a PIN pad
       * opened by somebody who only wanted to look.
       */
      href: { pathname: '/booking/[id]', params: { id: b.id } },
    })),
    ...requestGroups.answered
      .filter((r) => r.status === 'confirmed'
        && r.payment?.required
        && r.payment.status !== 'paid')
      .map((r) => ({
        key: `request-${r.id}`,
        title: r.customer?.name || 'Accepted request',
        status: 'Waiting on their payment',
        tone: 'waiting' as const,
        icon: 'rupee' as const,
        /* The same screen that says what is outstanding — the owner has
           nothing to do here but read it. */
        href: { pathname: '/requests/[id]', params: { id: r.id } },
      })),
    ...awaitingGuest.map((b) => ({
      key: `booking-${b.id}`,
      title: b.guest,
      status: `Waiting for ${b.guest.split(' ')[0]} to confirm`,
      tone: 'waiting' as const,
      icon: 'clock' as const,
      /*
       * Straight to the waiting screen, not to the booking detail.
       *
       * This pointed at `booking/[id]`, which draws a card about the guest
       * not having confirmed and a button that opens `booking/checked-in` —
       * so resuming took two taps and landed one screen short of where the
       * owner actually was. `checked-in` is that screen: it names the guest,
       * lists the three steps to talk them through, and refetches on focus,
       * which is the whole reason to come back to it.
       */
      href: { pathname: '/booking/checked-in', params: { id: b.id } },
    })),
  ], [requestGroups.pending, arrivingToday, requestGroups.answered, awaitingGuest]);

  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const unsubComplaints = subscribeComplaints(() => setRevision((r) => r + 1));
    const unsubShareTypes = subscribeShareTypes(() => {
      setRevision((r) => r + 1);
    });
    return () => {
      unsubComplaints();
      unsubShareTypes();
    };
  }, []);

  /*
   * `silent` skips the state-machine flip to 'loading' — pull-to-refresh
   * already shows its own spinner via `RefreshControl`, and swapping the
   * whole body for `LoadingBody` underneath it would blank out the screen
   * the owner is mid-gesture on.
   */
  const loadData = useCallback(async (opts?: { silent?: boolean }) => {
    if (forced && forced !== 'loading') {
      setState(forced);
      return;
    }
    if (!opts?.silent) setState('loading');
    try {
      const [sum, notifs] = await Promise.all([
        fetchSummary(),
        fetchNotificationsApi().catch(() => ({ items: [], unreadCount: 0 })),
      ]);
      setSummaryData(sum);
      setUnread(notifs.unreadCount);
      if (typeof sum.isAvailable === 'boolean') {
        setAvailableLocal(sum.isAvailable);
      }
      setState('ready');
    } catch (err) {
      /*
       * A failed load is an error state, not a ready one.
       *
       * This used to `setState('ready')` on failure, which painted the whole
       * dashboard from the fallbacks below — so a dropped connection showed an
       * owner a confident "₹9,600 today" instead of telling them nothing had
       * loaded. `ErrorBody` already exists and offers a retry; this is what
       * routes to it.
       */
      logWarn('Error fetching dashboard summary:', err);
      if (!opts?.silent) setState('error');
    }
  }, [forced]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadData({ silent: true }), refetchRequests(), refetchOngoing()]);
    } finally {
      setRefreshing(false);
    }
  }, [loadData, refetchRequests, refetchOngoing]);

  /*
   * Refetched every time this tab comes back into focus, not just on mount —
   * same reasoning as `customers.tsx`. Share Types is a pushed screen that
   * `back()`s to here, and turning every share type off there takes the
   * property offline server-side (`getSummary` computes `isAvailable` from
   * whether ANY share type is still available). A plain mount effect would
   * never see that: this tab stays mounted underneath the pushed screen, so
   * it would keep showing the availability it had before the visit — online,
   * on a card that's actually just been saved with nothing left to book.
   */
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  /*
   * Real values only. There are no invented defaults here any more.
   *
   * Every line below used to end in `|| 'Anjali'`, `|| 'Sea View Villa'`,
   * `|| { arrivals: 3, … }`, `|| '₹9,600'`. Those are the numbers in the
   * screenshot that started this — the dashboard was showing fixture figures
   * whenever the server returned nothing, and an owner has no way to tell an
   * invented ₹9,600 from a real one.
   *
   * `??` rather than `||` where a default still exists, because `0` and `''`
   * are answers: `0 || 5` is 5, and that is the same bug one operator down.
   */
  const ownerName = partner?.name?.trim() || null;
  const propertyName = summaryData?.propertyName ?? null;
  const todayStats = summaryData?.today ?? { arrivals: 0, departures: 0, inHouse: 0 };
  const earningsData = summaryData?.earnings ?? { today: '₹0', week: '₹0' };

  const toggleAvailable = async (next: boolean) => {
    if (next) {
      /* Going online needs at least one visible share type — Share Types is
         where that's actually confirmed, so the switch does NOT flip yet.
         It used to call `setAvailableLocal(true)` right here, before the
         owner had picked anything: back out of that screen with nothing
         selected (or without saving at all) and the switch was already
         showing online for a state nobody had confirmed. Now nothing
         changes here — the switch only reflects what `useFocusEffect`
         reads back from the server once the owner actually returns. */
      router.push({ pathname: '/share-types', params: { reason: 'accepting' } });
      return;
    }
    setAvailableLocal(false);
    try {
      await toggleShareTypesAvailabilityApi(false);
      setAvailable(false);
    } catch (err) {
      logWarn('Failed to update availability:', err);
    }
  };

  return (
    <Screen
      tabBarSpacing
      background="bg"
      contentStyle={styles.stack}
      refreshing={refreshing}
      onRefresh={onRefresh}
      /* The footer band already clears the tab bar, so this lands exactly
         where it belongs: above the bar, over nothing. Absent entirely when
         there is nothing open — an empty band would take height from every
         visit to pay for the rare one. */
      footer={ongoingItems.length ? (
        <OngoingStrip
          items={ongoingItems}
          /* The row carries its own destination — see `href` on the item. */
          onPress={(item) => router.push(item.href as never)}
        />
      ) : undefined}
      /* Pinned. The property switcher, the availability toggle and the bell are
         the screen's controls, not its content — losing them behind a scroll
         meant scrolling back up to change property or read an alert. */
      stickyHeader={
        // Header stays put in every state — only the body below it changes.
        <Box style={styles.headerRow}>
        {state === 'loading' ? (
          <>
            <Skeleton width={150} height={36} radius={18} />
            <Skeleton width={36} height={36} radius={18} />
          </>
        ) : (
          <>
            {/* No property matched to this number is a real state, not a
                loading one — three of the properties in the catalogue have no
                owner mobile recorded at all, so their owner will land here and
                match nothing. Saying so beats naming a property that was never
                theirs. */}
            <HeaderPill
              label={propertyName ?? 'No property linked'}
              swatch
              onPress={() => router.push('/settings/property')}
            />
            <Box style={styles.headerRight}>
              <Switch value={available} onChange={toggleAvailable} size="sm" accessibilityLabel="Rooms available for booking" />
              <Tappable
                accessibilityRole="button"
                accessibilityLabel={
                  unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'
                }
                onPress={() => router.push('/notifications')}
                style={({ pressed }) => [
                  styles.bell,
                  { backgroundColor: c.surface, borderColor: c.borderCard, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Icon name="bell" size={17} />
                {unread > 0 ? (
                  <Box style={[styles.bellDot, { backgroundColor: c.error, borderColor: c.surface }]} />
                ) : null}
              </Tappable>
            </Box>
          </>
          )}
        </Box>
      }
    >
      {state === 'loading' ? (
        <LoadingBody />
      ) : state === 'error' ? (
        <ErrorBody onRetry={loadData} />
      ) : (
        <>
          {/*
            Above the greeting, deliberately.

            Everything below this line is information about a business. This is
            a person waiting on an answer with a deadline measured in minutes,
            and it renders only while the owner has not opened the request —
            the server's `seenAt` clears it, so it cannot be dismissed without
            looking at what it is about. Nothing renders when there is nothing
            unanswered.
          */}
          <UnansweredRequestAlert
            requests={requestGroups.pending}
            clockOffsetMs={clockOffset.current}
          />

          <HeroCard greetingText={greeting(new Date().getHours())} owner={ownerName} available={available} />

          <Box style={styles.halfRow}>
            <BookingCard
              arrivals={todayStats.arrivals}
              departures={todayStats.departures}
              inHouse={todayStats.inHouse}
              onPress={() => router.push('/bookings')}
            />
            {/* `/earnings` is real again — `payout.service.js`, and this
                tile's own `onPress`. */}
            <EarningsMiniCard
              today={earningsData.today}
              week={earningsData.week}
              onPress={() => router.push('/earnings' as never)}
            />
          </Box>

          <RequestsBanner
            /* The live list, falling back to the summary's count while it
               loads — the summary is fetched first and the two agree. */
            count={requestGroups.pending.length || (summaryData?.requests?.awaitingYou ?? 0)}
            secondsToSoonest={requestGroups.pending.length
              ? Math.min(...requestGroups.pending.map((r) => secondsLeft(r, clockOffset.current)))
              : null}
            /* `navigate`, not `push`: Requests is a sibling TAB now, so this
               selects it rather than stacking a second copy on top of Today. */
            onPress={() => router.navigate('/requests')}
          />

          <AddCustomerBanner onPress={() => router.push('/requests/add-customer')} />

          <ReferEarnBanner onPress={() => router.push('/referrals')} />
          <ComplaintsBanner
            open={summaryData?.openComplaints ?? 0}
            onPress={() => router.push('/complaints')}
          />
          <ShareTypesBanner onPress={() => router.push('/share-types')} />
        </>
      )}
    </Screen>
  );
}

// ── Body variants ─────────────────────────────────────────────────────────

