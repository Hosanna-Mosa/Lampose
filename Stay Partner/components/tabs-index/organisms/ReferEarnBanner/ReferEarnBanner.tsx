import { Box } from '@/components/common';
import { Text, Card, Icon } from '@/components/common';
import { POINTS_PER_REFERRAL, POINT_VALUE_RUPEES } from '@/lib/referrals';
import { useColors } from '@/hooks/useColors';
import { styles } from '@/components/tabs-index/styles';

export function ReferEarnBanner({ onPress }: { onPress: () => void }) {
  const c = useColors();
  return (
    <Card variant="elevated" onPress={onPress} style={styles.banner}>
      <Box style={[styles.bannerIcon, { backgroundColor: c.accentTint }]}>
        <Icon name="users" size={18} color={c.accent} />
      </Box>
      <Box style={styles.bannerBody}>
        <Text variant="cardTitle" style={styles.bannerTitle}>
          Refer &amp; earn
        </Text>
        <Text variant="badge" color="textSecondary">
          Invite an owner, get ₹{POINTS_PER_REFERRAL * POINT_VALUE_RUPEES} when they join
        </Text>
      </Box>
      <Icon name="chevron-right" size={14} color={c.textTertiary} strokeWidth={2} />
    </Card>
  );
}

/** Count is live from `lib/complaints.ts` — not a static figure like the requests banner's. */
/** `open` comes from the summary — `openComplaintsCount()` read a fixture that
    reported 2 open complaints on an account that had none. */
