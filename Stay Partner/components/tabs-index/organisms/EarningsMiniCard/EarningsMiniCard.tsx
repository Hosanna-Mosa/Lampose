import { Box } from '@/components/common';
import { Text, Card, Icon } from '@/components/common';
import { useColors } from '@/hooks/useColors';
import { styles } from '@/components/tabs-index/styles';

export function EarningsMiniCard({ today, week, onPress }: { today: string; week: string; onPress?: () => void }) {
  const c = useColors();
  return (
    <Card variant="elevated" onPress={onPress} style={[styles.halfCard, { backgroundColor: c.successTint }]}>
      <Box style={[styles.halfIcon, { backgroundColor: c.success }]}>
        <Icon name="rupee" size={16} color={c.white} />
      </Box>
      <Text variant="badge" color="successOnTint">
        Earnings
      </Text>
      <Text variant="h3" tabular style={[styles.halfValue, { color: c.successInkDeep }]}>
        {today}
      </Text>
      <Text variant="caption" color="successOnTint" style={styles.halfCaption}>
        today · {week} this week
      </Text>
    </Card>
  );
}

/**
 * How many students are waiting, and how long the nearest one has.
 *
 * Both figures are real now. The count used to come from a fixture array —
 * which is why this banner said "3 pending requests" on an account whose true
 * figure was one — and the urgency line was removed entirely because the
 * backend did not project a deadline.
 *
 * It does now: an app-channel request carries `expiresAt`, and the countdown
 * below is derived from it and corrected for this device's clock. That makes
 * the red line the most useful thing on the dashboard, because it is the only
 * one measured in minutes.
 */
