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
import { List } from '../../atoms/List';
import { ListItem } from '../../atoms/ListItem';

interface DonutProps {
  data: Datum[];
  size?: number;
  /** Big number in the middle. */
  centerValue: string;
  centerLabel: string;
  caption: string;
}

export const Donut: React.FC<DonutProps> = ({
  data,
  size = 148,
  centerValue,
  centerLabel,
  caption,
}) => {
  const [hover, setHover] = useState<number | null>(null);
  const total = useMemo(() => data.reduce((s, d) => s + d.value, 0), [data]);

  const radius = size / 2 - 9;
  const circumference = 2 * Math.PI * radius;
  // 2px surface gap between adjacent segments, expressed in path units.
  const gap = total > 0 ? 2 : 0;

  let offset = 0;
  const segments = data.map((d, i) => {
    const fraction = total > 0 ? d.value / total : 0;
    const length = Math.max(fraction * circumference - gap, 0);
    const seg = { d, i, length, offset, color: d.color || 'var(--chart-series)' };
    offset += fraction * circumference;
    return seg;
  });

  return (
    <Figure className="m-0 flex items-center gap-5">
      <Box className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" aria-hidden="true" focusable="false">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--chart-grid)"
            strokeWidth="10"
          />
          {segments.map((s) => (
            <circle
              key={s.d.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={s.color}
              strokeWidth={hover === s.i ? 12 : 10}
              strokeDasharray={`${s.length} ${circumference - s.length}`}
              strokeDashoffset={-s.offset}
              strokeLinecap="butt"
              className="transition-all duration-120 cursor-default"
              style={{ opacity: hover === null || hover === s.i ? 1 : 0.4 }}
              onMouseEnter={() => setHover(s.i)}
              onMouseLeave={() => setHover(null)}
            />
          ))}
        </svg>
        <Box className="absolute inset-0 grid place-content-center text-center">
          <Inline className="text-metric text-ink figure block">{centerValue}</Inline>
          <Inline className="text-micro uppercase text-ink-3">{centerLabel}</Inline>
        </Box>
      </Box>

      {/* Legend — always present for ≥2 series; identity never colour-alone */}
      <List className="flex-1 min-w-0 space-y-2 m-0 p-0 list-none">
        {data.map((d, i) => (
          <ListItem
            key={d.label}
            className="flex items-center gap-2 cursor-default"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <Inline
              className="size-2 rounded-[2px] shrink-0"
              style={{ background: d.color || 'var(--chart-series)' }}
            />
            <Inline className="text-sm text-ink-2 truncate flex-1">{d.label}</Inline>
            <Inline className="text-sm text-ink tabular shrink-0">{d.value.toLocaleString('en-IN')}</Inline>
            <Inline className="text-label text-ink-3 tabular w-11 text-right shrink-0">
              {total > 0 ? `${Math.round((d.value / total) * 100)}%` : '0%'}
            </Inline>
          </ListItem>
        ))}
      </List>
      <DataTable caption={caption} data={data} />
    </Figure>
  );
};
