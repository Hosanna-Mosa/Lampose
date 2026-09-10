/**
 * Chart primitives — plain SVG, no chart library.
 *
 * Conventions held across every chart here:
 *  · One measure per chart, one axis. Never two y-scales.
 *  · Single-series charts use one hue and carry no legend — the title names it.
 *  · Marks are thin, capped, with a 4px rounded data-end and a square baseline.
 *  · Grid/axis lines are hairline and recessive; text never wears the data colour.
 *  · Every chart ships a hover layer and a screen-reader table of the same values.
 */
import React, { useMemo } from 'react';
import type { Datum } from '../../utils/chartTypes';
import { DataTable } from '../../molecules/DataTable';
import { Box } from '../../atoms/Box';
import { Figure } from '../../atoms/Figure';
import { Inline } from '../../atoms/Inline';

interface RankedBarsProps {
  data: Datum[];
  format?: (v: number) => string;
  /** Shown under each label, e.g. a share or an average. */
  secondary?: (d: Datum, share: number) => string;
  caption: string;
  unit?: string;
}

export const RankedBars: React.FC<RankedBarsProps> = ({
  data,
  format = (v) => v.toLocaleString('en-IN'),
  secondary,
  caption,
  unit,
}) => {
  const max = useMemo(() => Math.max(...data.map((d) => d.value), 0), [data]);
  const total = useMemo(() => data.reduce((s, d) => s + d.value, 0), [data]);

  if (!data.length) return null;

  return (
    <Figure className="m-0 space-y-3">
      {data.map((d) => {
        const share = total > 0 ? (d.value / total) * 100 : 0;
        return (
          <Box key={d.label} className="group">
            <Box className="flex items-baseline justify-between gap-3 mb-1.5">
              <Inline className="text-sm text-ink truncate">{d.label}</Inline>
              <Inline className="text-sm text-ink-2 tabular shrink-0">
                {format(d.value)}
                {secondary && (
                  <Inline className="text-ink-3 ml-1.5">{secondary(d, share)}</Inline>
                )}
              </Inline>
            </Box>
            {/* Track is a lighter step of the same ramp, so state reads across the bar */}
            <Box className="h-1.5 w-full rounded-pill overflow-hidden" style={{ background: 'var(--chart-series-wash)' }}>
              <Box
                className="h-full rounded-pill transition-[width] duration-300"
                style={{
                  width: `${max > 0 ? Math.max((d.value / max) * 100, d.value > 0 ? 3 : 0) : 0}%`,
                  background: d.color || 'var(--chart-series)',
                }}
              />
            </Box>
          </Box>
        );
      })}
      <DataTable caption={caption} data={data} unit={unit} />
    </Figure>
  );
};

/* ── Sparkline — the shape of a trend inside a stat tile ──────────────── */
