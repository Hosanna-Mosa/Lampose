import { Box } from '@/components/common';
import { Text,  } from '@/components/common';
import { useColors } from '@/hooks/useColors';
import type { Palette } from '@/constants/colors';
import { styles } from '@/components/design-system/styles';

export function Swatches({ items }: { items: [string, keyof Palette][] }) {
  const c = useColors();
  return (
    <Box style={styles.wrapRow}>
      {items.map(([label, token]) => (
        <Box key={label} style={styles.swatch}>
          <Box
            style={[
              styles.chipColor,
              { backgroundColor: c[token] as string, borderColor: c.borderCard },
            ]}
          />
          <Text variant="mono" color="textSecondary" style={styles.swatchLabel}>
            {label}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
