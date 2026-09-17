import { Box } from '@/components/common';
import { shadow } from '@/constants/layout';
import { useColors } from '@/hooks/useColors';
import { styles } from '@/components/tabs-index/styles';

export function LoadingBody() {
  const c = useColors();
  const card = { backgroundColor: c.surface, ...shadow.card };
  return (
    <>
      <Box style={[styles.hero, { backgroundColor: c.surfaceSunken, height: 140 }]} />
      <Box style={styles.halfRow}>
        <Box style={[styles.halfCard, card, { height: 128 }]} />
        <Box style={[styles.halfCard, card, { height: 128 }]} />
      </Box>
      <Box style={[styles.skelCard, card, { height: 72 }]} />
      <Box style={[styles.skelCard, card, { height: 72 }]} />
    </>
  );
}
