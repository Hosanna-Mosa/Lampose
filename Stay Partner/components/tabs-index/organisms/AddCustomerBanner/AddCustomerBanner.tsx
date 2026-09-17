import { Box } from '@/components/common';
import { Text, Card, Icon } from '@/components/common';
import { useColors } from '@/hooks/useColors';
import { styles } from '@/components/tabs-index/styles';

export function AddCustomerBanner({ onPress }: { onPress: () => void }) {
  const c = useColors();
  return (
    <Card variant="elevated" onPress={onPress} style={styles.banner}>
      <Box style={[styles.bannerIcon, { backgroundColor: c.successTint }]}>
        <Icon name="plus" size={18} color={c.success} />
      </Box>
      <Box style={styles.bannerBody}>
        <Text variant="cardTitle" style={styles.bannerTitle}>
          Add a customer
        </Text>
        <Text variant="badge" color="textSecondary">
          Log a walk-in and invite them to Lampose
        </Text>
      </Box>
      <Icon name="chevron-right" size={14} color={c.textTertiary} strokeWidth={2} />
    </Card>
  );
}
