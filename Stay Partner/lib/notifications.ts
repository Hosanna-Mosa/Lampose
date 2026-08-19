/**
 * One inbox, every event type. Timestamps are real offsets from load time
 * (minutes and hours, not day-level anchors like bookings use), because the
 * relative labels — "2m ago", "1h ago" — need to actually count.
 */

export type NotificationType = 'request' | 'payout' | 'checkin' | 'review' | 'payment' | 'support';

export type AppNotification = {
  id: string;
  /**
   * The stay request this is about, where there is one.
   *
   * Without it a notification is a dead end — an owner reads "you have 3
   * minutes to answer", taps, and lands nowhere. On this deadline that is the
   * notification failing at its only job.
   */
  requestId?: string | null;
  type: NotificationType;
  title: string;
  body: string;
  occurredAt: Date;
  read: boolean;
};

const NOW = Date.now();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export const NOTIFICATIONS: AppNotification[] = [
  {
    id: 'N1',
    type: 'request',
    title: 'New booking request',
    body: 'Priya Nair requested Family Suite, Aug 20–22',
    occurredAt: new Date(NOW - 2 * MIN),
    read: false,
  },
  {
    id: 'N2',
    type: 'payout',
    title: 'Payout completed',
    body: '₹41,200 sent to Bank •••• 4821',
    occurredAt: new Date(NOW - 1 * HOUR),
    read: false,
  },
  {
    id: 'N3',
    type: 'checkin',
    title: 'Guest checked in',
    body: 'Arjun Kapoor checked into Deluxe Double',
    occurredAt: new Date(NOW - 3 * HOUR),
    read: true,
  },
  {
    id: 'N4',
    type: 'review',
    title: 'New review · 4 stars',
    body: 'Meera Joseph left a review for Family Suite',
    occurredAt: new Date(NOW - 1 * DAY - 4 * HOUR),
    read: true,
  },
  {
    id: 'N5',
    type: 'payment',
    title: 'Payment received',
    body: '₹9,600 for booking #LB-1182',
    occurredAt: new Date(NOW - 1 * DAY - 6 * HOUR),
    read: true,
  },
  {
    id: 'N6',
    type: 'support',
    title: 'Support replied',
    body: 'Your ticket #4021 has an update',
    occurredAt: new Date(NOW - 2 * DAY),
    read: true,
  },
];

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "2m ago" · "1h ago" · "Yesterday" · "3d ago" — never a bare timestamp. */
export function relativeTime(d: Date, now = new Date()): string {
  const diff = now.getTime() - d.getTime();
  if (diff < MIN) return 'Just now';
  if (diff < HOUR) return `${Math.floor(diff / MIN)}m ago`;
  if (isSameDay(d, now)) return `${Math.floor(diff / HOUR)}h ago`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(d, yesterday)) return 'Yesterday';

  return `${Math.floor(diff / DAY)}d ago`;
}

export type NotificationGroup = { label: 'Today' | 'Earlier'; items: AppNotification[] };

/** Two groups, chronological within each — matches the design exactly. */
export function groupedNotifications(list: AppNotification[], now = new Date()): NotificationGroup[] {
  const sorted = [...list].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
  const today = sorted.filter((n) => isSameDay(n.occurredAt, now));
  const earlier = sorted.filter((n) => !isSameDay(n.occurredAt, now));
  return [
    ...(today.length ? [{ label: 'Today' as const, items: today }] : []),
    ...(earlier.length ? [{ label: 'Earlier' as const, items: earlier }] : []),
  ];
}

export function unreadCount(list: AppNotification[] = NOTIFICATIONS): number {
  return list.filter((n) => !n.read).length;
}

// ── Mutation ──────────────────────────────────────────────────────────────

const listeners = new Set<() => void>();

export function subscribeNotifications(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function emit() {
  listeners.forEach((fn) => fn());
}

export function markRead(id: string) {
  const n = NOTIFICATIONS.find((x) => x.id === id);
  if (n && !n.read) {
    n.read = true;
    emit();
  }
}

export function markAllRead() {
  let changed = false;
  NOTIFICATIONS.forEach((n) => {
    if (!n.read) {
      n.read = true;
      changed = true;
    }
  });
  if (changed) emit();
}
