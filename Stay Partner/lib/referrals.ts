/**
 * Refer & earn — not in any design file; built at the user's request. Same
 * in-memory + subscription shape as everything else stateful in this app.
 *
 * There's no backend yet, so nothing here can confirm a referred owner
 * actually signed up on a second device — that's the one piece this build
 * can't make real. What is real: generating and sharing the referral code
 * (the device's own Share sheet), and the points/withdraw math running on
 * top of realistic seed data instead of invented figures.
 */

export type ReferralStatus = 'invited' | 'joined';

export type Referral = {
  id: string;
  ownerName: string;
  propertyName: string;
  phone: string;
  status: ReferralStatus;
  invitedAt: Date;
  joinedAt?: Date;
};

export const POINTS_PER_REFERRAL = 100;
/** 1 point = ₹1. */
export const POINT_VALUE_RUPEES = 1;
/** 5 successful referrals × 100 points — the number the user asked for directly. */
export const MIN_WITHDRAW_POINTS = 500;

/** Tied to the account the way #LB-4821-style IDs already are elsewhere in the seed data. */
export const REFERRAL_CODE = 'ANJALI4821';
export const REFERRAL_LINK = `https://lampose.in/refer/${REFERRAL_CODE}`;

export function shareMessage(): string {
  return `Join me on LAMPOSE Stay Partner — manage bookings, pricing, and payouts for your property in one app. Use my code ${REFERRAL_CODE} when you sign up: ${REFERRAL_LINK}`;
}

function at(dayOffset: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - dayOffset);
  return d;
}

export const REFERRALS: Referral[] = [
  {
    id: 'REF-1',
    ownerName: 'Vikram Oberoi',
    propertyName: 'Blue Ridge Homestay',
    phone: '98212 34567',
    status: 'joined',
    invitedAt: at(14),
    joinedAt: at(12),
  },
  {
    id: 'REF-2',
    ownerName: 'Kavita Iyer',
    propertyName: 'Palm Grove PG',
    phone: '99001 22334',
    status: 'joined',
    invitedAt: at(10),
    joinedAt: at(8),
  },
  {
    id: 'REF-3',
    ownerName: 'Rajesh Menon',
    propertyName: "Menon's Nest",
    phone: '97654 89012',
    status: 'joined',
    invitedAt: at(6),
    joinedAt: at(5),
  },
  {
    id: 'REF-4',
    ownerName: 'Fatima Sheikh',
    propertyName: 'Sheikh Residency',
    phone: '96380 45671',
    status: 'joined',
    invitedAt: at(3),
    joinedAt: at(2),
  },
  {
    id: 'REF-5',
    ownerName: 'Divya Krishnan',
    propertyName: 'Krishnan Homestay',
    phone: '95512 67890',
    status: 'joined',
    invitedAt: at(2),
    joinedAt: at(1),
  },
  {
    id: 'REF-6',
    ownerName: 'Arvind Nair',
    propertyName: 'Coastal Rooms',
    phone: '94823 11098',
    status: 'invited',
    invitedAt: at(1),
  },
];

export type WithdrawalStatus = 'processing' | 'completed';

export type Withdrawal = {
  id: string;
  points: number;
  amount: number;
  methodId: string;
  initiatedAt: Date;
  status: WithdrawalStatus;
};

export const WITHDRAWALS: Withdrawal[] = [];

/** Every joined referral is worth one flat bonus — uncapped, however many you make. */
export function earnedPoints(): number {
  return REFERRALS.filter((r) => r.status === 'joined').length * POINTS_PER_REFERRAL;
}

function withdrawnPoints(): number {
  return WITHDRAWALS.reduce((sum, w) => sum + w.points, 0);
}

/** What's actually left to withdraw — earned minus whatever's already been cashed out. */
export function availablePoints(): number {
  return earnedPoints() - withdrawnPoints();
}

export function canWithdraw(): boolean {
  return availablePoints() >= MIN_WITHDRAW_POINTS;
}

// ── Mutation ──────────────────────────────────────────────────────────────

const listeners = new Set<() => void>();

export function subscribeReferrals(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

let nextWithdrawalId = 100;

/**
 * Cashes out the full available balance to a payout method — referral money
 * lands in the same bank account as booking payouts, rather than inventing a
 * second wallet destination. Marked `processing`, same as a real bank
 * transfer would be, so it doesn't overclaim instant settlement.
 */
export function withdraw(methodId: string): Withdrawal | null {
  const points = availablePoints();
  if (points < MIN_WITHDRAW_POINTS) return null;

  const w: Withdrawal = {
    id: `RWD-${nextWithdrawalId++}`,
    points,
    amount: points * POINT_VALUE_RUPEES,
    methodId,
    initiatedAt: new Date(),
    status: 'processing',
  };
  WITHDRAWALS.push(w);
  listeners.forEach((fn) => fn());
  return w;
}
