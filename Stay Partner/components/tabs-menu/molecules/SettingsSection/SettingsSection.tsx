import { type ReactNode } from 'react';
import { Box } from '@/components/common';
import { Text, Card } from '@/components/common';
import { styles } from '@/components/tabs-menu/styles';

export function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box>
      <Text variant="overline" color="textTertiary" style={styles.overline}>
        {title}
      </Text>
      <Card padded={false}>{children}</Card>
    </Box>
  );
}
