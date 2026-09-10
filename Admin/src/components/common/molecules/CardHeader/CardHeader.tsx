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
import { Heading } from '../../atoms/Heading';
import { Inline } from '../../atoms/Inline';
import { Text } from '../../atoms/Text';

interface CardHeaderProps {
  title: string;
  description?: string;
  icon?: React.ElementType;
  action?: React.ReactNode;
  className?: string;
}

export const CardHeader: React.FC<CardHeaderProps> = ({
  title,
  description,
  icon: Icon,
  action,
  className,
}) => (
  <Box className={cx('flex items-start justify-between gap-4', className)}>
    <Box className="flex items-start gap-2.5 min-w-0">
      {Icon && (
        <Inline className="mt-0.5 grid place-items-center size-7 rounded-control bg-surface-inset text-ink-2 shrink-0">
          <Icon className="size-4" strokeWidth={1.75} />
        </Inline>
      )}
      <Box className="min-w-0">
        <Heading level={2} className="text-section text-ink truncate">{title}</Heading>
        {description && <Text className="text-sm text-ink-3 mt-0.5">{description}</Text>}
      </Box>
    </Box>
    {action && <Box className="shrink-0 flex items-center gap-2">{action}</Box>}
  </Box>
);

/* ── Page header ──────────────────────────────────────────────────────── */
