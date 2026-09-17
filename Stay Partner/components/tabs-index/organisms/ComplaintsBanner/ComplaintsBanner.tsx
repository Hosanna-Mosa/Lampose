import { Box } from '@/components/common';
import { Text, Card, Icon } from '@/components/common';
import { useColors } from '@/hooks/useColors';
import { styles } from '@/components/tabs-index/styles';

export function ComplaintsBanner({ open, onPress }: { open: number; onPress: () => void }) {
  const c = useColors();
  return (
    <Card variant="elevated" onPress={onPress} style={styles.banner}>
      <Box style={[styles.bannerIcon, { backgroundColor: c.errorTint }]}>
        <Icon name="message" size={18} color={c.error} />
      </Box>
      <Box style={styles.bannerBody}>
        <Text variant="cardTitle" style={styles.bannerTitle}>
          Complaints
        </Text>
        <Text variant="badge" color="textSecondary">
          {open > 0 ? `${open} open · needs a look` : 'Nothing open right now'}
        </Text>
      </Box>
      <Icon name="chevron-right" size={14} color={c.textTertiary} strokeWidth={2} />
    </Card>
  );
}

/**
 * How many room types are visible to customers.
 *
 * Reads the owner's REAL room types. The count used to come from a four-row
 * fixture in `lib/shareTypes.ts`, so every owner was told they had four
 * whatever their listing actually offered.
 *
 * Fetched here rather than passed down because it is the only thing on the
 * dashboard that needs it, and it re-reads on focus so a change made on the
 * Share Types screen is reflected on the way back.
 */
