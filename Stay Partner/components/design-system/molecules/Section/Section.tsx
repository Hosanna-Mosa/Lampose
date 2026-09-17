import { type ReactNode } from 'react';
import { Box } from '@/components/common';
import { Text,  } from '@/components/common';
import { styles } from '@/components/design-system/styles';

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box style={styles.section}>
      <Text variant="screenTitle" style={styles.sectionTitle}>
        {title}
      </Text>
      {children}
    </Box>
  );
}
