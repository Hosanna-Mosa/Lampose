/**
 * Lampose Admin — UI primitives.
 *
 * Every surface in the panel is composed from these. Sizes, weights, radii and
 * colours come from the token layer in `index.css`; nothing here hardcodes a
 * hex value or an arbitrary font size, which is what keeps typography and
 * spacing consistent across pages.
 */
import React from 'react';
import { cx } from '../../utils/cx';
import { Box } from '../../atoms/Box';
import { Inline } from '../../atoms/Inline';
import { Text } from '../../atoms/Text';

interface EmptyStateProps {
  icon: React.ElementType;
  title: string;
  description?: string;
  action?: React.ReactNode;
  tone?: 'neutral' | 'crit';
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  action,
  tone = 'neutral',
}) => (
  <Box className="py-12 px-6 flex flex-col items-center text-center">
    <Inline
      className={cx(
        'grid place-items-center size-10 rounded-panel mb-3',
        tone === 'crit' ? 'bg-crit-soft text-crit' : 'bg-surface-inset text-ink-3'
      )}
    >
      <Icon className="size-5" strokeWidth={1.75} />
    </Inline>
    <Text className="text-body font-medium text-ink">{title}</Text>
    {description && <Text className="text-sm text-ink-3 mt-1 max-w-sm">{description}</Text>}
    {action && <Box className="mt-4">{action}</Box>}
  </Box>
);
