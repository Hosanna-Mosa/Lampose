import { useCallback, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { Box, Spinner } from '@/components/common';
import { useFocusEffect, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  Screen,
  Text,
  IconButton,
  EmptyState,
  RequestCard,
  type BookingRequest,
  type BookingStatus,
} from '@/components/common';
import { markRequestsRead } from '@/services/api/portfolio.api';
import type { BackendPartnerRequest } from '@/services/api/types';
import { formatCountdown, secondsLeft, useStayRequests } from '@/services/hooks/useStayRequests';
import { queryKeys } from '@/services/hooks/keys';
import { useColors } from '@/hooks/useColors';
import { formatINR } from '@/lib/format';

/**
 * The requests still waiting on this owner.
 *
 * ## Real, and the fixtures are gone
 *
 * This screen used to read a module-level array seeded at import time, which
 * meant every owner saw the same five invented students and accepting one
 * changed nothing anybody else could see. It now reads
 * `GET /api/v2/partners/requests`, scoped server-side to the phone number
 * this partner proved.
 *
 * ## History moved to the Bookings tab
 *
 * This screen used to carry a second tab — every request once it had an
 * answer, win or lose. It is gone from here, not deleted: an owner looking
 * for "what happened with that student" was checking two places for one
 * answer, because a request that got ACCEPTED became a booking and moved to
 * the Bookings tab's own history, while a DECLINED or EXPIRED one — which
 * never becomes a booking at all — stayed stranded here, on a tab an owner
 * had no reason left to open once the deadline had passed. `BookingsTab`
 * now folds both kinds into the one History an owner actually goes back to.
 *
 * What is left here is exactly what still needs a person: a deadline
 * measured in minutes and two buttons. The list polls while anything is
 * pending and stops when nothing is — there is nothing left on this screen
 * to read once it does.
 */

const EMPTY_PENDING = {
  title: 'No requests right now',
  body: 'New stay requests arrive here, and your phone will buzz when they do.',
};

/** The server's status, in the badge set this app already draws. */
export const REQUEST_BADGE_FOR: Record<string, BookingStatus> = {
  pending_owner: 'pending',
  confirmed: 'confirmed',
  declined: 'declined',
  expired: 'expired',
  cancelled: 'cancelled',
};

/** "5 Sep" from a `YYYY-MM-DD` calendar day. */
export function shortDate(iso?: string | null): string {
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

/** Shared with `BookingsTab`, which renders the same request shape in its
    History tab — one mapping, so the two never draw a request differently. */
export function toRequestCard(request: BackendPartnerRequest, offsetMs: number): BookingRequest {
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
    status: REQUEST_BADGE_FOR[request.status] ?? 'pending',
    /*
     * Epoch ms, from the SERVER's deadline corrected for this device's clock.
     * The card colours its own border from urgency, so a phone running fast
     * would otherwise paint a request red a minute early. Meaningless once a
     * request is answered — `RequestCard` only draws the countdown while
     * `status === 'pending'` — but computed the same way regardless so a
     * request that arrives here already answered never divides by a stale
     * deadline.
     */
    expiresAt: Date.now() + secondsLeft(request, offsetMs) * 1000,
  };
}

export function RequestsInboxScreen() {
  const router = useRouter();
  const c = useColors();

  const queryClient = useQueryClient();
  const { groups, unread, isPending, error, clockOffset, isRefetching, refetch } = useStayRequests();

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

  /* Soonest-expiring first — the one thing here actually racing a clock. */
  const list = useMemo(
    () => [...groups.pending].sort(
      (a, b) => secondsLeft(a, clockOffset.current) - secondsLeft(b, clockOffset.current),
    ),
    [groups.pending, clockOffset],
  );

  return (
    <Screen
      contentStyle={styles.stack}
      refreshing={isRefetching}
      onRefresh={refetch}
      stickyHeader={(
        <>
          {/* No back affordance, which is what the design always assumed: this
              is a tab root now, and there is nothing behind it to go back to.
              It used to carry the inline chevron every pushed screen has,
              because it was reached from the dashboard. */}
          <Box style={styles.headerRow}>
            <IconButton
              name="plus"
              label="Add customer"
              onPress={() => router.push('/requests/add-customer')}
            />
          </Box>

          <Text variant="screenTitle">Requests</Text>
        </>
      )}
    >
      {/* A pending request is counting down, so the wait is worth naming. */}
      {list.length > 0 ? (
        <Text variant="label" style={{ color: c.textCaption }}>
          {list.length === 1 ? 'One student is' : `${list.length} students are`} waiting
          on you — {formatCountdown(secondsLeft(list[0], clockOffset.current))} left on the soonest
        </Text>
      ) : null}

      {isPending && !list.length ? (
        <Box style={styles.loading}>
          <Spinner color={c.accent} />
        </Box>
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
            request={toRequestCard(request, clockOffset.current)}
            onPress={() => router.push({ pathname: '/requests/[id]', params: { id: request.id } })}
          />
        ))
      ) : (
        <EmptyState
          icon="bookings"
          title={EMPTY_PENDING.title}
          body={EMPTY_PENDING.body}
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
