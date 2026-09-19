/* ══════════════════════════════════════════════════════════════════════════
   Restaurant payout requests — the STAFF side.

   Reads `/v1/admin/food-payouts`, which answers to an `admins` token. The
   restaurant's own console reads `/v1/restaurant-admin/payouts` through
   `restaurantAdminService` and sees only its own rows; nothing in this file
   is reachable with an owner's session and nothing there is reachable with
   a staff one.

   A separate service from `restaurantAdminService` for exactly that reason —
   they are two audiences, two identity systems and two route trees. The
   shapes overlap because they describe one row; the calls do not.

   ## Marking one paid is a claim, not a transfer

   Nothing here moves money. A member of staff makes the bank transfer
   themselves and records it with the bank's reference. The reference is
   required by the server, because a row marked paid without one is a claim
   nobody can check afterwards.
   ══════════════════════════════════════════════════════════════════════════ */
import { api } from '../apiCaller';
import type { ApiResponse } from '../types';

const BASE = '/v1/admin/food-payouts';

export type FoodPayoutStatus = 'pending' | 'paid' | 'rejected';

export interface FoodPayoutRow {
  payoutId: string;
  restaurantId: string;
  restaurantName: string;
  amount: number;
  status: FoodPayoutStatus;
  orderCount: number;
  orderNumbers: string[];
  /** Snapshotted when the owner asked — never a live account reference. */
  account: {
    accountId?: string;
    label?: string;
    accountHolderName?: string;
    accountLast4?: string;
    ifscCode?: string;
    accountType?: string;
    upiId?: string;
  };
  requestedAt: string;
  paidAt: string | null;
  reference: string;
  paidByAdminName: string;
  rejectionReason: string;
  rejectedAt: string | null;
}

export interface FoodPayoutQueue {
  rows: FoodPayoutRow[];
  /** Per-status tallies, computed unfiltered so a badge cannot depend on the
   *  tab that happens to be open. */
  counts: Partial<Record<FoodPayoutStatus, number>>;
  /** Money asked for and not yet sent — the number the page is opened for. */
  owed: number;
}

export const foodPayoutService = {
  /** `status` accepts a comma-joined list, or 'all'. */
  async list(params: { status?: string; limit?: number } = {}): Promise<ApiResponse<FoodPayoutQueue>> {
    const res = await api.get<{
      data: FoodPayoutRow[];
      counts: Partial<Record<FoodPayoutStatus, number>>;
      owed: number;
    }>(BASE, params);
    return res.success
      ? {
        ...res,
        data: { rows: res.data?.data ?? [], counts: res.data?.counts ?? {}, owed: res.data?.owed ?? 0 },
      }
      : { ...res, data: { rows: [], counts: {}, owed: 0 } };
  },

  async get(payoutId: string): Promise<ApiResponse<FoodPayoutRow | null>> {
    const res = await api.get<{ data: FoodPayoutRow }>(`${BASE}/${payoutId}`);
    return res.success ? { ...res, data: res.data?.data ?? null } : { ...res, data: null };
  },

  /**
   * Record a transfer that has already been made.
   *
   * `money.release` — Super Admin. The server refuses an empty reference and
   * refuses a row that is already settled (409 ALREADY_SETTLED), so a double
   * click cannot produce two payments against one request.
   */
  async markPaid(
    payoutId: string,
    reference: string,
    note?: string
  ): Promise<ApiResponse<FoodPayoutRow | null>> {
    const res = await api.post<{ data: FoodPayoutRow }>(`${BASE}/${payoutId}/paid`, {
      reference,
      note,
    });
    return res.success ? { ...res, data: res.data?.data ?? null } : { ...res, data: null };
  },

  /** Refuse it. The orders it held go back to the restaurant's balance. */
  async reject(payoutId: string, reason: string): Promise<ApiResponse<FoodPayoutRow | null>> {
    const res = await api.post<{ data: FoodPayoutRow }>(`${BASE}/${payoutId}/reject`, { reason });
    return res.success ? { ...res, data: res.data?.data ?? null } : { ...res, data: null };
  },
};
