import { Box } from '@/components/common';
import { Text } from '@/components/common';
import type { SupportMessage, SupportTicketStatus } from '@/services/api/support.api';
import { useColors } from '@/hooks/useColors';
import { styles } from '@/components/support-ticket/styles';

export function Bubble({
  message,
  mine,
}: {
  message: SupportMessage;
  mine: SupportMessage['author'];
}) {
  const c = useColors();

  if (message.author === 'system') {
    return (
      <Box style={styles.systemRow}>
        <Text variant="badge" color="textTertiary" style={styles.systemText}>
          {message.body}
        </Text>
      </Box>
    );
  }

  const isMine = message.author === mine;
  const senderLabel = isMine
    ? 'You'
    : message.author === 'support'
      ? (message.authorName || 'Support')
      : message.author === 'partner'
        ? (message.authorName || 'Property owner')
        : (message.authorName || 'Guest');

  return (
    <Box style={[styles.bubbleGroup, { alignItems: isMine ? 'flex-end' : 'flex-start' }]}>
      <Box
        style={[
          styles.bubble,
          isMine
            ? [styles.bubbleOwner, { backgroundColor: c.accent }]
            : [styles.bubbleSupport, { backgroundColor: c.surfaceSunken }],
        ]}
      >
        <Text style={[styles.bubbleText, { color: isMine ? c.white : c.textPrimary }]}>
          {message.body}
        </Text>
      </Box>
      <Text variant="badge" color="textTertiary" style={styles.bubbleMeta}>
        {senderLabel} · {new Date(message.at).toLocaleString(undefined, {
          day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
        })}
      </Text>
    </Box>
  );
}
