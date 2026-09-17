import { Box } from '@/components/common';
import { Text, Card, Icon } from '@/components/common';
import { formatCountdown } from '@/services/hooks/useStayRequests';
import { useColors } from '@/hooks/useColors';
import { styles } from '@/components/tabs-index/styles';

export function RequestsBanner({
  count,
  secondsToSoonest,
  onPress,
}: {
  count: number;
  /** Null when nothing is pending — the line is hidden rather than zeroed. */
  secondsToSoonest: number | null;
  onPress: () => void;
}) {
  const c = useColors();

  return (
    <Card variant="elevated" onPress={onPress} style={styles.banner}>
      <Box style={[styles.bannerIcon, { backgroundColor: c.warningTint }]}>
        <Icon name="upload" size={18} color={c.warningOnTint} />
      </Box>
      <Box style={styles.bannerBody}>
        <Text variant="cardTitle" style={styles.bannerTitle}>
          {count} pending {count === 1 ? 'request' : 'requests'}
        </Text>
        {secondsToSoonest !== null ? (
          <Box style={styles.urgencyRow}>
            <Box style={[styles.dot, { backgroundColor: c.error }]} />
            <Text variant="badge" style={{ color: c.error }}>
              {/* Minutes and seconds, because that is the unit this deadline
                  is actually measured in. An hours figure here would read as
                  "no rush" for something with 90 seconds left. */}
              Soonest answer due in {formatCountdown(secondsToSoonest)}
            </Text>
          </Box>
        ) : (
          <Text variant="badge" color="textSecondary">
            Nothing waiting on you right now
          </Text>
        )}
      </Box>
      <Icon name="chevron-right" size={14} color={c.textTertiary} strokeWidth={2} />
    </Card>
  );
}

/** Same banner shape as pending requests — same width, same height, just a different card. */
/**
 * Where "Add customer" lives now — replaces separate "+" entry points that
 * used to sit on the Customers screen and the Requests screen header. One
 * clear place, matching every other action on this dashboard, rather than
 * the same button scattered across three screens.
 */
