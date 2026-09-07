import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
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
import { queryKeys } from '@/services/hooks/keys';
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

  const queryClient = useQueryClient();
  const { groups, unread, isPending, error, clockOffset } = useStayRequests();

  /*
   * The badge clears when the list is actually looked at.
   *
   * Its own call rather than a side effect of the GET, so a background
   * refetch or a retry cannot clear a count nobody read.
   *
   * On FOCUS rather than on mount. It was once-per-mount while this screen was
   * pushed from the dashboard and thrown away on the way back — as a tab it
   * mounts once and then stays mounted underneath the others forever, so a
   * mount effect would clear the badge the first time and never again. Every
   * request arriving after that would keep a count the owner had already read.
   *
   * Still not on every poll: a request that lands while the owner is on
   * another tab has to keep its badge until they come and look.
   */
  useFocusEffect(
    useCallback(() => {
      if (unread > 0) markRequestsRead().catch(() => {});
      queryClient.invalidateQueries({ queryKey: queryKeys.requests });
      // eslint-disable-next-line react-hooks/exhaustive-deps -- `unread` is read, not depended on: re-running per count change would fire this mid-poll
    }, []),
  );

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
          {/* No back affordance, which is what the design always assumed: this
              is a tab root now, and there is nothing behind it to go back to.
              It used to carry the inline chevron every pushed screen has,
              because it was reached from the dashboard. */}
          <View style={styles.headerRow}>
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
    /* One button now the back chevron is gone, and it belongs on the right
       where it already was — `space-between` would push it to the left edge. */
    justifyContent: 'flex-end',
    marginRight: -10,
    marginBottom: -4,
  },
  loading: { minHeight: 240, alignItems: 'center', justifyContent: 'center' },
  empty: { minHeight: 320 },
});
