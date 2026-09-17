import { Box } from '@/components/common';
import { Text, Button, Icon } from '@/components/common';
import { useColors } from '@/hooks/useColors';
import { styles } from '@/components/tabs-index/styles';

export function ErrorBody({ onRetry }: { onRetry: () => void }) {
  const c = useColors();
  return (
    <Box style={styles.errorBody}>
      <Box style={[styles.errorIcon, { backgroundColor: c.errorTint }]}>
        <Icon name="alert-circle" size={24} color={c.error} />
      </Box>
      <Text variant="h3" center>
        Couldn&apos;t load your dashboard
      </Text>
      <Text variant="caption" color="textSecondary" center>
        Check your connection and try again.
      </Text>
      <Button label="Retry" onPress={onRetry} size="sm" fullWidth={false} style={styles.retry} />
    </Box>
  );
}

// ── Pieces ────────────────────────────────────────────────────────────────

/** How long the crossfade takes. Slow enough to see, not sluggish. */
