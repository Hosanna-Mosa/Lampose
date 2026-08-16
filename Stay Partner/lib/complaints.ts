/**
 * Guest complaints about the property — distinct from `lib/support.ts`,
 * which is the owner's own line to LAMPOSE (payment issues, disputes). This
 * is the other direction: something a guest raised that the owner has to
 * resolve. Not in any design file; built at the user's request. Same
 * in-memory + subscription shape as everything else stateful here.
 */

export type ComplaintStatus = 'open' | 'resolved';

export type Complaint = {
  id: string;
  guestName: string;
  bookingId?: string;
  subject: string;
  description: string;
  raisedAt: Date;
  status: ComplaintStatus;
  resolvedAt?: Date;
};

function at(dayOffset: number, hourOffset = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() - dayOffset);
  d.setHours(d.getHours() - hourOffset);
  return d;
}

export const COMPLAINTS: Complaint[] = [
  {
    id: 'CMP-1',
    guestName: 'Priya Nair',
    bookingId: 'LB-1176',
    subject: 'AC not cooling properly',
    description: 'The air conditioning in the room runs but the room never actually cools down, even overnight.',
    raisedAt: at(0, 4),
    status: 'open',
  },
  {
    id: 'CMP-2',
    guestName: 'Rahul Mehta',
    bookingId: 'LB-1103',
    subject: 'Wi-Fi very slow',
    description: "Wi-Fi barely loads a page. Wasn't able to get any work done during the stay.",
    raisedAt: at(1),
    status: 'open',
  },
  {
    id: 'CMP-3',
    guestName: 'Sana Iyer',
    bookingId: 'LB-1054',
    subject: 'Room wasn’t cleaned before check-in',
    description: 'Bathroom hadn’t been cleaned since the last guest — had to wait 40 minutes for housekeeping.',
    raisedAt: at(9, 2),
    status: 'resolved',
    resolvedAt: at(8),
  },
];

export function openCount(): number {
  return COMPLAINTS.filter((c) => c.status === 'open').length;
}

export function statusLabel(status: ComplaintStatus): string {
  return status === 'open' ? 'Open' : 'Resolved';
}

// ── Mutation ──────────────────────────────────────────────────────────────

const listeners = new Set<() => void>();

export function subscribeComplaints(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function resolveComplaint(id: string) {
  const c = COMPLAINTS.find((x) => x.id === id);
  if (!c || c.status === 'resolved') return;
  c.status = 'resolved';
  c.resolvedAt = new Date();
  listeners.forEach((fn) => fn());
}
