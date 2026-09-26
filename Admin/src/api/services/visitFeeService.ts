/* ══════════════════════════════════════════════════════════════════════════
   Visit fees — what an assisted visit costs, per layout.

   Reads and writes `/v1/admin/visit-fees`. Amounts travel in PAISE, the unit
   the server stores and Razorpay charges; the page converts to rupees for
   the person typing and back again, and nothing else here does arithmetic.

   Reading is open to any administrator. Saving is Super Admin only, and the
   server refuses it for anybody else whatever this console draws.
   ══════════════════════════════════════════════════════════════════════════ */
import { api } from '../apiCaller';

const BASE = '/v1/admin/visit-fees';

export type VisitFeeTier = {
  key: string;
  label: string;
  note: string;
  amountPaise: number;
  defaultPaise: number;
};

export type VisitFeeChange = {
  at: string;
  by: { name: string; email: string; role: string };
  before: Record<string, number>;
  after: Record<string, number>;
};

export type VisitFees = {
  tiers: VisitFeeTier[];
  updatedAt: string | null;
  updatedBy: { name: string; email: string } | null;
  limits: { minPaise: number; maxPaise: number };
  history: VisitFeeChange[];
};

export class VisitFeeError extends Error {
  code: string;

  status: number;

  constructor(message: string, code = 'FAILED', status = 0) {
    super(message);
    this.name = 'VisitFeeError';
    this.code = code;
    this.status = status;
  }
}

const fail = (res: any, fallback: string): never => {
  const body = res?.data ?? {};
  throw new VisitFeeError(body.message || res?.message || fallback, body.code || res?.code || 'FAILED', res?.status ?? 0);
};

export const visitFeeService = {
  async get(): Promise<VisitFees> {
    const res = await api.get<{ data: VisitFees }>(BASE);
    if (!res.success || !res.data?.data) fail(res, 'Could not load the visit fees.');
    return res.data!.data;
  },

  /** Only the tiers that changed, `{ '2BHK': 99900 }`. */
  async update(tiers: Record<string, number>): Promise<VisitFees> {
    const res = await api.put<{ data: VisitFees }>(BASE, { tiers });
    if (!res.success || !res.data?.data) fail(res, 'Could not save the visit fees.');
    return res.data!.data;
  },
};

export default visitFeeService;
