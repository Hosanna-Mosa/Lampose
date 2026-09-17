import { Box, Tappable } from '@/components/common';
import { Text, Icon, type IconName } from '@/components/common';
import { relativeTime, type AppNotification,  } from '@/lib/notifications';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';
import { styles } from '@/components/notifications-index/styles';

export function NotificationRow({
  notification,
  style,
  onRead,
  onOpen,
}: {
  notification: AppNotification;
  style: { icon: IconName; bg: string; fg: string };
  onRead?: (id: string) => void;
  onOpen?: (requestId: string) => void;
}) {
  const c = useColors();
  const unread = !notification.read;

  /*
   * Two things happen on one tap, and the row is pressable for either.
   *
   * It used to be `disabled` once read, so a notification about a request
   * still counting down became untappable the moment it was seen — which is
   * exactly when an owner would want to open it.
   */
  const goes = Boolean(notification.requestId);

  return (
    <Tappable
      onPress={() => {
        if (unread) onRead?.(notification.id);
        if (notification.requestId) {
          onOpen?.(notification.requestId);
        }
      }}
      disabled={!unread && !goes}
      accessibilityRole="button"
      accessibilityLabel={`${notification.title}. ${notification.body}. ${unread ? 'Unread' : 'Read'}${goes ? '. Opens the request.' : ''}`}
      style={({ pressed }) => [styles.row, { opacity: unread || goes ? (pressed ? 0.7 : 1) : 0.7 }]}
    >
      <Box style={[styles.iconTile, { backgroundColor: style.bg }]}>
        <Icon name={style.icon} size={17} color={style.fg} />
      </Box>

      <Box style={styles.body}>
        <Text style={[styles.title, { fontFamily: unread ? fonts.bold : fonts.semibold }]}>
          {notification.title}
        </Text>
        <Text variant="badge" color="textSecondary" style={styles.rowBody}>
          {notification.body}
        </Text>
      </Box>

      <Box style={styles.rightCol}>
        <Text variant="badge" color="textTertiary" style={styles.time}>
          {relativeTime(notification.occurredAt)}
        </Text>
        {unread ? <Box style={[styles.dot, { backgroundColor: c.accent }]} /> : null}
        {goes && !unread ? (
          <Icon name="chevron-right" size={15} color={c.textTertiary} />
        ) : null}
      </Box>
    </Tappable>
  );
}
