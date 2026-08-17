import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Text, TextButton, IconButton, Icon, EmptyState, type IconName } from '@/components/ui';
import {
  groupedNotifications,
  relativeTime,
  type AppNotification,
  type NotificationType,
} from '@/lib/notifications';
import { fetchNotificationsApi, markNotificationReadApi } from '@/services/api/domain.api';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';

export default function NotificationsScreen() {
  const c = useColors();
  const router = useRouter();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

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
      }));
      setNotifications(mapped);
      setUnreadCount(res.unreadCount || mapped.filter((item) => !item.read).length);
    } catch (err) {
      console.warn('Failed to load notifications:', err);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  const handleMarkAllRead = async () => {
    try {
      await markNotificationReadApi('all');
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.warn('Failed to mark all read:', err);
    }
  };

  const handleMarkRead = async (id: string) => {
    try {
      await markNotificationReadApi(id);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.warn('Failed to mark read:', err);
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
      stickyHeader={
        <>
          <View style={styles.backRow}>
            <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
          </View>
        </>
      }
    >

      <View style={styles.head}>
        <Text variant="screenTitle">Notifications</Text>
        {unreadCount > 0 ? <TextButton label="Mark all read" onPress={handleMarkAllRead} /> : null}
      </View>

      {groups.length > 0 ? (
        groups.map((group) => (
          <View key={group.label} style={styles.group}>
            <Text variant="overline" color="textTertiary" style={styles.groupLabel}>
              {group.label}
            </Text>
            {group.items.map((n) => (
              <NotificationRow key={n.id} notification={n} style={typeStyle[n.type] || typeStyle.support} onRead={handleMarkRead} />
            ))}
          </View>
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

function NotificationRow({
  notification,
  style,
  onRead,
}: {
  notification: AppNotification;
  style: { icon: IconName; bg: string; fg: string };
  onRead?: (id: string) => void;
}) {
  const c = useColors();
  const unread = !notification.read;

  return (
    <Pressable
      onPress={() => onRead?.(notification.id)}
      disabled={notification.read}
      accessibilityRole="button"
      accessibilityLabel={`${notification.title}. ${notification.body}. ${unread ? 'Unread' : 'Read'}`}
      style={({ pressed }) => [styles.row, { opacity: unread ? (pressed ? 0.7 : 1) : 0.7 }]}
    >
      <View style={[styles.iconTile, { backgroundColor: style.bg }]}>
        <Icon name={style.icon} size={17} color={style.fg} />
      </View>

      <View style={styles.body}>
        <Text style={[styles.title, { fontFamily: unread ? fonts.bold : fonts.semibold }]}>
          {notification.title}
        </Text>
        <Text variant="badge" color="textSecondary" style={styles.rowBody}>
          {notification.body}
        </Text>
      </View>

      <View style={styles.rightCol}>
        <Text variant="badge" color="textTertiary" style={styles.time}>
          {relativeTime(notification.occurredAt)}
        </Text>
        {unread ? <View style={[styles.dot, { backgroundColor: c.accent }]} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 2 },
  backRow: { height: 44, justifyContent: 'center', marginLeft: -10, marginBottom: -8 },
  head: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 8,
  },
  group: { marginBottom: 4 },
  groupLabel: { fontSize: 11, marginTop: 4, marginBottom: 4 },

  row: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 4,
    alignItems: 'flex-start',
  },
  iconTile: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  body: { flex: 1 },
  title: { fontSize: 14, lineHeight: 18, marginBottom: 2 },
  rowBody: { fontSize: 13, lineHeight: 17 },
  rightCol: { alignItems: 'flex-end', flexShrink: 0 },
  time: { fontSize: 11 },
  dot: { width: 7, height: 7, borderRadius: 3.5, marginTop: 5 },
  empty: { minHeight: 300 },
});
