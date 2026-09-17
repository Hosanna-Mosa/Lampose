import { Box } from '@/components/common';
import { Text, Badge, Avatar } from '@/components/common';
import { initials, formatShortDate } from '@/lib/format';
import { useColors } from '@/hooks/useColors';
import { styles } from '@/components/referrals-index/styles';
import { ReferralEntry, STATUS_META } from '@/components/referrals-index/utils';

export function ReferralRow({ referral }: { referral: ReferralEntry }) {
  const c = useColors();
  const joined = referral.status === 'joined';
  const meta = STATUS_META[referral.status];

  /* "Priya · via Sunrise PG · 12 Aug" for a customer invite, "Vikram Oberoi ·
     18 Aug" for an owner referral — `propertyName` is only ever set on the
     former, see the `history` sub-schema in partnerDomains.model.js. */
  const subtitle = [referral.propertyName ? `via ${referral.propertyName}` : null, formatShortDate(referral.date)]
    .filter(Boolean)
    .join(' · ');

  return (
    <Box style={[styles.row, { opacity: joined ? 1 : 0.85 }]}>
      <Avatar label={initials(referral.name)} size={36} tone={joined ? 'accent' : 'neutral'} />
      <Box style={styles.rowBody}>
        <Text style={styles.rowName}>{referral.name}</Text>
        <Text variant="caption" color="textSecondary">
          {subtitle}
        </Text>
      </Box>
      <Box style={styles.rowEnd}>
        <Badge label={meta.label} tone={meta.tone} />
        {joined ? (
          <Text tabular variant="badge" color="textSecondary" style={styles.rowPoints}>
            +{referral.rewardPoints} pts
          </Text>
        ) : null}
      </Box>
    </Box>
  );
}
