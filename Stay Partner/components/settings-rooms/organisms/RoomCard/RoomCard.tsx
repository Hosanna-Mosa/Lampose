import { Box } from '@/components/common';
import { Text, Card, Badge } from '@/components/common';
import { formatINR } from '@/lib/format';
import { useColors } from '@/hooks/useColors';
import { styles } from '@/components/settings-rooms/styles';
import { ShareType } from '@/components/settings-rooms/utils';

export function RoomCard({ room }: { room: ShareType }) {
  const c = useColors();

  const total = Number(room.totalBeds ?? 0);
  const free = Number(room.availableBeds ?? 0);
  /* `isAvailable` is the owner's switch; a full room is closed regardless of
     it, so both have to be true for the row to read as open. */
  const open = room.isAvailable !== false && free > 0;

  return (
    <Card style={styles.card}>
      <Box style={styles.head}>
        <Text style={[styles.name, { color: c.textPrimary }]} numberOfLines={1}>
          {room.name?.trim() || 'Unnamed room type'}
        </Text>
        <Badge
          label={open ? 'Accepting' : free === 0 ? 'Full' : 'Paused'}
          tone={open ? 'success' : 'neutral'}
        />
      </Box>

      <Box style={styles.metaRow}>
        <Text style={[styles.beds, { color: free > 0 ? c.accentInkDeep : c.textTertiary }]}>
          {free} of {total} free
        </Text>
        <Text variant="bodySm" color="textSecondary">
          {Number.isFinite(Number(room.monthlyPrice))
            ? `${formatINR(Number(room.monthlyPrice))} / month`
            : 'Price not recorded'}
        </Text>
      </Box>
    </Card>
  );
}
