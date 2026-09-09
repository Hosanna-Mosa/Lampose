/* ══════════════════════════════════════════════════════════════════════════
   Partner payouts — paying a Stay Partner owner what their bookings earned.

   Reads and writes `/v1/admin/partner-payouts`, behind the same admin token
   every other service here uses. Super Admin only, on the server, on both
   calls — this file does not enforce that and must not pretend to; it hides
   the button for everyone else so nobody is offered an action that will
   fail, which is a courtesy, not the guard.

   ## One request, two kinds of money

   An owner asks for both halves at once, because they leave as one transfer:

     · COMMISSION OWED on completed PG, hostel and co-living bookings, where
       the owner collected the guest's money themselves.

     · HOTEL SETTLEMENTS, where the guest paid Lampose and we hold their
       share. Only settlements whose guest has CHECKED IN are claimable, so a
       request can never include money still inside its refund window.

   `monitorService` remains the hotel LEDGER — the split, the commission, the
   per-booking history. It is the same rows read for a different question, and
   the screens stay separate for that reason.

   ## Nothing here computes or sends an amount

   The figure was fixed when the owner requested it and is stored on the row.
   Neither `markPaid` nor `process` carries one: a console that could name an
   amount is a console that could name the wrong one. The only thing this file
   ever sends is a reference somebody typed and a reason.
   ══════════════════════════════════════════════════════════════════════════ */
import { api } from '../apiCaller';

const BASE = '/v1/admin/partner-payouts';

/**
 * Where a payout is.
 *
 * `processing` is the honest resting state after dispatch — RazorpayX answers
 * `queued` far more often than `processed`, and money that is queued has not
 * reached a bank. A row becomes `completed` when the payout webhook says so.
 */
export type PartnerPayoutStatus = 'pending' | 'processing' | 'completed' | 'failed';

export type PartnerPayout = {
  id: string;
  /** The owner, by the ten digits every partner collection is keyed on. */
  partnerPhoneDigits: string;
  /** Their name, joined on the server — a queue of phone numbers is unusable
      when somebody rings up about their money. */
  ownerName: string;
  /** How many hotel settlements this payout covers, beside the bookings. */
  settlementCount: number;
  /** Paid by a person making a bank transfer rather than by RazorpayX. */
  paidManually: boolean;
  paidByAdminName: string;
  /** RUPEES. Stay Partner money is rupees end to end; only the RazorpayX
      boundary converts, inside `payout.service.js`. */
  amount: number;
  status: PartnerPayoutStatus;
  /** "Anjali Rao •••• 4821" — a label, never a full account number. */
  bankAccount: string | null;
  /** How many completed bookings this payout covers. */
  bookingIds: string[];
  /** RazorpayX's payout id, once dispatched. */
  referenceId: string | null;
  /** The bank's UTR, once the payout is processed. */
  razorpayReferenceId: string | null;
  failureReason: string | null;
  requestedAt: string | null;
  processedAt: string | null;
  payoutDate: string | null;
  createdAt: string;
};

/** A refusal with the server's own words on it, so the page can show them. */
export class PartnerPayoutError extends Error {
  code: string;

  status: number;

  constructor(message: string, code = 'FAILED', status = 0) {
    super(message);
    this.name = 'PartnerPayoutError';
    this.code = code;
    this.status = status;
  }
}

const fail = (res: any, fallback: string): never => {
  const body = res?.data ?? {};
  throw new PartnerPayoutError(
    body.message || res?.message || fallback,
    body.code || res?.code || 'FAILED',
    res?.status ?? 0,
  );
};

/** The queue, plus which rail this deployment is on. */
export type PayoutQueue = {
  rows: PartnerPayout[];
  /**
   * True while owners are paid by a person making a bank transfer.
   *
   * Read from the SERVER rather than kept here, so the console cannot disagree
   * with what the backend will actually accept — pressing Send money against a
   * manual deployment returns a refusal, not a payout.
   */
  manualPayouts: boolean;
};

export const partnerPayoutService = {
  /** The queue, newest first. `status` narrows it; omit for everything. */
  async list(status?: PartnerPayoutStatus | 'All'): Promise<PayoutQueue> {
    const res = await api.get<{ data: PartnerPayout[]; manualPayouts?: boolean }>(
      BASE,
      status && status !== 'All' ? { status } : undefined,
    );
    if (!res.success) fail(res, 'Could not load the payout queue.');
    return {
      rows: res.data?.data ?? [],
      /* Defaults to manual: assuming automatic on an older API would offer a
         button that cannot work. */
      manualPayouts: res.data?.manualPayouts !== false,
    };
  },

  /**
   * Record a bank transfer somebody made by hand.
   *
   * The reference is the only evidence the money moved — it is what the owner
   * quotes to their bank — so it travels to the row and onto their screen.
   * Marking a payout paid also settles every hotel settlement it claimed.
   */
  async markPaid(id: string, reference: string): Promise<PartnerPayout> {
    const res = await api.post<{ data: PartnerPayout }>(`${BASE}/${id}/mark-paid`, { reference });
    if (!res.success || !res.data?.data) fail(res, 'Could not record that payment.');
    return res.data!.data;
  },

  /** Refuse a request and hand the owner's balance back to them. */
  async reject(id: string, reason: string): Promise<PartnerPayout> {
    const res = await api.post<{ data: PartnerPayout }>(`${BASE}/${id}/reject`, { reason });
    if (!res.success || !res.data?.data) fail(res, 'Could not refuse that payout.');
    return res.data!.data;
  },

  /**
   * Send the money over RazorpayX.
   *
   * DORMANT while `manualPayouts` is true, which is every deployment today —
   * the server refuses it with `MANUAL_PAYOUTS` and a sentence. Kept because
   * the automatic rail is the destination, not a mistake.
   *
   * It carries no amount and no destination: the server reads both from the
   * row and from the bank account the owner saved themselves, so nothing typed
   * into a browser can redirect a payout.
   */
  async process(id: string): Promise<PartnerPayout> {
    const res = await api.post<{ data: PartnerPayout }>(`${BASE}/${id}/process`);
    if (!res.success || !res.data?.data) fail(res, 'Could not send this payout.');
    return res.data!.data;
  },
};

export default partnerPayoutService;
