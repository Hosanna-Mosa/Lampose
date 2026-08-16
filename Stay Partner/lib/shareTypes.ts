/**
 * Sharing types — the PG/hostel term for how many guests occupy a room
 * (single, double, triple, four-sharing), each priced and let separately.
 * Distinct from `lib/inventory.ts`'s `ROOM_TYPES`, which names the rooms
 * themselves (Deluxe Double, Family Suite); a sharing type is a configuration
 * within a room, not the room. Not in any design file; built at the user's
 * request. Same in-memory + subscription shape as everything else here.
 */

export type ShareType = {
  id: string;
  label: string;
  pricePerBed: string;
  /** What a customer would see as bookable — flipping this is the whole feature. */
  available: boolean;
};

export const SHARE_TYPES: ShareType[] = [
  { id: 'ST-1', label: 'Single sharing', pricePerBed: '₹9,500/mo', available: true },
  { id: 'ST-2', label: 'Double sharing', pricePerBed: '₹6,500/mo', available: true },
  { id: 'ST-3', label: 'Triple sharing', pricePerBed: '₹5,200/mo', available: true },
  { id: 'ST-4', label: '4 sharing', pricePerBed: '₹4,200/mo', available: false },
];

export function visibleCount(): number {
  return SHARE_TYPES.filter((t) => t.available).length;
}

/**
 * Whether the property is accepting bookings — the Dashboard header toggle's
 * real state now lives here, not as local state on that screen, because
 * turning it on is only valid when there's at least one visible sharing
 * type: nothing else about "accepting bookings" makes sense with nothing
 * bookable.
 */
let accepting = true;

export function isAvailable(): boolean {
  return accepting;
}

/**
 * The only way to flip online. Refuses — returns `false`, changes nothing —
 * if no sharing type is visible; the Dashboard reads that refusal as "send
 * them to Share types instead of flipping the switch."
 */
export function setAvailable(next: boolean): boolean {
  if (next && visibleCount() === 0) return false;
  if (accepting === next) return true;
  accepting = next;
  listeners.forEach((fn) => fn());
  return true;
}

// ── Mutation ──────────────────────────────────────────────────────────────

const listeners = new Set<() => void>();

export function subscribeShareTypes(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function setShareTypeAvailable(id: string, available: boolean) {
  const t = SHARE_TYPES.find((x) => x.id === id);
  if (!t) return;
  t.available = available;
  listeners.forEach((fn) => fn());
}

/**
 * Commits every toggle at once, on Save — one mutation, one notification,
 * rather than firing a subscription per switch as each one is flipped.
 *
 * Saving down to zero visible types also takes the property offline for
 * real — the other half of the same rule `setAvailable` enforces going the
 * other direction.
 */
export function saveShareTypes(availability: Record<string, boolean>) {
  let changed = false;
  for (const t of SHARE_TYPES) {
    if (t.id in availability && t.available !== availability[t.id]) {
      t.available = availability[t.id];
      changed = true;
    }
  }
  if (visibleCount() === 0 && accepting) {
    accepting = false;
    changed = true;
  }
  if (changed) listeners.forEach((fn) => fn());
}
