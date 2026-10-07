/* ══════════════════════════════════════════════════════════════════════════
   The rider ledger — STAFF side. `/v1/admin/rider-ledger`.

   A rider's wallet (owed to them) and outstanding (owed by them), the cash
   limit at which they stop getting cash-on-delivery orders, and corrections
   by hand. Reading is any administrator; writing is Super Admin
   (`riders.ledger`) and the server refuses it for anyone else.

   Amounts going OUT are rupees (signed for a correction); amounts coming
   back are PAISE, as the ledger keeps them.
   ══════════════════════════════════════════════════════════════════════════ */
import { api } from '../apiCaller';
import type { ApiResponse, RiderWallet } from '../types';

const BASE = '/v1/admin/rider-ledger';

export interface RiderLedgerSettings {
  /** False until `npm run rider-ledger:open -- --run` has been run. */
  opened: boolean;
  startedAt: string | null;
  codLimitPaise: number;
  minWithdrawalPaise: number;
  updatedBy: string;
}

export const riderLedgerService = {
  async getSettings(): Promise<ApiResponse<RiderLedgerSettings | null>> {
    const res = await api.get<{ data: RiderLedgerSettings }>(`${BASE}/settings`);
    return res.success ? { ...res, data: res.data?.data ?? null } : { ...res, data: null };
  },

  /** Rupees. Either or both. */
  async updateSettings(body: { codLimit?: number; minWithdrawal?: number }): Promise<ApiResponse<RiderLedgerSettings | null>> {
    const res = await api.patch<{ data: RiderLedgerSettings }>(`${BASE}/settings`, body);
    return res.success ? { ...res, data: res.data?.data ?? null } : { ...res, data: null };
  },

  /** Signed rupees: +50 outstanding = the rider owes ₹50 more. A reason is required. */
  async correct(
    driverId: string,
    body: { wallet?: number; outstanding?: number; reason: string }
  ): Promise<ApiResponse<RiderWallet | null>> {
    const res = await api.post<{ data: RiderWallet }>(`${BASE}/${driverId}/corrections`, body);
    return res.success ? { ...res, data: res.data?.data ?? null } : { ...res, data: null };
  },
};
