import { Box } from '@/components/common';
import { Text, Card, Icon } from '@/components/common';
import { useColors } from '@/hooks/useColors';
import { styles } from '@/components/tabs-index/styles';

export function BookingCard({
  arrivals,
  departures,
  inHouse,
  onPress,
}: {
  arrivals: number;
  departures: number;
  inHouse: number;
  onPress: () => void;
}) {
  const c = useColors();
  return (
    <Card variant="elevated" onPress={onPress} style={[styles.halfCard, { backgroundColor: c.accentTint }]}>
      <Box style={[styles.halfIcon, { backgroundColor: c.accent }]}>
        <Icon name="bed" size={16} color={c.white} />
      </Box>
      <Text variant="badge" color="accentMuted">
        Bookings
      </Text>
      <Text
        variant="h3"
        tabular
        style={[styles.halfValue, { color: inHouse === 0 ? c.textTertiary : c.accentInkDeep }]}
      >
        {inHouse}
      </Text>
      <Text variant="caption" color="accentMuted" style={styles.halfCaption}>
        in-house · {arrivals} in, {departures} out today
      </Text>
    </Card>
  );
}

/**
 * Read-only since the Payouts tab was removed.
 *
 * `onPress` is optional rather than deleted: `Card` renders a plain View
 * without one, so the tile stops offering a press it can no longer honour, and
 * the prop is still here for whenever a destination exists again.
 */
