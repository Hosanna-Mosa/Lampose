import { Box } from '@/components/common';
import { Text } from '@/components/common';
import { useColors } from '@/hooks/useColors';
import { styles } from '@/components/earnings-index/styles';

export function StatTile({ label, value, loading }: { label: string; value: string; loading: boolean }) {
  const c = useColors();
  return (
    <Box style={[styles.statTile, { borderColor: c.borderCard, backgroundColor: c.surface }]}>
      <Text variant="caption" color="textTertiary">
        {label}
      </Text>
      <Text style={[styles.statValue, { color: c.textPrimary }]}>{loading ? '…' : value}</Text>
    </Box>
  );
}
