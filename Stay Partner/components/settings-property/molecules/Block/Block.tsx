import { Box } from '@/components/common';
import { Text } from '@/components/common';
import { styles } from '@/components/settings-property/styles';

export function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box style={styles.block}>
      <Text variant="caption" color="textTertiary">
        {label}
      </Text>
      {children}
    </Box>
  );
}
