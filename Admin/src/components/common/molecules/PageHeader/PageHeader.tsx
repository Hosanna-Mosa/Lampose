/**
 * Lampose Admin — UI primitives.
 *
 * Every surface in the panel is composed from these. Sizes, weights, radii and
 * colours come from the token layer in `index.css`; nothing here hardcodes a
 * hex value or an arbitrary font size, which is what keeps typography and
 * spacing consistent across pages.
 */
import React from 'react';
import { Banner } from '../../atoms/Banner';
import { Box } from '../../atoms/Box';
import { Heading } from '../../atoms/Heading';
import { Text } from '../../atoms/Text';

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  eyebrow,
  title,
  description,
  actions,
}) => (
  <Banner className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
    <Box className="min-w-0">
      {eyebrow && <Text className="text-micro uppercase text-ink-3 mb-1.5">{eyebrow}</Text>}
      <Heading level={1} className="text-title text-ink">{title}</Heading>
      {description && <Text className="text-body text-ink-2 mt-1 max-w-2xl">{description}</Text>}
    </Box>
    {actions && <Box className="flex items-center gap-2 shrink-0">{actions}</Box>}
  </Banner>
);

/* ── Button ───────────────────────────────────────────────────────────── */
