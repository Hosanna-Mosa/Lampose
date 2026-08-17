import { api, unwrap, type ApiEnvelope } from './client';
import { endpoints } from './endpoints';
import type { BackendTicket, BackendTicketDetail } from './types';

/**
 * Support tickets and safety reports.
 *
 * ## Filing a report is its own function, not a flag
 *
 * `createTicket` and `createReport` call different endpoints, and that is
 * deliberate rather than incidental. The two paths have different queues,
 * different rules about what the owner is told, and different minimum
 * evidence. One function with a `kind` argument is one typo away from putting
 * an allegation about a person into the billing queue, and the failure would
 * be silent: the student sees the same confirmation either way.
 *
 * ## Nothing here formats anything for display
 *
 * The server sends ISO timestamps and raw status words. Turning those into
 * "2 days ago" happens in `adapters/support.adapter.ts`, in the reader's own
 * timezone — a server in UTC deciding what "yesterday" means for a student in
 * IST gets it wrong for two hours every night.
 */

export type TicketsResult = {
  tickets: BackendTicket[];
  /** How many carry something the customer has not seen. */
  unread: number;
};

export async function fetchTickets(signal?: AbortSignal): Promise<TicketsResult> {
  const envelope = await api.get<ApiEnvelope<BackendTicket[]> & { unread?: number }>(
    endpoints.supportTickets,
    { signal },
  );
  const data = unwrap(envelope);

  return {
    tickets: Array.isArray(data) ? data : [],
    unread: typeof envelope.unread === 'number' ? envelope.unread : 0,
  };
}

export async function fetchTicket(
  reference: string,
  signal?: AbortSignal,
): Promise<BackendTicketDetail> {
  const envelope = await api.get<ApiEnvelope<BackendTicketDetail>>(
    endpoints.supportTicket(reference),
    { signal },
  );
  return unwrap(envelope);
}

export type CreateTicketInput = {
  /** One of the six the app offers. The server rejects anything else. */
  category: string;
  body: string;
  /** What it is about, where there is one. Both optional — "a payment" is
      about nothing in the catalogue. */
  listingId?: string | null;
  placeLabel?: string | null;
};

export async function createTicket(
  input: CreateTicketInput,
  signal?: AbortSignal,
): Promise<BackendTicketDetail> {
  const envelope = await api.post<ApiEnvelope<BackendTicketDetail>>(
    endpoints.supportTickets,
    {
      category: input.category,
      body: input.body,
      listingId: input.listingId ?? null,
      placeLabel: input.placeLabel ?? null,
    },
    { signal },
  );
  return unwrap(envelope);
}

export type CreateReportInput = {
  /** One of the six reasons on the report screen, by id. */
  reason: string;
  body: string;
  listingId?: string | null;
  placeLabel?: string | null;
};

/**
 * The heavier path. The server enforces the same 50-character floor the form
 * does — a report that cannot be investigated consumes the safety queue's
 * time and tells the student they were heard.
 */
export async function createReport(
  input: CreateReportInput,
  signal?: AbortSignal,
): Promise<BackendTicketDetail> {
  const envelope = await api.post<ApiEnvelope<BackendTicketDetail>>(
    endpoints.supportReports,
    {
      reason: input.reason,
      body: input.body,
      listingId: input.listingId ?? null,
      placeLabel: input.placeLabel ?? null,
    },
    { signal },
  );
  return unwrap(envelope);
}

export async function replyToTicket(
  reference: string,
  body: string,
  signal?: AbortSignal,
): Promise<BackendTicketDetail> {
  const envelope = await api.post<ApiEnvelope<BackendTicketDetail>>(
    endpoints.supportTicketMessages(reference),
    { body },
    { signal },
  );
  return unwrap(envelope);
}

/**
 * Moves the read watermark on one thread.
 *
 * A call of its own rather than a side effect of the GET, matching the
 * backend: a refetch or a retry must not be able to clear an unread mark
 * nobody actually looked at.
 */
export async function markTicketRead(reference: string, signal?: AbortSignal): Promise<void> {
  await api.post(endpoints.supportTicketRead(reference), undefined, { signal });
}
