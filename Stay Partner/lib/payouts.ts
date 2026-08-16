import { getBooking, payoutOf, type Booking } from './bookings';

/**
 * Transfers to the owner's bank.
 *
 * A payout that batches recent stays derives its amount from those bookings, so
 * the detail screen's line items always sum to the headline. Older transfers
 * predate the booking records kept on device and carry a stated amount — real
 * apps don't hold every booking forever.
 */

export type PayoutStatus = 'processing' | 'completed' | 'failed';

export type Payout = {
  id: string;
  reference: string;
  method: string;
  status: PayoutStatus;
  initiatedAt: Date;
  /** Only meaningful while processing. */
  estArrival?: Date;
  /** Bookings rolled into this transfer, if still on record. */
  bookingIds: string[];
  /** Used only when `bookingIds` is empty. */
  statedAmount?: number;
  /** Set when a transfer bounces. */
  failureReason?: string;
};

function at(dayOffset: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ── Methods ───────────────────────────────────────────────────────────────

export type PayoutMethod = {
  id: string;
  bankName: string;
  holderName: string;
  /** Stored masked; the full number is only ever typed, never kept. */
  last4: string;
  ifsc: string;
  isDefault: boolean;
};

export const METHODS: PayoutMethod[] = [
  {
    id: 'PM-1',
    bankName: 'HDFC Bank',
    holderName: 'Anjali Rao',
    last4: '4821',
    ifsc: 'HDFC0001234',
    isDefault: true,
  },
  {
    id: 'PM-2',
    bankName: 'ICICI Bank',
    holderName: 'Anjali Rao',
    last4: '0093',
    ifsc: 'ICIC0000456',
    isDefault: false,
  },
];

export function defaultMethod(): PayoutMethod | undefined {
  return METHODS.find((m) => m.isDefault) ?? METHODS[0];
}

/** "•••• •••• •••• 4821" — the full number is never displayed after entry. */
export function maskedNumber(m: PayoutMethod): string {
  return `•••• •••• •••• ${m.last4}`;
}

/** Short form for payout rows: "Bank •••• 4821". */
export function shortLabel(m: PayoutMethod | undefined): string {
  return m ? `Bank •••• ${m.last4}` : 'No payout method';
}

const methodListeners = new Set<() => void>();

export function subscribeMethods(fn: () => void): () => void {
  methodListeners.add(fn);
  return () => {
    methodListeners.delete(fn);
  };
}

function emitMethods() {
  methodListeners.forEach((fn) => fn());
}

export function setDefaultMethod(id: string) {
  METHODS.forEach((m) => {
    m.isDefault = m.id === id;
  });
  emitMethods();
}

export function removeMethod(id: string) {
  const i = METHODS.findIndex((m) => m.id === id);
  if (i < 0) return;
  const wasDefault = METHODS[i].isDefault;
  METHODS.splice(i, 1);
  // Something has to be the default, or payouts have nowhere to land.
  if (wasDefault && METHODS.length > 0) METHODS[0].isDefault = true;
  emitMethods();
}

export function getMethod(id: string | undefined): PayoutMethod | undefined {
  return METHODS.find((m) => m.id === id);
}

/**
 * IFSC → bank name. Real banking APIs resolve this from the first four
 * characters; this is a small stand-in covering the banks already seeded above
 * plus a few common ones, so the design's "derived, locked" field is genuine.
 */
const IFSC_BANKS: Record<string, string> = {
  HDFC: 'HDFC Bank',
  ICIC: 'ICICI Bank',
  SBIN: 'State Bank of India',
  UTIB: 'Axis Bank',
  KKBK: 'Kotak Mahindra Bank',
  PUNB: 'Punjab National Bank',
  YESB: 'Yes Bank',
  IDFB: 'IDFC First Bank',
};

const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;

export function bankNameForIFSC(ifsc: string): string | null {
  const code = ifsc.trim().toUpperCase();
  if (!IFSC_PATTERN.test(code)) return null;
  return IFSC_BANKS[code.slice(0, 4)] ?? null;
}

let nextMethodId = 100;

export function addMethod(input: {
  holderName: string;
  accountNumber: string;
  ifsc: string;
}): PayoutMethod {
  const bankName = bankNameForIFSC(input.ifsc) ?? 'Bank';
  const method: PayoutMethod = {
    id: `PM-${nextMethodId++}`,
    bankName,
    holderName: input.holderName,
    last4: input.accountNumber.slice(-4),
    ifsc: input.ifsc.toUpperCase(),
    // The first saved method has nothing to defer to; later ones don't disturb
    // whatever the owner already chose.
    isDefault: METHODS.length === 0,
  };
  METHODS.push(method);
  emitMethods();
  return method;
}



export const PAYOUTS: Payout[] = [
  {
    id: 'PO-1',
    reference: 'PYT-2608-4821X',
    method: 'Bank •••• 4821',
    status: 'processing',
    initiatedAt: at(-2),
    estArrival: at(0),
    bookingIds: ['LB-1176', 'LB-1103'],
  },
  {
    id: 'PO-2',
    reference: 'PYT-2531-4821K',
    method: 'Bank •••• 4821',
    status: 'completed',
    initiatedAt: at(-9),
    bookingIds: ['LB-1054'],
  },
  {
    id: 'PO-3',
    reference: 'PYT-2489-4821B',
    method: 'Bank •••• 4821',
    status: 'completed',
    initiatedAt: at(-16),
    bookingIds: [],
    statedAmount: 33_900,
  },
  {
    id: 'PO-4',
    reference: 'PYT-2442-4821R',
    method: 'Bank •••• 4821',
    status: 'failed',
    initiatedAt: at(-23),
    bookingIds: [],
    statedAmount: 19_000,
    failureReason: 'Bank rejected the transfer — account details could not be verified.',
  },
];

/** Derived where the bookings are still on record, stated where they aren't. */
export function payoutAmount(p: Payout): number {
  if (p.bookingIds.length === 0) return p.statedAmount ?? 0;
  return p.bookingIds.reduce((sum, id) => {
    const b = getBooking(id);
    return sum + (b ? payoutOf(b) : 0);
  }, 0);
}

export function payoutBookings(p: Payout): Booking[] {
  return p.bookingIds
    .map(getBooking)
    .filter((b): b is Booking => b !== undefined);
}

export function getPayout(id: string | undefined): Payout | undefined {
  return PAYOUTS.find((p) => p.id === id);
}

/** Money that has actually landed — processing and failed transfers don't count yet. */
export function totalPayouts(): number {
  return PAYOUTS.filter((p) => p.status === 'completed').reduce((sum, p) => sum + payoutAmount(p), 0);
}
