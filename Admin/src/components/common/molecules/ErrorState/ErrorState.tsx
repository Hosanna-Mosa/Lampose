/**
 * Lampose Admin — UI primitives.
 *
 * Every surface in the panel is composed from these. Sizes, weights, radii and
 * colours come from the token layer in `index.css`; nothing here hardcodes a
 * hex value or an arbitrary font size, which is what keeps typography and
 * spacing consistent across pages.
 */
import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '../../atoms/Button';
import { Box } from '../../atoms/Box';
import { Text } from '../../atoms/Text';

/** Inline error surface for a failed request — states the real reason. */
export const ErrorState: React.FC<{ message: string; onRetry?: () => void }> = ({
  message,
  onRetry,
}) => (
  <Box className="flex items-start gap-3 p-4 rounded-panel bg-crit-soft border border-crit-border">
    <AlertCircle className="size-4 text-crit shrink-0 mt-0.5" strokeWidth={2} />
    <Box className="min-w-0 flex-1">
      <Text className="text-body font-medium text-ink">Could not load data</Text>
      <Text className="text-sm text-ink-2 mt-0.5 break-words">{message}</Text>
    </Box>
    {onRetry && (
      <Button size="sm" variant="secondary" onClick={onRetry}>
        Retry
      </Button>
    )}
  </Box>
);

/* ── Modal ────────────────────────────────────────────────────────────── */
