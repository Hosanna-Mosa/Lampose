import { Avatar, Badge, Box, Icon, Text, Tappable } from '@/components/common';
import { formatINR } from '@/lib/format';
import { useColors } from '@/hooks/useColors';
import type { Resident } from '@/services/api/rent.api';
import { styles } from './styles';
import { STATUS_LABEL, STATUS_TONE, dayLabel } from './utils';

/**
 * One resident in a list: who, where, and the one rent fact that matters most
 * right now — what they owe if anything, otherwise when they next pay.
 */
export function ResidentRow({ resident, onPress }: { resident: Resident; onPress: () => void }) {
  const c = useColors();
  const { summary, rent } = resident;

  const owing = summary.status === 'overdue' || summary.status === 'due';
  const detail = rent.source === 'none'
    ? 'Set the monthly rent'
    : owing
      ? `${formatINR(summary.outstanding)} to collect${summary.hasPartial ? ' · partly paid' : ''}`
      : summary.nextDue
        ? `Next ${formatINR(summary.nextDue.balance)} on ${dayLabel(summary.nextDue.dueDate)}`
        : `${formatINR(rent.monthly)} a month`;

  return (
    <Tappable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${resident.guestName}, ${STATUS_LABEL[summary.status]}`}
      style={({ pressed }) => [
        styles.row,
        { borderColor: c.borderCard, backgroundColor: c.surface, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <Avatar label={resident.guestName} />
      <Box style={styles.flex}>
        <Text variant="cardTitle" numberOfLines={1}>{resident.guestName}</Text>
        <Text variant="caption" color="textTertiary" numberOfLines={1}>
          Room {resident.roomNumber || '—'} · {resident.shareType}
          {resident.propertyName ? ` · ${resident.propertyName}` : ''}
        </Text>
        <Text variant="caption" color={owing ? 'error' : 'textSecondary'} numberOfLines={1}>
          {detail}
        </Text>
      </Box>
      <Badge
        label={rent.source === 'none' ? 'Set rent' : STATUS_LABEL[summary.status]}
        tone={rent.source === 'none' ? 'warning' : STATUS_TONE[summary.status]}
      />
      <Icon name="chevron-right" size={16} color={c.textTertiary} />
    </Tappable>
  );
}
