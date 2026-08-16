import type { BookingStatus, StayCategory } from '@/constants/tokens';

/**
 * The booking data shapes.
 *
 * Two rules from Batch 0 are encoded here rather than left to callers:
 * every deadline is an absolute server timestamp, and money that comes back is
 * marked as such on the line itself.
 */

/* ------------------------------------------------------------------ *
 * Clocks
 * ------------------------------------------------------------------ */

export type CountdownContext = 'quote' | 'ownerResponse' | 'payment';

export type CountdownTier = 'comfortable' | 'warning' | 'critical';

/**
 * Where each context changes tier, in seconds remaining.
 *
 * These are per-context on purpose. A quote lapsing costs nothing — it is
 * re-fetched — so it only gets loud in the last thirty seconds. A payment
 * window closing releases the bed, so it starts warning fifteen minutes out.
 *
 * `clocks.criticalThresholdSeconds` in tokens stays the system default and is
 * what `CountdownRing` uses; these override it per context.
 */
export const TIER_THRESHOLDS: Record<CountdownContext, { warning: number; critical: number }> = {
  quote: { warning: 120, critical: 30 },
  ownerResponse: { warning: 600, critical: 60 },
  payment: { warning: 900, critical: 60 },
};

export function tierFor(context: CountdownContext, secondsRemaining: number): CountdownTier {
  const threshold = TIER_THRESHOLDS[context];
  if (secondsRemaining <= threshold.critical) return 'critical';
  if (secondsRemaining <= threshold.warning) return 'warning';
  return 'comfortable';
}

/* ------------------------------------------------------------------ *
 * Cost
 * ------------------------------------------------------------------ */

export type CostLine = {
  id: string;
  label: string;
  /**
   * One sentence, always. A line item a first-time renter cannot explain to a
   * parent is a line item they will not pay.
   */
  explainer: string;
  amount: number;
  /** Who actually receives it. Never left implicit. */
  payee: 'owner' | 'lampose';
  /** Refundable money is badged and dotted-underlined. */
  refundable?: boolean;
  /**
   * An estimate is never typeset like a fixed charge: weight 500, a range and
   * a stated source.
   */
  estimate?: { low: number; high: number; source: string };
  /** Monthly rather than one-off — only ever in the pay-at-move-in block. */
  monthly?: boolean;
  /** A discount, shown as a negative line with its reason. */
  discount?: boolean;
};

export type CostQuote = {
  /** Absolute server timestamp. The quote's validity, not a duration. */
  validUntil: string;
  /** Already formatted: "quoted 4 min ago". */
  quotedLabel: string;
};

export type CostBreakdownData = {
  propertyLine: string;
  payNow: readonly CostLine[];
  payAtMoveIn: readonly CostLine[];
  quote?: CostQuote;
};

/* ------------------------------------------------------------------ *
 * Visits
 * ------------------------------------------------------------------ */

export type VisitSlot = {
  id: string;
  /** "4:30 pm". */
  label: string;
  /** Full slots stay visible with the reason. An empty grid reads as broken. */
  full?: boolean;
  fullReason?: string;
  /** Today's earlier slots dim rather than vanish, so the day keeps its shape. */
  past?: boolean;
};

export type VisitDay = {
  id: string;
  /** "Tue". */
  weekday: string;
  /** "2". */
  date: string;
  /** "Sep". */
  month: string;
  slots: readonly VisitSlot[];
  /** The owner is not showing the room at all that day. */
  unavailable?: boolean;
};

export type VisitState = 'requested' | 'confirmed' | 'completed' | 'missed';

export type Visit = {
  id: string;
  state: VisitState;
  propertyName: string;
  /** "Tomorrow, 4:30 pm". */
  whenLabel: string;
  /** "asked 14 min ago", "in 19 h", "2 Sep, 4:30 pm", "yesterday, 4:30 pm". */
  agoLabel: string;
  ownerName?: string;
  landmark?: string;
  bring?: string;
  /** Restated on the completed card: the rent quoted on the day. */
  quotedRent?: number;
  quotedDeposit?: number;
  /** True when today's price still matches what was quoted at the visit. */
  priceUnchanged?: boolean;
  daysAgo?: number;
};

/* ------------------------------------------------------------------ *
 * Timeline
 * ------------------------------------------------------------------ */

export type TimelineStepId = 'requested' | 'accepted' | 'paid' | 'movedIn';

export type TimelineStep = {
  id: TimelineStepId;
  label: string;
  /** Already formatted by the server: "13 Aug, 9:41 am". */
  timestamp?: string;
};

/* ------------------------------------------------------------------ *
 * Refund
 * ------------------------------------------------------------------ */

export type RefundStageId = 'requested' | 'inspected' | 'processing' | 'sent';

export type RefundLine = {
  label: string;
  /** Every deduction names its evidence — "owner uploaded the bill". */
  evidence?: string;
  amount: number;
  deduction?: boolean;
};

export type RefundState = {
  stage: RefundStageId;
  lines: readonly RefundLine[];
  /**
   * Processing must state a date and name who is holding the money right now.
   * It may never say "soon".
   */
  expectedBy?: string;
  heldBy?: string;
  destination?: string;
  failed?: boolean;
};

/* ------------------------------------------------------------------ *
 * Leaving — notice, and the money that follows it
 * ------------------------------------------------------------------ */

/**
 * One candidate last day.
 *
 * `penalty` is the whole point of the type. A student picking a date is picking
 * a rupee figure, and the figure has to travel with the option rather than
 * appear in a confirmation dialog after the tap.
 */
export type NoticeOption = {
  id: string;
  /** Short, for the chip: "12 Sep". */
  label: string;
  /** Full, for the sentence beneath: "12 September 2026". */
  fullLabel: string;
  daysAway: number;
  /** Zero when full notice is served. Never left undefined — ₹0 is a fact. */
  penalty: number;
  /** Why, with the figure and the person's name. Only set when penalty > 0. */
  penaltyReason?: string;
};

/**
 * A line in the deposit estimate.
 *
 * `estimate: true` is what earns the "≈" on the total. A figure that depends on
 * a meter reading taken on the last day is not a promise, and typesetting it
 * like one is the lie.
 */
export type DepositEstimateLine = {
  label: string;
  /** Who decides it and when. "Read on your last day · last month was ₹740". */
  detail: string;
  /** Signed. Negative for anything coming off the deposit. */
  amount: number;
  estimate?: boolean;
};

export type NoticeTerms = {
  ownerName: string;
  noticeDays: number;
  /** "13 Aug" — the day notice would be served. */
  todayLabel: string;
  /** The earliest last day that costs nothing: "12 September". */
  earliestFreeLabel: string;
  /** One sentence on the lock-in, whether or not it still bites. */
  lockInNote: string;
  options: readonly NoticeOption[];
  depositPaid: number;
  lines: readonly DepositEstimateLine[];
  /** "Within 14 days of 12 Sep". */
  settlementWindowLabel: string;
  /** How late the date can still be changed. */
  changeableUntilLabel: string;
};

/**
 * What cancelling costs, computed before the student is asked to confirm and
 * before they are asked why.
 *
 * Policy before reason: a reason picker shown first reads as a survey standing
 * between someone and their money.
 */
export type CancellationLine = {
  label: string;
  detail: string;
  amount: number;
  /** Money LAMPOSE or the owner keeps. Rendered as a deduction. */
  kept?: boolean;
};

export type CancellationPolicy = {
  paid: number;
  lines: readonly CancellationLine[];
  returning: number;
  destination: string;
  /** "18 August" — a named date, never "soon". */
  arrivesByLabel: string;
  /** "3–5 working days — your bank's timing, not ours." */
  timingNote: string;
  /** The reference a student quotes when chasing us: "CNL-4192". */
  reference: string;
};

/** Offered after the cost, never before it. Always skippable. */
export type CancellationReason = {
  id: string;
  label: string;
};

/* ------------------------------------------------------------------ *
 * After the stay — history, receipts
 * ------------------------------------------------------------------ */

export type PastStay = {
  bookingId: string;
  reference: string;
  propertyName: string;
  category: StayCategory;
  /** "Sep 2026 – Sep 2027". */
  periodLabel: string;
  monthsStayed: number;
  sharingLabel: string;
  /** What they paid. Historical. */
  rentPaid: number;
  /** How the deposit actually ended — the fact a returning student remembers. */
  depositOutcome: string;
  /**
   * Today's numbers, not the ones they paid. A returning student's real
   * question is "can I go back, and what does it cost now" — history that only
   * shows the past cannot answer it.
   */
  currentRent?: number;
  currentAvailability?: string;
  /** Null when the place has closed or delisted. Rebooking is then impossible. */
  stillListed: boolean;
  ownerStillRuns?: boolean;
  ownerName?: string;
};

export type ReceiptKind = 'agreement' | 'payment' | 'refund' | 'settlement';

export type Receipt = {
  id: string;
  kind: ReceiptKind;
  title: string;
  /** "13 Aug 2026 · UPI · TXN 8841027". */
  meta: string;
  amount?: number;
  /**
   * Not generated yet. A pending receipt **states its own deadline** — an
   * undated "being prepared" is indistinguishable from forgotten.
   */
  pendingUntilLabel?: string;
  pageCount?: number;
};

/* ------------------------------------------------------------------ *
 * Agreement
 * ------------------------------------------------------------------ */

export type AgreementClause = {
  /**
   * A sentence about the user, not a field name: "You pay ₹8,500 every month",
   * never "Monthly rent: ₹8,500".
   */
  heading: string;
  /** The market term, shown alongside so the vocabulary is still learned. */
  term?: string;
  /** The consequence, in rupees or days, with a real date. Never "as per terms". */
  body: string;
  refundable?: boolean;
};

/* ------------------------------------------------------------------ *
 * The booking
 * ------------------------------------------------------------------ */

export type Booking = {
  id: string;
  reference: string;
  status: BookingStatus;
  propertyName: string;
  sharingLabel: string;
  moveInLabel: string;
  /** Absolute server timestamp for whichever clock this status runs. */
  deadline?: string;
  /** The move-in code. Six digits, cached when the booking is confirmed. */
  verificationCode?: string;
  codeValidLabel?: string;
  ownerName?: string;
};
