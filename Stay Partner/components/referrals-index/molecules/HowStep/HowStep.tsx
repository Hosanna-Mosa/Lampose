import { Box } from '@/components/common';
import { Text } from '@/components/common';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';
import { styles } from '@/components/referrals-index/styles';

export function HowStep({ n, text }: { n: number; text: string }) {
  const c = useColors();
  return (
    <Box style={styles.howStep}>
      <Box style={[styles.howNum, { backgroundColor: c.accentTint }]}>
        <Text variant="badge" style={{ color: c.accentInk, fontFamily: fonts.bold }}>
          {n}
        </Text>
      </Box>
      <Text variant="bodySm" color="textSecondary" style={styles.howText}>
        {text}
      </Text>
    </Box>
  );
}
