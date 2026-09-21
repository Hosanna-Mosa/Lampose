/* ══════════════════════════════════════════════════════════════════════════
   The support queue — the console's side.

   Reads `/v1/admin/support`, the v1 admin surface behind the same admin token
   every other service here uses. The three apps reach the same collection
   through `/v2/support`, `/v2/drivers/support` and `/v2/food-partners/support`
   — three routers, each of which can only ever see its own author's threads.
   The console never touches those.

   Versioned in the path deliberately: the unversioned aliases in
   `routes/index.js` exist to keep callers written before versioning working,
   not to hand new ones a second spelling to drift onto.

   ## Everything is normalised on the way in

   The page renders a thread somebody is going to read while a person waits on
   the other end, so a missing field must degrade to an empty string rather
   than to `undefined` rendered as "undefined" in a message bubble. Every row
   that crosses this file goes through `normalizeRow`.
   ══════════════════════════════════════════════════════════════════════════ */
import { api } from '../apiCaller';
import type { ApiResponse } from '../types';

const BASE = '/v1/admin/support';

/* ------------------------------------------------------------------ *
 * Shapes
 * ------------------------------------------------------------------ */

/** Which app a thread came from. The same four words the socket layer uses. */
export type RequesterKind = 'customer' | 'driver' | 'restaurant' | 'partner';

export type TicketStatus = 'open' | 'awaiting_customer' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';

/**
 * `system` is not a support message with a flag.
 *
 * It records what HAPPENED rather than what anyone said, and the thread draws
 * it as a rule rather than a bubble — giving a process event the shape of
 * speech lets it be mistaken for a person's promise.
 *
 * `partner` is the property owner's voice on a ticket a STUDENT filed — see
 * `linkedPartnerId`/`linkedPartnerName` on `SupportRow` below. It is never the
 * tag on an owner's OWN ticket (those use `customer`, the generic
 * "requester" tag every non-diner audience's own messages carry).
 */
export type MessageAuthor = 'customer' | 'support' | 'system' | 'partner';

export interface SupportMessage {
  id: string;
  author: MessageAuthor;
  authorName: string;
  body: string;
  at: string;
}

export interface SupportRequester {
  kind: RequesterKind;
  id: string;
  name: string;
  phone: string;
}

export interface SupportRow {
  reference: string;
  /** `ticket` or `report` — two queues, and a report is never a ticket. */
  kind: 'ticket' | 'report';
  category: string | null;
  reason: string | null;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  outcome: string;
  placeLabel: string;
  listingId: string | null;
  orderNumber: string | null;
  evidenceRequired: boolean;
  requester: SupportRequester;
  /* Set only on a `property` ticket a student filed, where an owner could be
     resolved for the listing named — see `resolveLinkedPartner` on the
     backend. Null on every platform-category ticket and on every ticket an
     owner filed about their own account; that null is the whole mechanism
     that keeps a platform issue (a payment, the app) from ever reaching an
     owner. */
  linkedPartnerId: string | null;
  linkedPartnerName: string;
  assignedToId: string | null;
  assignedToName: string;
  /** Something the REQUESTER said that support has not read. */
  unread: boolean;
  messageCount: number;
  lastMessageAuthor: MessageAuthor | null;
  lastMessagePreview: string;
  lastActivityAt: string;
  createdAt: string;
}

export interface SupportThread extends SupportRow {
  messages: SupportMessage[];
}

export interface SupportStats {
  audiences: Record<string, number>;
  statuses: Record<string, number>;
  openReports: number;
  unassigned: number;
  mine: number;
  audienceLabels: Record<string, string>;
}

export interface QueueQuery {
  audience?: RequesterKind | '';
  kind?: 'ticket' | 'report' | '';
  /** `active` is the default view: open + awaiting_customer. */
  status?: TicketStatus | 'active' | '';
  priority?: TicketPriority | '';
  assigned?: 'me' | 'unassigned' | 'any' | '';
  q?: string;
  page?: number;
  limit?: number;
}

export interface QueuePage {
  rows: SupportRow[];
  total: number;
  page: number;
  pages: number;
}

/* ------------------------------------------------------------------ *
 * Normalising
 * ------------------------------------------------------------------ */

const str = (value: unknown, fallback = ''): string => (
  typeof value === 'string' ? value : fallback
);

const normalizeMessage = (raw: any): SupportMessage => ({
  id: str(raw?.id),
  author: (['customer', 'support', 'system', 'partner'].includes(raw?.author)
    ? raw.author : 'system') as MessageAuthor,
  authorName: str(raw?.authorName),
  body: str(raw?.body),
  at: str(raw?.at),
});

const normalizeRow = (raw: any): SupportRow => ({
  reference: str(raw?.reference),
  kind: raw?.kind === 'report' ? 'report' : 'ticket',
  category: raw?.category ?? null,
  reason: raw?.reason ?? null,
  subject: str(raw?.subject, '(no subject)'),
  status: (['open', 'awaiting_customer', 'resolved', 'closed'].includes(raw?.status)
    ? raw.status : 'open') as TicketStatus,
  priority: (['low', 'normal', 'high', 'urgent'].includes(raw?.priority)
    ? raw.priority : 'normal') as TicketPriority,
  outcome: str(raw?.outcome),
  placeLabel: str(raw?.placeLabel),
  listingId: raw?.listingId ?? null,
  orderNumber: raw?.orderNumber ?? null,
  evidenceRequired: !!raw?.evidenceRequired,
  requester: {
    kind: (['customer', 'driver', 'restaurant', 'partner'].includes(raw?.requester?.kind)
      ? raw.requester.kind : 'customer') as RequesterKind,
    id: str(raw?.requester?.id),
    /* A thread with no name on it is still a thread somebody has to answer, so
       it gets a placeholder rather than an empty row that looks like a bug. */
    name: str(raw?.requester?.name) || 'Unnamed',
    phone: str(raw?.requester?.phone),
  },
  linkedPartnerId: raw?.linkedPartnerId ?? null,
  linkedPartnerName: str(raw?.linkedPartnerName),
  assignedToId: raw?.assignedToId ?? null,
  assignedToName: str(raw?.assignedToName),
  unread: !!raw?.unread,
  messageCount: Number(raw?.messageCount) || 0,
  lastMessageAuthor: raw?.lastMessageAuthor ?? null,
  lastMessagePreview: str(raw?.lastMessagePreview),
  lastActivityAt: str(raw?.lastActivityAt),
  createdAt: str(raw?.createdAt),
});

const normalizeThread = (raw: any): SupportThread => ({
  ...normalizeRow(raw),
  messages: Array.isArray(raw?.messages) ? raw.messages.map(normalizeMessage) : [],
});

/* ------------------------------------------------------------------ *
 * Calls
 * ------------------------------------------------------------------ */

export const supportService = {
  /** The queue, filtered. */
  async list(query: QueueQuery = {}): Promise<ApiResponse<QueuePage>> {
    /* Empty strings are dropped rather than sent: `?audience=` would be read
       by the server as a filter on the empty audience, which matches nothing,
       and the page would go blank the moment somebody cleared a filter. */
    const params: Record<string, string | number> = {};
    (Object.keys(query) as (keyof QueueQuery)[]).forEach((key) => {
      const value = query[key];
      if (value !== undefined && value !== null && value !== '') {
        params[key] = value as string | number;
      }
    });

    const res = await api.get<any>(`${BASE}/tickets`, params);
    if (!res.success) return { ...res, data: { rows: [], total: 0, page: 1, pages: 1 } };

    const raw = res.data;
    return {
      ...res,
      data: {
        rows: Array.isArray(raw?.data) ? raw.data.map(normalizeRow) : [],
        total: Number(raw?.total) || 0,
        page: Number(raw?.page) || 1,
        pages: Number(raw?.pages) || 1,
      },
    };
  },

  /** The counts above the queue. */
  async stats(): Promise<ApiResponse<SupportStats>> {
    const res = await api.get<any>(`${BASE}/stats`);
    const empty: SupportStats = {
      audiences: {}, statuses: {}, openReports: 0, unassigned: 0, mine: 0, audienceLabels: {},
    };
    if (!res.success) return { ...res, data: empty };
    return { ...res, data: { ...empty, ...(res.data?.data || {}) } };
  },

  /** One thread, in full. */
  async thread(reference: string): Promise<ApiResponse<SupportThread | null>> {
    const res = await api.get<any>(`${BASE}/tickets/${encodeURIComponent(reference)}`);
    if (!res.success || !res.data?.data) return { ...res, data: null };
    return { ...res, data: normalizeThread(res.data.data) };
  },

  /**
   * Answer somebody.
   *
   * `hold` keeps an open ticket open instead of moving it to
   * `awaiting_customer` — for the case where support is saying "we are looking
   * into it" rather than asking a question, and moving the ball to the
   * requester would take it off the active queue while the work is still ours.
   */
  async reply(
    reference: string,
    body: string,
    options: { hold?: boolean } = {},
  ): Promise<ApiResponse<SupportThread | null>> {
    const res = await api.post<any>(
      `${BASE}/tickets/${encodeURIComponent(reference)}/messages`,
      { body, ...(options.hold ? { hold: true } : {}) },
    );
    if (!res.success || !res.data?.data) return { ...res, data: null };
    return { ...res, data: normalizeThread(res.data.data) };
  },

  /** Status, outcome, priority. */
  async update(
    reference: string,
    patch: { status?: TicketStatus; outcome?: string; priority?: TicketPriority },
  ): Promise<ApiResponse<SupportThread | null>> {
    const res = await api.patch<any>(`${BASE}/tickets/${encodeURIComponent(reference)}`, patch);
    if (!res.success || !res.data?.data) return { ...res, data: null };
    return { ...res, data: normalizeThread(res.data.data) };
  },

  /**
   * Claim it, hand it over, or drop it.
   *
   * No argument claims it for whoever is signed in — the common case, one
   * click. `null` puts it back in the pile.
   */
  async assign(
    reference: string,
    to?: { adminId: string | null; name?: string },
  ): Promise<ApiResponse<SupportRow | null>> {
    const res = await api.post<any>(
      `${BASE}/tickets/${encodeURIComponent(reference)}/assign`,
      to ? { adminId: to.adminId, name: to.name } : {},
    );
    if (!res.success || !res.data?.data) return { ...res, data: null };
    return { ...res, data: normalizeRow(res.data.data) };
  },

  /** Move the QUEUE's read watermark — "somebody looked at this". */
  async markRead(reference: string): Promise<ApiResponse<SupportRow | null>> {
    const res = await api.post<any>(`${BASE}/tickets/${encodeURIComponent(reference)}/read`, {});
    if (!res.success || !res.data?.data) return { ...res, data: null };
    return { ...res, data: normalizeRow(res.data.data) };
  },
};

export default supportService;
