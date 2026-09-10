import React from 'react';
import { bytes } from '../../../../lib/format';
import { Box } from '../../../common/atoms/Box';
import { Inline } from '../../../common/atoms/Inline';

/** Simple utilisation meter — fill carries the value, track is a lighter step
 *  of the same ramp so state reads across the whole bar. */
export const Meter: React.FC<{ used: number; total: number; label: string }> = ({ used, total, label }) => {
  const ratio = total > 0 ? Math.min(used / total, 1) : 0;
  const severity = ratio > 0.9 ? 'var(--chart-critical)' : ratio > 0.75 ? 'var(--chart-warning)' : 'var(--chart-series)';

  return (
    <Box>
      <Box className="flex items-baseline justify-between gap-3 mb-1.5">
        <Inline className="text-sm text-ink-2">{label}</Inline>
        <Inline className="text-sm text-ink tabular">
          {bytes(used)} <Inline className="text-ink-3">of {bytes(total)}</Inline>
        </Inline>
      </Box>
      <Box
        className="h-1.5 w-full rounded-pill overflow-hidden"
        style={{ background: 'var(--chart-series-wash)' }}
      >
        <Box
          className="h-full rounded-pill transition-[width] duration-300"
          style={{ width: `${Math.max(ratio * 100, 2)}%`, background: severity }}
        />
      </Box>
    </Box>
  );
};
