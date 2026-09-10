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
import React, { useMemo, useState } from 'react';
import type { Datum } from '../../utils/chartTypes';
import { DataTable } from '../../molecules/DataTable';
import { Box } from '../../atoms/Box';
import { Figure } from '../../atoms/Figure';
import { Inline } from '../../atoms/Inline';
import { Text } from '../../atoms/Text';

interface TooltipState {
  x: number;
  y: number;
  title: string;
  value: string;
  meta?: string;
}

const Tooltip: React.FC<{ state: TooltipState | null }> = ({ state }) => {
  if (!state) return null;
  return (
    <Box
      className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full"
      style={{ left: `${state.x}%`, top: `${state.y}%` }}
    >
      <Box className="mb-2 px-2.5 py-1.5 rounded-control bg-surface border border-line-strong shadow-[var(--shadow-md)] whitespace-nowrap">
        <Text className="text-micro uppercase text-ink-3">{state.title}</Text>
        <Text className="text-body font-medium text-ink figure mt-0.5">{state.value}</Text>
        {state.meta && <Text className="text-label text-ink-3 mt-0.5">{state.meta}</Text>}
      </Box>
    </Box>
  );
};

/** Round an axis maximum up to a clean tick value. */
const niceMax = (max: number): number => {
  if (max <= 0) return 1;
  if (max <= 5) return Math.ceil(max);
  const magnitude = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / (magnitude / 2)) * (magnitude / 2);
};

/* ── Column chart — a count over time ─────────────────────────────────── */

interface ColumnChartProps {
  data: Datum[];
  /** Formats the tooltip / axis value. */
  format?: (v: number) => string;
  /** Tick label renderer for the x axis; return null to skip a tick. */
  xTick?: (d: Datum, i: number, total: number) => string | null;
  height?: number;
  caption: string;
  unit?: string;
}

export const ColumnChart: React.FC<ColumnChartProps> = ({
  data,
  format = (v) => v.toLocaleString('en-IN'),
  xTick,
  height = 180,
  caption,
  unit,
}) => {
  const [hover, setHover] = useState<number | null>(null);
  const max = useMemo(() => niceMax(Math.max(...data.map((d) => d.value), 0)), [data]);
  const ticks = useMemo(() => [0, max / 2, max], [max]);

  if (!data.length) return null;

  return (
    <Figure className="m-0">
      <Box className="flex gap-3">
        {/* Y axis ticks — carry the values not directly labelled */}
        <Box
          className="flex flex-col justify-between text-micro text-ink-3 tabular shrink-0"
          style={{ height }}
        >
          {[...ticks].reverse().map((t) => (
            <Inline key={t}>{format(t)}</Inline>
          ))}
        </Box>

        <Box className="flex-1 min-w-0">
          {/* Plot area — gridlines, columns and the tooltip share this box so the
              tooltip lands exactly on the column cap. */}
          <Box className="relative" style={{ height }} onMouseLeave={() => setHover(null)}>
            <Box className="absolute inset-0 flex flex-col justify-between pointer-events-none">
              {ticks.map((t) => (
                <Box key={t} className="h-px w-full" style={{ background: 'var(--chart-grid)' }} />
              ))}
            </Box>

            <Box className="relative h-full flex items-end justify-between gap-px">
              {data.map((d, i) => {
                const pct = max > 0 ? (d.value / max) * 100 : 0;
                const active = hover === i;
                return (
                  <Box
                    key={`${d.label}-${i}`}
                    className="relative flex-1 h-full flex items-end justify-center cursor-default"
                    onMouseEnter={() => setHover(i)}
                  >
                    {d.value > 0 ? (
                      <Box
                        // 62% of the band, capped at 24px — the leftover is air.
                        className="rounded-t-[4px] transition-opacity duration-120"
                        style={{
                          width: '62%',
                          maxWidth: 24,
                          minWidth: 3,
                          height: `${Math.max(pct, 2)}%`,
                          background: d.color || 'var(--chart-series)',
                          opacity: hover === null || active ? 1 : 0.45,
                        }}
                      />
                    ) : (
                      // Empty days keep a faint footprint so gaps read as data
                      <Box
                        style={{
                          width: '62%',
                          maxWidth: 24,
                          minWidth: 3,
                          height: 2,
                          background: 'var(--chart-grid)',
                        }}
                      />
                    )}
                  </Box>
                );
              })}
            </Box>

            <Tooltip
              state={
                hover !== null
                  ? {
                      x: ((hover + 0.5) / data.length) * 100,
                      y: 100 - (max > 0 ? (data[hover].value / max) * 100 : 0),
                      title: data[hover].label,
                      value: format(data[hover].value),
                      meta: data[hover].meta,
                    }
                  : null
              }
            />
          </Box>

          {/* Baseline */}
          <Box className="h-px w-full" style={{ background: 'var(--chart-axis)' }} />

          {/* X ticks — sparse by design, positioned rather than laid out, so a
              label is never squeezed into one column's width and clipped. */}
          {xTick && (
            <Box className="relative h-4 mt-1.5">
              {data.map((d, i) => {
                const label = xTick(d, i, data.length);
                if (!label) return null;
                const isFirst = i === 0;
                const isLast = i === data.length - 1;
                return (
                  <Inline
                    key={`${d.label}-tick-${i}`}
                    className="absolute top-0 text-micro text-ink-3 tabular whitespace-nowrap"
                    style={{
                      left: `${((i + 0.5) / data.length) * 100}%`,
                      transform: isFirst
                        ? 'translateX(0)'
                        : isLast
                          ? 'translateX(-100%)'
                          : 'translateX(-50%)',
                    }}
                  >
                    {label}
                  </Inline>
                );
              })}
            </Box>
          )}
        </Box>
      </Box>
      <DataTable caption={caption} data={data} unit={unit} />
    </Figure>
  );
};

/* ── Ranked bars — magnitude by category ──────────────────────────────── */
