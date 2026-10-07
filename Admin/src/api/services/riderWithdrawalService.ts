/* ══════════════════════════════════════════════════════════════════════════
   Rider wallet withdrawals — the STAFF side.

   Reads `/v1/admin/rider-withdrawals`. A rider asks from their app; the
   amount has already left their wallet. Somebody here makes the transfer and
   records it with the reference, or refuses it and the money goes back to
   the rider's wallet. Nothing here moves money.

   Amounts are PAISE, as the rider ledger keeps them — format with
   `rupeesFromPaise`, never `rupees`.
   ══════════════════════════════════════════════════════════════════════════ */
import { api } from '../apiCaller';
import type { ApiResponse } from '../types';

const BASE = '/v1/admin/rider-withdrawals';

export type RiderWithdrawalStatus = 'requested' | 'paid' | 'rejected';

export interface RiderWithdrawalRow {
  withdrawalId: string;
  driverId: string;
  driverName: string;
  driverPhone: string;
  amountPaise: number;
  status: RiderWithdrawalStatus;
  /** Snapshotted when the rider asked. `bankAccountNumber` only comes back
   *  from `get` to a Super Admin — the person who may pay it. */
  account: {
    accountHolderName: string;
    accountLast4: string;
    ifscCode: string;
    bankName: string;
    upiId: string;
    bankAccountNumber?: string;
  };
  requestedAt: string;
  paidAt: string | null;
  reference: string;
  rejectedAt: string | null;
  rejectionReason: string;
  decidedBy: string;
}

export interface RiderWithdrawalQueue {
  items: RiderWithdrawalRow[];
  /** Per status, unfiltered, with the paise in each. */
  counts: Partial<Record<RiderWithdrawalStatus, { count: number; amountPaise: number }>>;
}

const EMPTY: RiderWithdrawalQueue = { items: [], counts: {} };

export const riderWithdrawalService = {
  /** `status`: requested | paid | rejected | all. */
  async list(params: { status?: string } = {}): Promise<ApiResponse<RiderWithdrawalQueue>> {
    const res = await api.get<{ data: RiderWithdrawalQueue }>(BASE, params);
    return res.success ? { ...res, data: res.data?.data ?? EMPTY } : { ...res, data: EMPTY };
  },

  async get(withdrawalId: string): Promise<ApiResponse<RiderWithdrawalRow | null>> {
    const res = await api.get<{ data: RiderWithdrawalRow }>(`${BASE}/${withdrawalId}`);
    return res.success ? { ...res, data: res.data?.data ?? null } : { ...res, data: null };
  },

  /** `money.release` — Super Admin. The reference is required by the server. */
  async markPaid(withdrawalId: string, reference: string): Promise<ApiResponse<RiderWithdrawalRow | null>> {
    const res = await api.post<{ data: RiderWithdrawalRow }>(`${BASE}/${withdrawalId}/paid`, { reference });
    return res.success ? { ...res, data: res.data?.data ?? null } : { ...res, data: null };
  },

  /** Refuse it. The amount goes back into the rider's wallet. */
  async reject(withdrawalId: string, reason: string): Promise<ApiResponse<RiderWithdrawalRow | null>> {
    const res = await api.post<{ data: RiderWithdrawalRow }>(`${BASE}/${withdrawalId}/reject`, { reason });
    return res.success ? { ...res, data: res.data?.data ?? null } : { ...res, data: null };
  },
};
