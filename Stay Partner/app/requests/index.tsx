import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Screen,
  Text,
  IconButton,
  Segmented,
  EmptyState,
  RequestCard,
  type BookingRequest,
  type BookingStatus,
} from '@/components/ui';
import { markRequestsRead } from '@/services/api/portfolio.api';
import type { BackendPartnerRequest } from '@/services/api/types';
import { formatCountdown, secondsLeft, useStayRequests } from '@/services/hooks/useStayRequests';
import { useColors } from '@/hooks/useColors';
import { formatINR } from '@/lib/format';

/**
 * Every request that has reached this owner.
 *
 * ## Real, and the fixtures are gone
 *
 * This screen used to read a module-level array seeded at import time, which
 * meant every owner saw the same five invented students and accepting one
 * changed nothing anybody else could see. It now reads
 * `GET /api/v2/partners/requests`, scoped server-side to the phone number
 * this partner proved.
 *
 * ## Pending is a different KIND of row, not a filter of the same one
 *
 * A pending request has a deadline measured in minutes and two buttons.
 * Everything else is history with neither. They are separated rather than
 * sorted, because an owner who has to scroll past last week's declines to
 * find the one row racing a clock has already lost most of the three minutes.
 *
 * The list polls while anything is pending and stops when nothing is — an
 * owner reading history is not waiting on anything.
 */

type Tab = 'pending' | 'answered';

const TABS: readonly Tab[] = ['pending', 'answered'];

const EMPTY_COPY: Record<Tab, { title: string; body: string }> = {
  pending: {
    title: 'No requests right now',
    body: 'New stay requests arrive here, and your phone will buzz when they do.',
  },
  answered: {
    title: 'Nothing answered yet',
    body: 'Requests you accept or decline, and any that ran out of time, are kept here.',
  },
};

/** The server's status, in the badge set this app already draws. */
const BADGE_FOR: Record<string, BookingStatus> = {
  pending_owner: 'pending',
  confirmed: 'confirmed',
  declined: 'declined',
  expired: 'expired',
  cancelled: 'cancelled',
};

/** "5 Sep" from a `YYYY-MM-DD` calendar day. */
function shortDate(iso?: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d} ${names[m - 1]}`;
}

/**
 * What the card shows for the stay.
 *
 * A student asking for a long stay names a joining date and a length, not a
 * departure — so this reads "from 5 Sep · 6 months" rather than inventing a
 * check-out the student never gave.
 */
function stayLine(request: BackendPartnerRequest): string {
  const intent = request.intent;
  const from = shortDate(intent?.joiningDate);
  const length = intent?.duration && intent?.durationUnit
    ? `${intent.duration} ${intent.durationUnit === 'days' ? 'night' : 'month'}${intent.duration === 1 ? '' : 's'}`
    : '';

  if (from && length) return `From ${from} · ${length}`;
  if (from) return `From ${from}`;
  if (length) return length;
  return 'Dates to confirm';
}

function toCard(request: BackendPartnerRequest, offsetMs: number): BookingRequest {
  return {
    id: request.id,
    guest: request.customer?.name || 'A student',
    dates: stayLine(request),
    roomType: request.sharing?.label || request.propertyName,
    amount: request.intent?.totalAmount
      ? formatINR(request.intent.totalAmount)
      : request.sharing?.price
        ? `${formatINR(request.sharing.price)}/mo`
        : '—',
    status: BADGE_FOR[request.status] ?? 'pending',
    /*
     * Epoch ms, from the SERVER's deadline corrected for this device's clock.
     * The card colours its own border from urgency, so a phone running fast
     * would otherwise paint a request red a minute early.
     */
    expiresAt: Date.now() + secondsLeft(request, offsetMs) * 1000,
  };
}

export default function RequestsInbox() {
  const router = useRouter();
  const c = useColors();
  const [tab, setTab] = useState<Tab>('pending');

  const { groups, unread, isPending, error, clockOffset } = useStayRequests();

  /*
   * The badge clears when the list is actually looked at.
   *
   * Its own call rather than a side effect of the GET, so a background
   * refetch or a retry cannot clear a count nobody read. Fired once per
   * mount — not on every poll, which would clear the badge for a request that
   * arrived while the owner was on another screen.
   */
  useEffect(() => {
    if (unread > 0) markRequestsRead().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per mount, deliberately
  }, []);

  const labels = useMemo<Record<Tab, string>>(() => ({
    /* The count is on the tab because it is the reason to press it. */
    pending: groups.pending.length ? `Pending · ${groups.pending.length}` : 'Pending',
    answered: 'History',
  }), [groups.pending.length]);

  /* Soonest-expiring first — the one thing here actually racing a clock. */
  const list = tab === 'pending'
    ? [...groups.pending].sort((a, b) => secondsLeft(a, clockOffset.current) - secondsLeft(b, clockOffset.current))
    : groups.answered;

  return (
    <Screen
      contentStyle={styles.stack}
      stickyHeader={(
        <>
          {/* The design draws no back affordance here — it assumes you arrive
              from a tab. This screen is pushed from the dashboard, so it gets
              the same inline chevron every other pushed screen uses. */}
          <View style={styles.headerRow}>
            <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
            <IconButton
              name="plus"
              label="Add customer"
              onPress={() => router.push('/requests/add-customer')}
            />
          </View>

          <Text variant="screenTitle">Requests</Text>
        </>
      )}
    >
      <Segmented options={TABS} value={tab} onChange={setTab} labels={labels} />

      {/* A pending request is counting down, so the wait is worth naming. */}
      {tab === 'pending' && groups.pending.length > 0 ? (
        <Text variant="label" style={{ color: c.textCaption }}>
          {groups.pending.length === 1 ? 'One student is' : `${groups.pending.length} students are`} waiting
          on you — {formatCountdown(secondsLeft(list[0], clockOffset.current))} left on the soonest
        </Text>
      ) : null}

      {isPending && !list.length ? (
        <View style={styles.loading}>
          <ActivityIndicator color={c.accent} />
        </View>
      ) : error ? (
        <EmptyState
          icon="info"
          title="Could not load your requests"
          /* The server's own words. "You are offline" and "your session
             expired" need different actions from an owner. */
          body={error.displayMessage}
          style={styles.empty}
        />
      ) : list.length > 0 ? (
        list.map((request) => (
          <RequestCard
            key={request.id}
            request={toCard(request, clockOffset.current)}
            onPress={() => router.push({ pathname: '/requests/[id]', params: { id: request.id } })}
          />
        ))
      ) : (
        <EmptyState
          icon="bookings"
          title={EMPTY_COPY[tab].title}
          body={EMPTY_COPY[tab].body}
          style={styles.empty}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
  headerRow: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginLeft: -10,
    marginRight: -10,
    marginBottom: -4,
  },
  loading: { minHeight: 240, alignItems: 'center', justifyContent: 'center' },
  empty: { minHeight: 320 },
});
