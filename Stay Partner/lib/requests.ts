import type { BookingStatus } from '@/components/ui';
import { urgencyOf } from '@/components/ui';
import { feeOn, netOn } from './fees';

/**
 * Static request content, shared by the inbox and the detail screen.
 *
 * Seeded once at module load so both screens agree on the same expiry clock —
 * a request that reads "42m left" in the list reads the same in the detail.
 *
 * Accept and reject are real mutations now, not theatre — both used to just
 * navigate back without changing anything. `lib/requests.ts` is the one
 * source both the inbox and the detail screen read, replacing a duplicate
 * seed list the inbox used to keep on its own.
 */

const MINUTE = 60_000;
const ORIGIN = Date.now();

export type PriceLine = { label: string; amount: number };

export type KYC = {
  address: string;
  aadharNumber: string;
  aadharUploaded: boolean;
  /** A code texted to the guest's phone and read back to the owner — confirms
   *  the guest behind these details actually matches the phone on the
   *  booking, not a postal PIN code. */
  verified: boolean;
};

export type RequestDetail = {
  id: string;
  guest: string;
  /** null for a first-time guest, per the design's "No reviews yet". */
  guestSummary: string;
  roomType: string;
  checkIn: Date;
  checkOut: Date;
  guests: string;
  lines: PriceLine[];
  status: BookingStatus;
  expiresAt: number;
  requestedAt: Date;
  /** Raw 10 digits. */
  phone: string;
  /** Already has a LAMPOSE account — their KYC is on file, not collected here. */
  fromApp: boolean;
  /** Set once, either seeded (fromApp guests) or filled and saved via the approved detail screen. */
  kyc: KYC | null;
};

/** Guest total before the platform takes its cut. */
export function grossOf(r: RequestDetail): number {
  return r.lines.reduce((sum, l) => sum + l.amount, 0);
}

export function feeOf(r: RequestDetail): number {
  return feeOn(grossOf(r));
}

/** What actually reaches the owner's bank. */
export function netOf(r: RequestDetail): number {
  return netOn(grossOf(r));
}

/** "XXXXXX2806" — same instinct as masking a bank account, applied to a phone number. */
export function maskPhone(phone: string): string {
  return `XXXXXX${phone.slice(-4)}`;
}

/** "XXXX XXXX 4821" — UIDAI's own convention shows only the last 4 digits. */
export function maskAadhar(aadhar: string): string {
  const last4 = aadhar.slice(-4);
  return `XXXX XXXX ${last4}`;
}

export const AADHAR_LENGTH = 12;

/** "1234 5678 9012" — grouped in 4s, the way an Aadhar card itself prints it. */
export function formatAadhar(digits: string): string {
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
}

export const REQUESTS: RequestDetail[] = [
  {
    id: 'LB-4102',
    guest: 'Priya Nair',
    guestSummary: 'First-time guest · No reviews yet',
    roomType: 'Family Suite',
    checkIn: new Date(2026, 7, 20),
    checkOut: new Date(2026, 7, 22),
    guests: '4 adults',
    lines: [
      { label: '₹5,000 × 2 nights', amount: 10_000 },
      { label: 'Cleaning fee', amount: 500 },
      { label: 'Taxes', amount: 500 },
    ],
    status: 'pending',
    expiresAt: ORIGIN + 42 * MINUTE,
    requestedAt: new Date(2026, 7, 14, 9, 15),
    phone: '9820112806',
    fromApp: true,
    kyc: {
      address: '14B, Lotus Apartments, Andheri West, Mumbai, Maharashtra',
      aadharNumber: '482159370026',
      aadharUploaded: true,
      verified: true,
    },
  },
  {
    id: 'LB-4108',
    guest: 'Rahul Mehta',
    guestSummary: '4 previous stays · 4.8 rating',
    roomType: 'Deluxe Double',
    checkIn: new Date(2026, 7, 25),
    checkOut: new Date(2026, 7, 27),
    guests: '2 adults',
    lines: [
      { label: '₹3,500 × 2 nights', amount: 7_000 },
      { label: 'Cleaning fee', amount: 500 },
      { label: 'Taxes', amount: 500 },
    ],
    status: 'pending',
    expiresAt: ORIGIN + 190 * MINUTE,
    requestedAt: new Date(2026, 7, 14, 7, 5),
    phone: '9765448901',
    fromApp: false,
    kyc: null,
  },
  {
    id: 'LB-4117',
    guest: 'Sana Iyer',
    guestSummary: '2 previous stays · 5.0 rating',
    roomType: 'Deluxe Double',
    checkIn: new Date(2026, 8, 1),
    checkOut: new Date(2026, 8, 4),
    guests: '2 adults, 1 child',
    lines: [
      { label: '₹3,800 × 3 nights', amount: 11_400 },
      { label: 'Cleaning fee', amount: 600 },
      { label: 'Taxes', amount: 600 },
    ],
    status: 'pending',
    expiresAt: ORIGIN + 1830 * MINUTE,
    requestedAt: new Date(2026, 7, 13, 20, 40),
    phone: '9638045671',
    fromApp: true,
    kyc: {
      address: '22, Green Park Road, Koramangala, Bengaluru, Karnataka',
      aadharNumber: '739021485560',
      aadharUploaded: true,
      verified: true,
    },
  },
  {
    id: 'LB-4090',
    guest: 'Vikram Shah',
    guestSummary: 'First-time guest · No reviews yet',
    roomType: 'Deluxe Double',
    checkIn: new Date(2026, 7, 18),
    checkOut: new Date(2026, 7, 19),
    guests: '2 adults',
    lines: [
      { label: '₹3,600 × 1 night', amount: 3_600 },
      { label: 'Cleaning fee', amount: 200 },
      { label: 'Taxes', amount: 200 },
    ],
    status: 'declined',
    expiresAt: ORIGIN - 120 * MINUTE,
    requestedAt: new Date(2026, 7, 17, 18, 40),
    phone: '9482311098',
    fromApp: false,
    kyc: null,
  },
  {
    id: 'LB-4055',
    guest: 'Ananya Reddy',
    guestSummary: '6 previous stays · 4.9 rating',
    roomType: 'Family Suite',
    checkIn: new Date(2026, 7, 29),
    checkOut: new Date(2026, 8, 2),
    guests: '3 adults',
    lines: [
      { label: '₹5,000 × 4 nights', amount: 20_000 },
      { label: 'Cleaning fee', amount: 500 },
      { label: 'Taxes', amount: 500 },
    ],
    // Already approved before this screen existed — the Approved tab isn't
    // empty on first load, and doesn't depend on accepting something live.
    status: 'confirmed',
    expiresAt: ORIGIN - 60 * MINUTE,
    requestedAt: new Date(2026, 7, 12, 11, 20),
    phone: '9012345678',
    fromApp: true,
    kyc: {
      address: '7, Palm Meadows, Whitefield, Bengaluru, Karnataka',
      aadharNumber: '618204773391',
      aadharUploaded: true,
      verified: true,
    },
  },
];

export function getRequest(id: string | undefined): RequestDetail | undefined {
  return REQUESTS.find((r) => r.id === id);
}

/** A pending request whose clock ran out reads the same as a decline everywhere in this app. */
export function isAutoDeclined(r: RequestDetail): boolean {
  return r.status === 'pending' && urgencyOf(r.expiresAt - Date.now()) === 'expired';
}

export type RequestCategory = 'pending' | 'approved' | 'rejected';

export function categoryOf(r: RequestDetail): RequestCategory {
  if (r.status === 'confirmed') return 'approved';
  if (r.status === 'declined' || isAutoDeclined(r)) return 'rejected';
  return 'pending';
}

export function pendingCount(): number {
  return REQUESTS.filter((r) => categoryOf(r) === 'pending').length;
}

/** Hours left on the most urgent pending request — the Dashboard banner's own figure. */
export function soonestPendingHours(): number | null {
  const pending = REQUESTS.filter((r) => categoryOf(r) === 'pending');
  if (pending.length === 0) return null;
  const soonest = Math.min(...pending.map((r) => r.expiresAt));
  return Math.max(1, Math.round((soonest - Date.now()) / (60 * 60_000)));
}

// ── Mutation ──────────────────────────────────────────────────────────────

const listeners = new Set<() => void>();

export function subscribeRequests(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function acceptRequest(id: string) {
  const r = getRequest(id);
  if (!r || r.status !== 'pending') return;
  r.status = 'confirmed';
  listeners.forEach((fn) => fn());
}

export function declineRequest(id: string) {
  const r = getRequest(id);
  if (!r) return;
  r.status = 'declined';
  listeners.forEach((fn) => fn());
}

export function saveKyc(id: string, kyc: KYC) {
  const r = getRequest(id);
  if (!r) return;
  r.kyc = kyc;
  listeners.forEach((fn) => fn());
}

/** Everything needed to log a customer the owner already knows — a walk-in, a
 *  phone booking, anyone who never came through a request — straight into
 *  records. Not a proposal awaiting a decision, so there's no lines/expiry to
 *  fill in from outside; both are stood up here with sane, inert defaults. */
export type NewCustomer = {
  guest: string;
  phone: string;
  roomType: string;
  checkIn: Date;
  checkOut: Date;
  guests: string;
  kyc: KYC;
};

let nextCustomerSeq = 1;

// Lets the Requests inbox jump to the Approved tab after a manual add, even
// if the owner opened "Add customer" from Pending or Rejected — same
// subscription every mutation already fires, just carrying one extra bit.
let lastAddedId: string | null = null;

/** Read-and-clear: only true immediately after `addCustomer`, for exactly one check. */
export function consumeLastAddedId(): string | null {
  const id = lastAddedId;
  lastAddedId = null;
  return id;
}

/** Adds a manually-entered guest straight to Approved — this is a record of
 *  someone already stayed with or known to the owner, not a request that
 *  needs deciding on. Always `fromApp: false`: if they had a LAMPOSE account
 *  their KYC would already be on file, not something the owner is typing in. */
export function addCustomer(c: NewCustomer): RequestDetail {
  const record: RequestDetail = {
    id: `CUST-${String(nextCustomerSeq++).padStart(3, '0')}`,
    guest: c.guest,
    guestSummary: 'Existing customer · Added by you',
    roomType: c.roomType,
    checkIn: c.checkIn,
    checkOut: c.checkOut,
    guests: c.guests,
    lines: [],
    status: 'confirmed',
    expiresAt: ORIGIN,
    requestedAt: new Date(),
    phone: c.phone,
    fromApp: false,
    kyc: c.kyc,
  };
  REQUESTS.push(record);
  lastAddedId = record.id;
  listeners.forEach((fn) => fn());
  return record;
}
