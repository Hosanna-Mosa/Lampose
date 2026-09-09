import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect } from 'react';
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
 *
 * ## Two read marks, and only one of them can be a server watermark
 *
 * `POST /customers/notifications/read` moves a single timestamp on the
 * account: everything older becomes read. That is the right shape for "mark
 * all read" and the wrong shape — the only shape available, in fact — for
 * "I just opened this one". `notification.controller.js` derives every alert
 * from a visit request rather than storing rows, so there is no per-alert
 * record on the server to mark, and inventing one is a schema change.
 *
 * So opening a single alert is recorded HERE, on the device, as a set of
 * alert ids. It is honest about what it is: a per-device record of what this
 * person has looked at. It survives relaunches, it does not follow them to a
 * second phone, and the server watermark still does everything it did.
 *
 * The two are merged in one place — `mergeRead` below — so every consumer
 * sees one answer. The bell badge and the row's dot are computed from the
 * same merged list, which is what stops the count saying 3 while the screen
 * shows one bold row.
 *
 * The stored set is PRUNED to the ids the server still returns on every
 * merge. Alerts age out of the hundred-row window, and a set that only ever
 * grew would carry ids for requests from two years ago forever.
 */

const READ_IDS_KEY = '@lampose/notifications-read';

/** The ids this device has opened. Kept in the cache so screens share one. */
function useLocallyRead() {
  return useQuery({
    queryKey: queryKeys.notificationsRead,
    queryFn: async (): Promise<readonly string[]> => {
      try {
        const raw = await AsyncStorage.getItem(READ_IDS_KEY);
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
      } catch {
        /* A corrupt or unreadable store means nothing has been opened, which
           leaves rows bold. Bold is the safe direction to fail in. */
        return [];
      }
    },
    /* Device state, not server state. It only changes when this app writes
       it, and the write invalidates the key. */
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

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
  const localRead = useLocallyRead();

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

  const raw = query.data?.notifications ?? [];
  const readIds = localRead.data;

  /*
   * The server's watermark and this device's own opened-ids, in one answer.
   *
   * Only ever turns an unread row read, never the other way about. The
   * watermark is still the server's and still wins on everything it covers.
   */
  const notifications: BackendNotification[] = readIds
    ? raw.map((item) => (item.unread && readIds.includes(item.id) ? { ...item, unread: false } : item))
    : raw;

  /*
   * Prune the stored set to what the server still returns.
   *
   * Alerts age out of the hundred-row window the controller caps at, and a
   * set that only ever grew would carry ids for requests from two years ago
   * for the life of the install. Only runs when there is a fetched list to
   * prune against — an empty or failed response must not be read as "none of
   * these exist any more" and wipe the record.
   */
  useEffect(() => {
    if (!readIds?.length || !raw.length) return;
    const live = new Set(raw.map((item) => item.id));
    const kept = readIds.filter((id) => live.has(id));
    if (kept.length === readIds.length) return;

    client.setQueryData(queryKeys.notificationsRead, kept);
    void AsyncStorage.setItem(READ_IDS_KEY, JSON.stringify(kept)).catch(() => {});
  }, [readIds, raw, client]);

  const unread = readIds ? notifications.filter((item) => item.unread).length : (query.data?.unread ?? 0);

  /**
   * Record that one alert has been opened.
   *
   * Optimistic, and deliberately so: the write is to this device's own disk,
   * the row is about to be navigated away from, and the failure mode of a
   * refused write is a dot that comes back — not a lost message. Waiting for
   * `AsyncStorage` before clearing it would leave the dot visible through the
   * screen transition, which reads as the tap not having registered.
   */
  const markOneRead = useCallback(
    (id: string) => {
      if (!id) return;
      const current = client.getQueryData<readonly string[]>(queryKeys.notificationsRead) ?? [];
      if (current.includes(id)) return;

      const next = [...current, id];
      client.setQueryData(queryKeys.notificationsRead, next);
      void AsyncStorage.setItem(READ_IDS_KEY, JSON.stringify(next)).catch(() => {});
    },
    [client],
  );

  return {
    ...query,
    notifications,
    days: groupByDay(notifications),
    unread,
    markAllRead: markRead.mutate,
    markOneRead,
    isMarkingRead: markRead.isPending,
    error: query.error as ApiError | null,
  };
}
