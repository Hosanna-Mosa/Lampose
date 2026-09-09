/* ══════════════════════════════════════════════════════════════════════════
   Guest refunds — money going back to a guest whose paid stay was cancelled.

   Reads and writes `/v1/admin/refunds`. Reading is any signed-in
   administrator; paying or refusing is Super Admin, enforced on the server.

   ## The rule

   Full refund, whoever cancelled. The amount on every row is what the guest
   paid, and nothing in this file — or in the page — can change it.

   ## This queue carries a bank account number in full

   Unlike the payout queue, which shows a masked label, a refund row carries
   the guest's account number, IFSC and holder name unmasked: a person is
   about to type them into a banking app, and a masked number cannot be typed.
   The phone never sees this; only the console does.
   ══════════════════════════════════════════════════════════════════════════ */
import { api } from '../apiCaller';

const BASE = '/v1/admin/refunds';

/**
 *   awaiting_details   cancelled, owed, no account yet — cannot be paid
 *   pending            account given — waiting for somebody to transfer it
 *   paid               transferred, reference recorded
 *   rejected           refused, reason shown to the guest
 */
export type RefundStatus = 'awaiting_details' | 'pending' | 'paid' | 'rejected';

export type RefundBank = {
  accountName: string;
  /** In full. See the header. */
  accountNumber: string;
  ifsc: string;
  providedAt: string | null;
};

export type Refund = {
  id: string;
  bookingId: string;
  settlementId: string | null;
  customerId: string;
  propertyName: string;
  ownerPhoneDigits: string | null;
  guestName: string;
  guestPhone: string;
  checkInDate: string | null;
  /** Rupees. What the guest paid, in full. */
  amount: number;
  amountPaise: number;
  /**
   * WHO cancelled and WHY. The rule is a full refund either way, so these do
   * not change the amount — they change whether paying it is right, which is
   * the judgement the person confirming makes. An owner choosing "Guest
   * request" means the guest asked them to cancel.
   */
  cancelledBy: 'student' | 'owner';
  cancelReason: string | null;
  /** The owner's free-text note. Null on a guest cancellation (no note field). */
  cancelNote: string | null;
  /** Where the settlement was when the booking was cancelled. */
  settlementStatusAtCancel: string | null;
  /**
   * The owner had already been paid their share when this was cancelled.
   * The guest is still owed the full amount; recovering the owner's part is
   * a conversation, and this flag is what starts it.
   */
  ownerAlreadyPaid: boolean;
  status: RefundStatus;
  bank: RefundBank | null;
  reference: string | null;
  paidAt: string | null;
  paidByAdminName: string;
  rejectedReason: string | null;
  createdAt: string;
};

export class RefundError extends Error {
  code: string;

  status: number;

  constructor(message: string, code = 'FAILED', status = 0) {
    super(message);
    this.name = 'RefundError';
    this.code = code;
    this.status = status;
  }
}

const fail = (res: any, fallback: string): never => {
  const body = res?.data ?? {};
  throw new RefundError(body.message || res?.message || fallback, body.code || res?.code || 'FAILED', res?.status ?? 0);
};

export const refundService = {
  async list(status?: RefundStatus | 'All'): Promise<Refund[]> {
    const res = await api.get<{ data: Refund[] }>(BASE, status && status !== 'All' ? { status } : undefined);
    if (!res.success) fail(res, 'Could not load the refund queue.');
    return res.data?.data ?? [];
  },

  /** Record the transfer a person made. Refused until the guest has given an account. */
  async markPaid(id: string, reference: string): Promise<Refund> {
    const res = await api.post<{ data: Refund }>(`${BASE}/${id}/mark-paid`, { reference });
    if (!res.success || !res.data?.data) fail(res, 'Could not record that refund.');
    return res.data!.data;
  },

  /** Refuse a refund. The reason is shown to the guest. */
  async reject(id: string, reason: string): Promise<Refund> {
    const res = await api.post<{ data: Refund }>(`${BASE}/${id}/reject`, { reason });
    if (!res.success || !res.data?.data) fail(res, 'Could not refuse that refund.');
    return res.data!.data;
  },
};

export default refundService;
