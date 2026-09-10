import React from 'react';
import { cx } from '../../../common/utils';
import { money } from '../../utils';
import { Box } from '../../../common/atoms/Box';
import { Inline } from '../../../common/atoms/Inline';

/** One line of the reconciliation. Tabular, so the column reads down. */
export const MoneyRow: React.FC<{ label: string; value: number | null; strong?: boolean }> = ({
  label,
  value,
  strong,
}) => (
  <Box className="flex items-baseline justify-between gap-4 py-1.5 border-b border-line last:border-0">
    <Inline className={cx('text-sm', strong ? 'text-ink' : 'text-ink-3')}>{label}</Inline>
    <Inline className={cx('text-sm tabular text-right', strong ? 'text-ink font-medium' : 'text-ink-2')}>
      {money(value)}
    </Inline>
  </Box>
);
