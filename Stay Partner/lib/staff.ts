/**
 * Staff — property team members and their invite state. Same in-memory +
 * subscription shape as every other mutable list in the app: a plain array,
 * a listener set, an incrementing id.
 */

export type StaffStatus = 'active' | 'invited';

/** The invite form's role chips — a different vocabulary from the list's own display text. */
export const ROLE_CHIPS = ['Manager', 'Housekeeping', 'Front desk'] as const;
export type RoleChip = (typeof ROLE_CHIPS)[number];

/** "Manager" invites as "Property manager" — the one place the two spellings meet. */
const ROLE_DISPLAY: Record<RoleChip, string> = {
  Manager: 'Property manager',
  Housekeeping: 'Housekeeping',
  'Front desk': 'Front desk',
};

export type StaffPermissions = {
  manageBookings: boolean;
  managePricing: boolean;
  viewEarnings: boolean;
};

export type StaffMember = {
  id: string;
  name: string;
  /** Free display text — "Property manager", not the invite form's "Manager" chip.
   *  The two don't match in the design itself; checkpoint 37 reconciles them. */
  role: string;
  status: StaffStatus;
  /** Only invites collected through the form carry this — the three seeded members predate it. */
  permissions?: StaffPermissions;
};

export const STAFF: StaffMember[] = [
  { id: 'STF-1', name: 'Ramesh Kulkarni', role: 'Property manager', status: 'active' },
  { id: 'STF-2', name: 'Sunita Bhoir', role: 'Housekeeping', status: 'active' },
  { id: 'STF-3', name: 'Deepak Patel', role: 'Front desk', status: 'invited' },
];

/** The property manager reads as "you're looking at the person in charge"; everyone else is neutral. */
export function avatarToneFor(role: string): 'accent' | 'neutral' {
  return role === 'Property manager' ? 'accent' : 'neutral';
}

export function statusLabel(status: StaffStatus): string {
  return status === 'active' ? 'Active' : 'Invited';
}

// ── Mutation ──────────────────────────────────────────────────────────────

const listeners = new Set<() => void>();

export function subscribeStaff(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

let nextId = 100;

/** A sent invite lands in the list as `invited` — nobody starts `active` sight unseen. */
export function addStaffMember(input: {
  name: string;
  role: RoleChip;
  permissions: StaffPermissions;
}): StaffMember {
  const member: StaffMember = {
    id: `STF-${nextId++}`,
    name: input.name,
    role: ROLE_DISPLAY[input.role],
    status: 'invited',
    permissions: input.permissions,
  };
  STAFF.push(member);
  listeners.forEach((fn) => fn());
  return member;
}
