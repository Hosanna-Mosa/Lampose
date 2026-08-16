import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Text, TextButton, IconButton, Icon, EmptyState, type IconName } from '@/components/ui';
import {
  NOTIFICATIONS,
  groupedNotifications,
  markAllRead,
  markRead,
  relativeTime,
  subscribeNotifications,
  unreadCount,
  type AppNotification,
  type NotificationType,
} from '@/lib/notifications';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';

/**
 * Chronological, grouped by day, one coloured icon per event type. Unread
 * rows carry a dot and a bolder title; read rows dim to 70% — both states are
 * real, driven by `read`, not a static split like the design's frame.
 */
export default function NotificationsScreen() {
  const c = useColors();
  const router = useRouter();
  const [revision, setRevision] = useState(0);
  useEffect(() => subscribeNotifications(() => setRevision((r) => r + 1)), []);

  const groups = groupedNotifications(NOTIFICATIONS);
  const unread = unreadCount(NOTIFICATIONS);

  const typeStyle: Record<NotificationType, { icon: IconName; bg: string; fg: string }> = {
    request: { icon: 'calendar', bg: c.accentTint, fg: c.accent },
    // Amber icon on amber tint — darkened, same fix as every other instance of
    // this pairing in the app.
    payout: { icon: 'bank', bg: c.warningTint, fg: c.warningOnTint },
    checkin: { icon: 'suitcase', bg: c.infoTint, fg: c.info },
    review: { icon: 'star', bg: c.surfaceSunken, fg: c.warning },
    payment: { icon: 'rupee', bg: c.successTint, fg: c.success },
    support: { icon: 'message', bg: c.surfaceSunken, fg: c.textSecondary },
  };

  return (
    <Screen contentStyle={styles.stack} key={revision}>
      <View style={styles.backRow}>
        <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
      </View>

      <View style={styles.head}>
        <Text variant="screenTitle">Notifications</Text>
        {unread > 0 ? <TextButton label="Mark all read" onPress={markAllRead} /> : null}
      </View>

      {groups.length > 0 ? (
        groups.map((group) => (
          <View key={group.label} style={styles.group}>
            <Text variant="overline" color="textTertiary" style={styles.groupLabel}>
              {group.label}
            </Text>
            {group.items.map((n) => (
              <NotificationRow key={n.id} notification={n} style={typeStyle[n.type]} />
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
}: {
  notification: AppNotification;
  style: { icon: IconName; bg: string; fg: string };
}) {
  const c = useColors();
  const unread = !notification.read;

  return (
    <Pressable
      onPress={() => markRead(notification.id)}
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
  groupLabel: { fontSize: 10.5, marginTop: 4, marginBottom: 4 },

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
  title: { fontSize: 13.5, lineHeight: 18, marginBottom: 2 },
  rowBody: { fontSize: 12.5, lineHeight: 17 },
  rightCol: { alignItems: 'flex-end', flexShrink: 0 },
  time: { fontSize: 11 },
  dot: { width: 7, height: 7, borderRadius: 3.5, marginTop: 5 },
  empty: { minHeight: 300 },
});
