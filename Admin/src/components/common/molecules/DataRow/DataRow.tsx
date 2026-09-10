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

/** A label/value pair used across detail panels and telemetry lists. */
export const DataRow: React.FC<{ label: string; value: React.ReactNode; mono?: boolean }> = ({
  label,
  value,
  mono,
}) => (
  <Box className="flex items-baseline justify-between gap-4 py-2 border-b border-line last:border-0">
    <Inline className="text-sm text-ink-3 shrink-0">{label}</Inline>
    <Inline className={cx('text-sm text-ink text-right break-all', mono && 'font-mono tabular')}>
      {value}
    </Inline>
  </Box>
);
