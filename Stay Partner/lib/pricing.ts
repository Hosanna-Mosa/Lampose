import type { RoomType } from './inventory';

/**
 * Base rates and the rules that override them.
 *
 * Same in-memory-plus-subscription shape as inventory: deleting a pricing rule
 * has to actually remove it, or the confirmation is theatre.
 */

export type PriceRule = {
  id: string;
  roomType: RoomType;
  name: string;
  /** Pre-formatted period, e.g. "Fri – Sun · all year". */
  period: string;
  amount: number;
};

export const BASE_PRICE: Record<RoomType, number> = {
  'Deluxe Double': 3_200,
  'Family Suite': 5_000,
};

export const PRICE_RULES: PriceRule[] = [
  {
    id: 'PR-01',
    roomType: 'Deluxe Double',
    name: 'Weekend rate',
    period: 'Fri – Sun · all year',
    amount: 4_000,
  },
  {
    id: 'PR-02',
    roomType: 'Deluxe Double',
    name: 'Diwali week',
    period: 'Nov 5 – Nov 12',
    amount: 5_500,
  },
  {
    id: 'PR-03',
    roomType: 'Deluxe Double',
    name: 'Off-season discount',
    period: 'Jun 1 – Aug 31',
    amount: 2_800,
  },
  {
    id: 'PR-04',
    roomType: 'Family Suite',
    name: 'Weekend rate',
    period: 'Fri – Sun · all year',
    amount: 6_200,
  },
];

const listeners = new Set<() => void>();

export function subscribePricing(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function emit() {
  listeners.forEach((fn) => fn());
}

export function rulesFor(roomType: RoomType): PriceRule[] {
  return PRICE_RULES.filter((r) => r.roomType === roomType);
}

export function getRule(id: string | undefined): PriceRule | undefined {
  return PRICE_RULES.find((r) => r.id === id);
}

export function deleteRule(id: string) {
  const i = PRICE_RULES.findIndex((r) => r.id === id);
  if (i >= 0) PRICE_RULES.splice(i, 1);
  emit();
}

export function setBasePrice(roomType: RoomType, amount: number) {
  BASE_PRICE[roomType] = amount;
  emit();
}
