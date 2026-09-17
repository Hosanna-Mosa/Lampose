import { Box, Tappable } from '@/components/common';
import { Text, Badge } from '@/components/common';
import type { BackendPartnerTicket, SupportTicketStatus } from '@/services/api/support.api';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';
import { styles } from '@/components/support-index/styles';
import { STATUS_TONE, STATUS_LABEL, timeLabel } from '@/components/support-index/utils';

export function TicketRow({ ticket, onPress }: { ticket: BackendPartnerTicket; onPress: () => void }) {
  const c = useColors();
  const dimmed = ticket.status === 'resolved' || ticket.status === 'closed';
  const fromGuest = Boolean(ticket.linkedPartnerId);

  return (
    <Tappable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${ticket.subject}. ${STATUS_LABEL[ticket.status]}. ${ticket.category ?? ''}, ${timeLabel(ticket.lastActivityAt)}`}
      style={({ pressed }) => [
        styles.card,
        { borderColor: c.borderCard, backgroundColor: c.surface, opacity: pressed ? 0.75 : dimmed ? 0.75 : 1 },
      ]}
    >
      <Box style={styles.titleRow}>
        <Text
          style={[styles.subject, { fontFamily: dimmed ? fonts.semibold : fonts.bold }]}
          numberOfLines={1}
        >
          {ticket.subject}
        </Text>
        {ticket.unread ? <Box style={[styles.dot, { backgroundColor: c.accent }]} /> : null}
      </Box>

      <Box style={styles.metaRow}>
        <Badge label={STATUS_LABEL[ticket.status]} tone={STATUS_TONE[ticket.status]} />
        {fromGuest && (
          /* This owner did not file this one — a student did, about one of
             their properties. See the header for why it is one inbox. */
          <Badge label="Guest issue" tone="neutral" />
        )}
        <Text variant="caption" color="textCaption" style={styles.metaText}>
          {ticket.category ?? 'Report'} · {timeLabel(ticket.lastActivityAt)}
        </Text>
      </Box>
    </Tappable>
  );
}
