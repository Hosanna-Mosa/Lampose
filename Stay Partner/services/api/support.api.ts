import { api, unwrap, type ApiEnvelope } from './client';
import { endpoints } from './endpoints';

/* ══════════════════════════════════════════════════════════════════════════
   Support, from the owner's side.

   The same `SupportTicket` collection every other app reaches, through the
   owner's own guard (`/partners/support`, behind `requirePartner`) — see
   `Backend/src/modules/support/ticket.routes.js`. Two kinds of row can show
   up in this inbox, and the app tells them apart by `linkedPartnerId`:

     mine     an owner-filed ticket, about payouts, a listing, a guest's
              account or something else on this side of the product
     linked   a STUDENT's ticket, about one of this owner's properties —
              `linkedPartnerId` is set, and replying to one is answering the
              guest, not filing anything of the owner's own

   Both are read and answered through the same four calls below; only
   `createTicket` is one-sided, because an owner cannot open a ticket AS a
   linked one — that only happens from the student's side of the conversation.
   ══════════════════════════════════════════════════════════════════════════ */

export type SupportTicketStatus = 'open' | 'awaiting_customer' | 'resolved' | 'closed';

export type SupportMessage = {
  id: string;
  /** `partner` is this owner's own reply on a ticket a student filed. */
  author: 'customer' | 'support' | 'system' | 'partner';
  authorName: string;
  body: string;
  at: string;
};

export type BackendPartnerTicket = {
  reference: string;
  kind: 'ticket' | 'report';
  category: string | null;
  reason: string | null;
  subject: string;
  placeLabel: string;
  listingId: string | null;
  status: SupportTicketStatus;
  outcome: string;
  unread: boolean;
  messageCount: number;
  lastMessagePreview: string;
  lastActivityAt: string;
  createdAt: string;
  /** Null on this owner's own tickets; set to THIS owner's id on a guest's. */
  linkedPartnerId: string | null;
  linkedPartnerName: string;
};

export type BackendPartnerTicketDetail = BackendPartnerTicket & {
  evidenceRequired: boolean;
  messages: SupportMessage[];
};

export type SupportCategories = {
  audience: string;
  label: string;
  categories: string[];
  reports: boolean;
};

/** What this owner may open a ticket about — served, not hardcoded; see
    `support.audiences.js` for why. */
export async function fetchSupportCategories(signal?: AbortSignal): Promise<SupportCategories> {
  const res = await api.get<ApiEnvelope<SupportCategories>>(endpoints.partnerSupportCategories, { signal });
  return unwrap(res);
}

export type SupportTicketsResult = {
  tickets: BackendPartnerTicket[];
  unread: number;
};

export async function fetchSupportTickets(signal?: AbortSignal): Promise<SupportTicketsResult> {
  const res = await api.get<ApiEnvelope<BackendPartnerTicket[]> & { unread?: number }>(
    endpoints.partnerSupportTickets,
    { signal },
  );
  const data = unwrap(res);
  return {
    tickets: Array.isArray(data) ? data : [],
    unread: typeof res.unread === 'number' ? res.unread : 0,
  };
}

export async function fetchSupportTicket(
  reference: string,
  signal?: AbortSignal,
): Promise<BackendPartnerTicketDetail> {
  const res = await api.get<ApiEnvelope<BackendPartnerTicketDetail>>(
    endpoints.partnerSupportTicket(reference),
    { signal },
  );
  return unwrap(res);
}

export type CreateSupportTicketInput = {
  category: string;
  body: string;
  listingId?: string | null;
  placeLabel?: string | null;
};

/** Always this owner's OWN ticket — a linked one only ever arrives from a
    student's app. See the header. */
export async function createSupportTicket(
  input: CreateSupportTicketInput,
  signal?: AbortSignal,
): Promise<BackendPartnerTicketDetail> {
  const res = await api.post<ApiEnvelope<BackendPartnerTicketDetail>>(
    endpoints.partnerSupportTickets,
    {
      category: input.category,
      body: input.body,
      listingId: input.listingId ?? null,
      placeLabel: input.placeLabel ?? null,
    },
    { signal },
  );
  return unwrap(res);
}

export async function replyToSupportTicket(
  reference: string,
  body: string,
  signal?: AbortSignal,
): Promise<BackendPartnerTicketDetail> {
  const res = await api.post<ApiEnvelope<BackendPartnerTicketDetail>>(
    endpoints.partnerSupportTicketMessages(reference),
    { body },
    { signal },
  );
  return unwrap(res);
}

export async function markSupportTicketRead(reference: string, signal?: AbortSignal): Promise<void> {
  await api.post(endpoints.partnerSupportTicketRead(reference), undefined, { signal });
}
