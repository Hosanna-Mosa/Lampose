/* ══════════════════════════════════════════════════════════════════════════
   Monitor — bookings and money across the four categories.

   Reads `/v1/admin/monitor`, the v1 admin surface behind the same admin token
   every other service here uses. Versioned in the path for the reason
   `zoneService` gives: the unversioned aliases exist to keep older callers
   working, not to hand new ones a second spelling to drift onto.

   ## Nothing here computes money

   Every figure — the total, the commission, our share, the owner's share — is
   read from the server as it was stored, in paise, alongside a rupee copy for
   display. This file multiplies nothing and rounds nothing.

   That is not tidiness. The owner's share is what a Razorpay transfer actually
   pays out, and a console that derived its own version of it would eventually
   show a number that disagreed with the money. When the two disagree, the
   screen is wrong and the bank is right — so the screen does not get its own
   opinion.

   The only figure this console ever SENDS is a percentage. There is no request
   in this file that carries an amount, and the withdraw call has no body at
   all.
   ══════════════════════════════════════════════════════════════════════════ */
import { api } from '../apiCaller';

const BASE = '/v1/admin/monitor';

/** Which of the two money models a category follows. `null` means neither. */
export type PaymentPurpose = 'assisted_visit' | 'stay_booking' | null;

export type MonitorTab = {
  code: string;
  slug: string;
  label: string;
  paymentPurpose: PaymentPurpose;
  properties: number;
  /** Hotel only — settlements waiting on a person. Null where there is no queue. */
  needsAction: number | null;
};

export type MonitorSummary = {
  tabs: MonitorTab[];
  settlements: {
    held: number;
    releasable: number;
    withdrawing: number;
    paidOut: number;
    failed: number;
    reversed: number;
    /** Rupees releasable right now. */
    readyToRelease: number;
  };
};

export type SettlementStatus =
  | 'held' | 'releasable' | 'withdrawing' | 'paid_out' | 'failed' | 'reversed';

export type Settlement = {
  id: string;
  bookingId: string;
  grossAmountPaise: number;
  commissionPercent: number;
  commissionPaise: number;
  ownerSharePaise: number;
  /** Rupees, for display. The paise above are the truth. */
  totalAmount: number;
  ourShare: number;
  ownerShare: number;
  status: SettlementStatus;
  /** The server's answer, so the console never re-implements the state machine. */
  canWithdraw: boolean;
  canEditCommission: boolean;
  /** Which rail settled this row. `route` is historical only. */
  provider: 'route' | 'razorpayx';
  /** RazorpayX. The payout that pays the hotel — null until Withdraw. */
  payoutId: string | null;
  /** RazorpayX's own lifecycle, beside our `status`. Null before a payout. */
  payoutStatus: string | null;
  payoutAttempt: number;
  /** The bank's reference, once it has one. What a hotel quotes their bank. */
  utr: string | null;
  razorpayContactId: string | null;
  razorpayFundAccountId: string | null;
  /** Razorpay Route, on rows settled before the migration. Null since. */
  transferId: string | null;
  linkedAccountId: string | null;
  paymentId: string | null;
  failureCode: string | null;
  failureReason: string | null;
  releasedAt: string | null;
  settledAt: string | null;
  becameReleasableAt: string | null;
  reversedAt: string | null;
  createdAt: string;
};

/** One row. The three shapes share a spine and differ in their money fields. */
export type MonitorRow = {
  id: string;
  requestId: string;
  bookingId: string | null;

  propertyId: string;
  propertyName: string;
  place: string;
  ownerName: string;
  ownerPhone?: string;

  guestName: string;
  guestPhone: string;

  requestStatus: string;
  bookingStatus?: string | null;
  ownerAnswered?: boolean;
  ownerAccepted?: boolean;
  declineReason?: string | null;

  requestedAt: string;
  notifiedAt?: string | null;
  seenAt?: string | null;
  decidedAt?: string | null;
  checkInDate?: string | null;
  checkOutDate?: string | null;
  nights?: number | null;
  nightsUnit?: string | null;

  /* PG / Hostel and Co-living: the offline commission. */
  listedRent?: number | null;
  commissionCollected?: boolean;
  commissionAmount?: number | null;
  commissionPercent?: number | null;
  commissionCollectedAt?: string | null;
  commissionNote?: string;

  /* Bachelor: the ₹199 assisted visit. No settlement, no owner share. */
  paymentRequired?: boolean;
  paymentStatus?: string;
  paymentMode?: string;
  amount?: number | null;
  paidAt?: string | null;
  visitStatus?: string;
  visitDate?: string | null;
  visitTime?: string | null;

  /* Hotel: the full split. Null when no ledger row exists — which the page
     renders as its own state rather than as zeroes. */
  paymentId?: string | null;
  orderId?: string | null;
  settlement?: Settlement | null;
};

export type CategoryResult = {
  category: string;
  label: string;
  paymentPurpose: PaymentPurpose;
  count: number;
  data: MonitorRow[];
};

/**
 * `apiCaller` never throws — a failure comes back as `success: false` with the
 * server's own message. That is the right shape for a list that can degrade to
 * an empty state, and the WRONG shape for a payout: a `withdraw` that silently
 * resolved to `undefined` would leave the page showing nothing happened when
 * the truth is that nobody knows.
 *
 * So the writes convert a failure into a thrown `MonitorError` carrying the
 * server's message and code, and the page shows it. The reads keep the
 * codebase's own convention and degrade quietly.
 */
export class MonitorError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'MonitorError';
    this.code = code;
    this.status = status;
  }
}

const EMPTY_SUMMARY: MonitorSummary = {
  tabs: [],
  settlements: {
    held: 0, releasable: 0, withdrawing: 0, paidOut: 0, failed: 0, reversed: 0, readyToRelease: 0,
  },
};

export const monitorService = {
  /** The tab bar and the payout queue's shape. Degrades to empty. */
  async summary(): Promise<MonitorSummary> {
    const res = await api.get<{ data: MonitorSummary }>(BASE);
    return res.success && res.data?.data ? res.data.data : EMPTY_SUMMARY;
  },

  async category(slug: string): Promise<CategoryResult> {
    const res = await api.get<CategoryResult>(`${BASE}/${slug}`);
    if (!res.success || !res.data) {
      return { category: slug, label: slug, paymentPurpose: null, count: 0, data: [] };
    }
    return { ...res.data, data: res.data.data ?? [] };
  },

  /**
   * Set what Lampose keeps on one hotel booking.
   *
   * A percentage, and nothing else. The server re-splits from the amount
   * Razorpay actually captured and returns the new figures — which is why this
   * returns the settlement rather than the caller patching its own copy.
   */
  async setCommission(settlementId: string, percent: number): Promise<Settlement> {
    const res = await api.patch<{ data: Settlement }>(
      `${BASE}/settlements/${settlementId}/commission`, { percent },
    );
    if (!res.success || !res.data?.data) {
      throw new MonitorError(res.message || 'Could not change the commission.', res.code || 'FAILED', res.status);
    }
    return res.data.data;
  },

  /**
   * Release the hotel's share.
   *
   * NO BODY. There is deliberately no amount, no owner share and no percentage
   * on this request — the server pays what it stored. If this call ever grows
   * a parameter that is money, something has gone wrong upstream of it.
   *
   * Throws on failure rather than returning a falsy value, because the
   * server's refusal is the whole message: "the hotel owner has not completed
   * payout onboarding" is what the person pressing this needs to read, and a
   * silent `undefined` would render as nothing having happened.
   */
  async withdraw(settlementId: string): Promise<Settlement> {
    const res = await api.post<{ data: Settlement }>(
      `${BASE}/settlements/${settlementId}/withdraw`,
    );
    if (!res.success || !res.data?.data) {
      throw new MonitorError(res.message || 'Could not release this payout.', res.code || 'FAILED', res.status);
    }
    return res.data.data;
  },

  /** Record that our cut was collected from a PG/Hostel or Co-live owner. */
  async markCommissionCollected(
    bookingId: string,
    input: { amount: number; percent?: number; note?: string },
  ): Promise<void> {
    const res = await api.patch(`${BASE}/bookings/${bookingId}/commission-collected`, input);
    if (!res.success) {
      throw new MonitorError(res.message || 'Could not record that.', res.code || 'FAILED', res.status);
    }
  },
};

export default monitorService;
