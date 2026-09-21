import { useEffect, useState } from 'react';
import { Box, Tappable } from '@/components/common';
import { useRouter } from 'expo-router';
import { Screen, Text, TextButton, IconButton, Icon, EmptyState, ErrorState, type IconName } from '@/components/common';
import {
  groupedNotifications,
  relativeTime,
  type AppNotification,
  type NotificationType,
} from '@/lib/notifications';
import { fetchNotificationsApi, markNotificationReadApi } from '@/services/api/domain.api';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';
import { logWarn } from '@/lib/log';
import { NotificationRow } from '@/components/notifications-index/organisms/NotificationRow/NotificationRow';
import { styles } from '@/components/notifications-index/styles';

export function NotificationsScreen() {
  const c = useColors();
  const router = useRouter();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  /* Set on a failed fetch, cleared on the next successful one — kept apart
     from an empty `notifications` array so "the request failed" and "you
     genuinely have nothing" render as two different things instead of both
     landing on the same "No notifications" empty state. */
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadNotifications = async () => {
    try {
      const res = await fetchNotificationsApi();
      const mapped: AppNotification[] = (res.items || []).map((n: any) => ({
        id: n.id || n._id,
        type: (n.category || 'support') as NotificationType,
        title: n.title,
        body: n.message,
        occurredAt: new Date(n.createdAt || Date.now()),
        read: Boolean(n.read),
        requestId: n.requestId ?? null,
      }));
      setNotifications(mapped);
      setUnreadCount(res.unreadCount || mapped.filter((item) => !item.read).length);
      setLoadError(false);
    } catch (err) {
      logWarn('Failed to load notifications:', err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadNotifications();
    } finally {
      setRefreshing(false);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markNotificationReadApi('all');
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (err) {
      logWarn('Failed to mark all read:', err);
    }
  };

  const handleMarkRead = async (id: string) => {
    try {
      await markNotificationReadApi(id);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      logWarn('Failed to mark read:', err);
    }
  };

  const groups = groupedNotifications(notifications);

  const typeStyle: Record<NotificationType, { icon: IconName; bg: string; fg: string }> = {
    request: { icon: 'calendar', bg: c.accentTint, fg: c.accent },
    payout: { icon: 'bank', bg: c.warningTint, fg: c.warningOnTint },
    checkin: { icon: 'suitcase', bg: c.infoTint, fg: c.info },
    review: { icon: 'star', bg: c.surfaceSunken, fg: c.warning },
    payment: { icon: 'rupee', bg: c.successTint, fg: c.success },
    support: { icon: 'message', bg: c.surfaceSunken, fg: c.textSecondary },
  };

  return (
    <Screen
      contentStyle={styles.stack}
      refreshing={refreshing}
      onRefresh={onRefresh}
      stickyHeader={
        <>
          <Box style={styles.backRow}>
            <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
          </Box>
        </>
      }
    >

      <Box style={styles.head}>
        <Text variant="screenTitle">Notifications</Text>
        {unreadCount > 0 ? <TextButton label="Mark all read" onPress={handleMarkAllRead} /> : null}
      </Box>

      {loading ? null : loadError && notifications.length === 0 ? (
        <ErrorState
          title="We could not load your notifications"
          body="Pull to try again."
          onRetry={loadNotifications}
        />
      ) : groups.length > 0 ? (
        groups.map((group) => (
          <Box key={group.label} style={styles.group}>
            <Text variant="overline" color="textTertiary" style={styles.groupLabel}>
              {group.label}
            </Text>
            {group.items.map((n) => (
              <NotificationRow
                key={n.id}
                notification={n}
                style={typeStyle[n.type] || typeStyle.support}
                onRead={handleMarkRead}
                /* Straight to the request. With three minutes on the clock,
                   an extra hop through the inbox is a real fraction of it. */
                onOpen={(requestId) => router.push({
                  pathname: '/requests/[id]',
                  params: { id: requestId },
                })}
              />
            ))}
          </Box>
        ))
      ) : (
        <EmptyState
          icon="bell"
          title="No notifications"
          body="Booking activity, payouts, and reviews will show up here."
          style={styles.empty}
        />
      )}
    </Screen>
  );
}

