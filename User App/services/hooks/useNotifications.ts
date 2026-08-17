import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError } from '@/services/api/client';
import {
  fetchNotifications,
  markNotificationsRead,
} from '@/services/api/notifications.api';
import type { BackendNotification } from '@/services/api/types';
import { queryKeys } from './keys';

/**
 * The alerts inbox, and the unread badge that reads from the same cache.
 *
 * Two screens want this — the bell on the feed header wants a number, the
 * alerts screen wants the list — and they are one query, so the badge and the
 * screen can never disagree about how many are unread.
 */

export type NotificationDay = {
  /** "TODAY", "YESTERDAY", "12 AUGUST". */
  label: string;
  items: BackendNotification[];
};

/**
 * Groups by calendar day, in the reader's timezone.
 *
 * Done here rather than server-side on purpose. "Today" is a fact about where
 * the reader is standing, and a server in UTC grouping for a student in IST
 * would file an 11pm alert under tomorrow.
 */
function groupByDay(notifications: readonly BackendNotification[]): NotificationDay[] {
  const days: NotificationDay[] = [];
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

  const today = startOf(new Date());
  const yesterday = today - 24 * 60 * 60 * 1000;

  for (const item of notifications) {
    const when = new Date(item.at);
    if (Number.isNaN(when.getTime())) continue;

    const day = startOf(when);
    const label =
      day === today
        ? 'Today'
        : day === yesterday
          ? 'Yesterday'
          : when.toLocaleDateString('en-IN', { day: 'numeric', month: 'long' });

    const existing = days.find((entry) => entry.label === label);
    if (existing) existing.items.push(item);
    else days.push({ label, items: [item] });
  }

  return days;
}

export function useNotifications(enabled = true) {
  const client = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.notifications,
    queryFn: ({ signal }) => fetchNotifications(signal),
    enabled,
    /* Short, and refreshed on focus: the whole point of this screen is an
       owner's answer arriving while the student was elsewhere. */
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: (count, error) => !(error instanceof ApiError && error.status > 0) && count < 1,
  });

  const markRead = useMutation({
    mutationFn: () => markNotificationsRead(),
    /* Refetched rather than patched locally: the watermark is a server
       decision, and the response is what says which alerts fell under it. */
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.notifications }),
  });

  const notifications = query.data?.notifications ?? [];

  return {
    ...query,
    notifications,
    days: groupByDay(notifications),
    unread: query.data?.unread ?? 0,
    markAllRead: markRead.mutate,
    isMarkingRead: markRead.isPending,
    error: query.error as ApiError | null,
  };
}
