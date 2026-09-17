import { Box } from '@/components/common';
import { Text,  } from '@/components/common';
import { useColors } from '@/hooks/useColors';
import { styles } from '@/components/booking-checked-in/styles';

export function Step({ n, text }: { n: number; text: string }) {
  const c = useColors();
  return (
    <Box style={styles.step}>
      <Box style={[styles.stepNum, { backgroundColor: c.surfaceSunken }]}>
        <Text style={[styles.stepNumText, { color: c.textSecondary }]}>{n}</Text>
      </Box>
      <Text variant="bodySm" style={[styles.stepText, { color: c.textPrimary }]}>
        {text}
      </Text>
    </Box>
  );
}
