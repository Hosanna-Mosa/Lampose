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
 */

export function useTickets(enabled = true) {
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
