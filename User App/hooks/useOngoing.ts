import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/context/AuthContext';
import { fetchStayRequests } from '@/services/api/stayRequests.api';
import type { OngoingItem } from '@/components/shell';

/**
 * Everything half-finished, and whether it blocks a new booking.
 *
 * ## One definition, three readers
 *
 * The home strip draws these, the listing screen refuses a second booking on
 * them, and the server enforces the same rule in `stayRequest.service.js`.
 * Three copies of "what counts as in progress" would drift, and the way they
 * would drift is the worst one: an app that lets somebody start a booking the
 * server then refuses.
 *
 * ## It reads the REQUESTS, not the bookings, and not local state
 *
 * The first version of this read two other sources and both were wrong in the
 * same direction — they under-reported, so the gate let a second booking
 * through:
 *
 *   `usePendingRequest`   in-memory React state, set by the confirmation
 *                         screen. A request left waiting overnight is invisible
 *                         to it the moment the app is killed, and a request
 *                         sent from another device never existed for it. That
 *                         is precisely the case somebody hits: ask an owner,
 *                         close the app, come back, ask a second owner.
 *
 *   `GET /customers/bookings`  nothing exists there until the owner ACCEPTS.
 *                         The entire pending stage — the one that holds a bed
 *                         and runs a clock — is invisible to it.
 *
 * `GET /customers/stay-requests` is the same collection the server's own gate
 * queries, settles expiries on the way past, and carries the payment
 * subdocument. So the app and the server now answer the question from one
 * place, and the answer survives a restart, a reinstall and a second handset.
 *
 * ## What counts, and what blocks
 *
 *   pending_owner        an owner's clock is running.        BLOCKS
 *   confirmed + owed     accepted, the fee is unpaid.        BLOCKS
 *   paid, no slot yet    the visit needs a day and a time.   shown, does not block
 *   owner marked them in the student has to confirm it.      shown, does not block
 *
 * The last two do not block because the booking has SUCCEEDED — the money is
 * in and a bed is theirs. What is left is theirs to finish, not a reason to
 * stop them looking at anything else.
 *
 * Everything else has landed. Declined, expired and cancelled are a FAILURE
 * and unblock at once — which is exactly when somebody turned down by one
 * owner starts looking at the next. A confirmed request that is paid for (or
 * had nothing to pay, which is every PG) is a SUCCESS: the process finished,
 * and the tenancy that follows is not the process.
 */

/**
 * The key every mutation that ENDS a stage has to invalidate.
 *
 * Exported rather than written out twice: the strip is a cache, and a cache
 * nobody invalidates is how a finished booking keeps asking to be finished.
 */
export const ongoingQueryKey = ['stay-requests', 'mine'] as const;

export type Ongoing = {
  /** Everything to show, in the order the flow reaches them. */
  items: OngoingItem[];
  /**
   * The one that stops a new booking being started, or null. Its `title` is
   * the property to name in the warning.
   */
  blocking: OngoingItem | null;
};

export function useOngoing(): Ongoing {
  const { status } = useAuth();

  const query = useQuery({
    queryKey: ongoingQueryKey,
    queryFn: ({ signal }) => fetchStayRequests(signal),
    enabled: status === 'signedIn',
    /* Short, because this gates a button. A student who has just paid or just
       been declined should not be told otherwise for a minute. */
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });

  return useMemo(() => {
    const items: OngoingItem[] = [];
    let blocking: OngoingItem | null = null;

    for (const request of query.data?.requests ?? []) {
      const owed = Boolean(request.payment?.required) && request.payment?.status !== 'paid';

      if (request.status === 'pending_owner') {
        const item: OngoingItem = {
          key: `listing-${request.listingId}`,
          title: request.propertyName,
          status: 'Waiting on the owner',
          tone: 'waiting',
        };
        items.push(item);
        blocking = blocking ?? item;
        continue;
      }

      if (request.status !== 'confirmed') continue;

      if (owed) {
        const item: OngoingItem = {
          key: `listing-${request.listingId}`,
          title: request.propertyName,
          status: 'Payment pending',
          tone: 'action',
        };
        items.push(item);
        blocking = blocking ?? item;
        continue;
      }

      /* Paid, and the visit has no day on it. Past the blocking stages — the
         money is in — but still the student's to finish. */
      if (request.payment?.required
        && (request.payment.purpose ?? 'assisted_visit') === 'assisted_visit'
        && request.lamposeVisit?.status !== 'scheduled'
        && request.lamposeVisit?.status !== 'manual') {
        items.push({
          key: `listing-${request.listingId}`,
          title: request.propertyName,
          status: 'Pick your visit slot',
          tone: 'action',
        });
        continue;
      }

      /*
       * Moving in no longer puts a row here, and the row it used to put is
       * the point.
       *
       * It read "Confirm your move-in" and appeared once the owner had marked
       * the student in — the strip's whole job being to carry the things the
       * student still has to DO. The owner entering the entry PIN is now the
       * entire move-in (see `withMoveIn` on the server), so there is nothing
       * left for them to do and therefore nothing to put in a strip of
       * outstanding actions.
       *
       * Deliberately not replaced with a "you have moved in" row. This strip
       * is for work, not for news: a row nobody can act on is one more thing
       * to scroll past on every screen, and the booking screen already says
       * it in the place somebody goes to read it.
       */
    }

    /* One place never occupies two rows. A student can hold at most one live
       request per listing, but a settled one and a live one can both come
       back in the same page. */
    const unique = items.filter(
      (item, i, all) => all.findIndex((other) => other.key === item.key) === i,
    );

    return { items: unique, blocking };
  }, [query.data]);
}
