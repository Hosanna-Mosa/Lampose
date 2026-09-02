import { useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError } from '@/services/api/client';
import {
  createReport,
  createTicket,
  fetchTicket,
  fetchTickets,
  markTicketRead,
  replyToTicket,
  type CreateReportInput,
  type CreateTicketInput,
} from '@/services/api/support.api';
import { toTicket, toTickets, toTicketThread } from '@/services/adapters/support.adapter';
import type { BackendTicketDetail } from '@/services/api/types';
import {
  connectSupportSocket,
  onSupportEvent,
  watchTicket,
} from '@/services/support.socket';
import { queryKeys } from './keys';

/**
 * Support tickets and safety reports.
 *
 * Three hooks: the list, one thread, and the two writes that create a thread.
 *
 * ## Nothing here is optimistic
 *
 * The shortlist's bookmark is optimistic because the tap IS the interaction
 * and 400ms of nothing reads as a dropped press. This is the opposite case. A
 * student filing a report about an owner withholding their deposit needs to
 * know it actually reached us, and an optimistic row that silently rolls back
 * on a dead connection is precisely the failure that matters here — they would
 * believe it was sent, and nobody would have it. So the button stays in its
 * loading state until the server has the record, and a failure is shown.
 *
 * ## The live layer lives here, not on the screens
 *
 * `services/support.socket.ts` delivers a support reply the moment it is
 * written, and both hooks subscribe to it. It is wired at this layer because
 * this is the layer that owns the cache: an incoming message has to land in
 * `queryKeys.ticket(reference)` and not in a screen's `useState`, or the next
 * focus refetch — `refetchOnWindowFocus` is genuinely live in this app, see
 * `app/_layout.tsx` — would blow it away and the message would flicker out
 * and back in. Wiring it here also means the screens did not have to change
 * at all, which is what they were owed.
 *
 * Nothing below is a dependency on the connection. Every fetch, refetch and
 * pull-to-refresh that was here before is still here and still the thing that
 * makes the feature work; the socket only decides how quickly a reply shows
 * up on a screen somebody is already looking at.
 */

export function useTickets(enabled = true) {
  const client = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.ticketList,
    queryFn: ({ signal }) => fetchTickets(signal),
    enabled,
    /* Short, and refreshed on focus. The thing this screen exists to surface
       is a reply that arrived while the student was elsewhere. */
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: (count, error) => !(error instanceof ApiError && error.status > 0) && count < 1,
  });

  const backendTickets = query.data?.tickets ?? [];

  /* Formatted once per fetch rather than per render. `relativeWhen` reads the
     clock, so mapping inside the render body would recompute "2 days ago" on
     every keystroke elsewhere on the screen. */
  const tickets = useMemo(() => toTickets(backendTickets), [backendTickets]);

  /*
   * ── Live ──────────────────────────────────────────────────────────────
   *
   * No reference filter, and no `track_ticket`. A signed-in diner is put in
   * `customer:<id>` by the handshake alone and the server emits every support
   * event for every thread they own into it — so this list receives exactly
   * the events it wants and nothing else.
   *
   * The event's own `ticket` is NOT written into the cache. It is the
   * console's row (`toAdminSummary()`), and its `unread` means "the customer
   * said something support has not read" — the mirror image of the rule this
   * list draws. Writing it in would bold a row when the student last spoke
   * and clear it when support replied, which is precisely backwards. So the
   * event is treated as a signal that something moved, and the fetch that was
   * already here produces the correct row. Refetching a LIST costs none of
   * what makes refetching a thread wrong: there is no composer to blank and
   * no scroll position to lose.
   *
   * `query.isSuccess` is a trigger, not a permission. It is proof that the
   * token in `client.ts` has hydrated — a handshake sent before it does is
   * refused by the server and never retried, which would be a socket that is
   * dead for the whole session and silent about it.
   */
  const sessionProven = query.isSuccess;

  useEffect(() => {
    if (!enabled) return;
    if (sessionProven) connectSupportSocket();

    return onSupportEvent(() => {
      client.invalidateQueries({ queryKey: queryKeys.ticketList });
    });
  }, [enabled, sessionProven, client]);

  return {
    ...query,
    tickets,
    unread: query.data?.unread ?? 0,
    error: query.error as ApiError | null,
  };
}

/**
 * One thread, and the read watermark that goes with opening it.
 *
 * The mark-read call fires once the thread has actually loaded — not on
 * mount — because marking something read before it arrived is a claim about a
 * screen nobody has seen. It is deliberately fire-and-forget: a failed
 * watermark leaves the row bold, which is a harmless and self-correcting
 * outcome, and surfacing an error for it would put a failure banner over a
 * thread that loaded perfectly well.
 */
export function useTicket(reference: string | undefined) {
  const client = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.ticket(reference ?? ''),
    queryFn: ({ signal }) => fetchTicket(reference as string, signal),
    enabled: Boolean(reference),
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    /* A 404 here means the reference is not this customer's, which no amount
       of retrying changes. */
    retry: (count, error) => !(error instanceof ApiError && error.status > 0) && count < 1,
  });

  const detail = query.data;
  const hasUnread = Boolean(detail?.unread);

  useEffect(() => {
    if (!reference || !hasUnread) return;
    markTicketRead(reference)
      /* The list carries the bold row, so it is the thing that has to be told
         the mark moved. */
      .then(() => client.invalidateQueries({ queryKey: queryKeys.ticketList }))
      .catch(() => {});
  }, [reference, hasUnread, client]);

  /*
   * ── Live ──────────────────────────────────────────────────────────────
   *
   * The filter is the load-bearing part. The diner's own room carries events
   * for every thread they own, so a screen showing one and appending whatever
   * it hears would drop support's answer about a broken geyser into an open
   * conversation about a deposit. `watchTicket` compares references — both
   * sides uppercased, because the server uppercases before joining the room
   * while the payload carries the stored value — and additionally joins
   * `ticket:<reference>`.
   *
   * The message is APPENDED rather than fetched. A refetch here would replace
   * the whole thread under somebody's thumb mid-scroll, and it would do it at
   * the exact moment they are most likely to be reading — which is the moment
   * a support reply arrives.
   */
  const sessionProven = query.isSuccess;

  useEffect(() => {
    if (!reference) return;
    if (sessionProven) connectSupportSocket();

    return watchTicket(reference, (event) => {
      /* The row on the list carries the preview and the bold rule, and
         neither of them lives in this cache. */
      const refreshList = () => client.invalidateQueries({ queryKey: queryKeys.ticketList });

      const message = event.message;
      if (!message?.id) {
        /* No message means the queue moved the thread — a status, an
           outcome, a closure. The row that came with it is the console's, so
           it cannot be patched in; the thread is asked for again instead.
           React Query keeps the current data on screen while it refetches, so
           nothing blanks and the composer is untouched, and a status moves a
           handful of times in a thread's whole life. */
        client.invalidateQueries({ queryKey: queryKeys.ticket(reference) });
        refreshList();
        return;
      }

      client.setQueryData<BackendTicketDetail>(queryKeys.ticket(reference), (current) => {
        /* Nothing cached yet — the fetch that is already in flight will bring
           the message with the rest of the thread. */
        if (!current) return current;

        /*
         * The diner's OWN reply arrives here too.
         *
         * The server emits into the requester's room on the customer's own
         * POST, and the mutation below has already written the server's copy
         * of the thread into this same cache. Both paths stringify the same
         * `_id`, so the id is what tells the two copies apart — without this
         * check every sent message appears twice.
         */
        if (current.messages.some((existing) => existing.id === message.id)) return current;

        return {
          ...current,
          messages: [...current.messages, message],
          messageCount: current.messages.length + 1,
          /* Sliced the way the server slices it, so an appended row and a
             fetched one are the same shape rather than nearly the same. */
          lastMessagePreview: message.body.slice(0, 160),
          lastActivityAt: message.at,
          /* `unread` is deliberately left as it was. It is the input to the
             mark-read effect above, and flipping it true for a message that
             is on screen would fire a watermark POST and a list refetch per
             bubble — through an effect that only notices the first one. */
        };
      });

      if (message.author === 'customer') {
        refreshList();
        return;
      }

      /* Support has spoken into a thread that is open on the screen, and
         therefore into one that has been read. Moving the watermark here is
         what stops the list row going bold for a sentence somebody is looking
         at; the effect above cannot do it, because nothing set `unread`. */
      markTicketRead(reference)
        .catch(() => {
          /* A watermark that did not move leaves the row bold for one more
             screen, and opening the thread again corrects it. */
        })
        .then(refreshList);
    });
  }, [reference, sessionProven, client]);

  const messages = useMemo(() => (detail ? toTicketThread(detail) : []), [detail]);
  const ticket = useMemo(() => (detail ? toTicket(detail) : null), [detail]);

  const reply = useMutation({
    mutationFn: (body: string) => replyToTicket(reference as string, body),
    onSuccess: (updated) => {
      /* The response IS the new thread, so it is written straight into the
         cache rather than triggering a second round trip to fetch what we
         were just handed. */
      client.setQueryData(queryKeys.ticket(updated.reference), updated);
      client.invalidateQueries({ queryKey: queryKeys.ticketList });
    },
  });

  return {
    ...query,
    ticket,
    detail: detail ?? null,
    messages,
    /* The server refuses a reply to a closed thread with a 409, so the screen
       is told not to offer the box rather than finding out on send. */
    canReply: Boolean(detail) && detail?.status !== 'closed',
    sendReply: reply.mutateAsync,
    isSending: reply.isPending,
    sendError: reply.error as ApiError | null,
    error: query.error as ApiError | null,
  };
}

/**
 * The two writes that open a thread.
 *
 * Deliberately one hook exposing two separate mutations rather than one
 * mutation taking a kind. The whole architecture of this feature is that a
 * report and a ticket cannot be confused for each other, and it holds all the
 * way down: separate screens, separate hooks, separate API functions,
 * separate endpoints, and an immutable discriminator on the record.
 */
export function useCreateSupportRequest() {
  const client = useQueryClient();

  const refreshList = () => client.invalidateQueries({ queryKey: queryKeys.tickets });

  const ticket = useMutation({
    mutationFn: (input: CreateTicketInput) => createTicket(input),
    onSuccess: (created) => {
      client.setQueryData(queryKeys.ticket(created.reference), created);
      refreshList();
    },
  });

  const report = useMutation({
    mutationFn: (input: CreateReportInput) => createReport(input),
    onSuccess: (created) => {
      client.setQueryData(queryKeys.ticket(created.reference), created);
      refreshList();
    },
  });

  return {
    submitTicket: ticket.mutateAsync,
    isSubmittingTicket: ticket.isPending,
    ticketError: ticket.error as ApiError | null,

    submitReport: report.mutateAsync,
    isSubmittingReport: report.isPending,
    reportError: report.error as ApiError | null,
  };
}
