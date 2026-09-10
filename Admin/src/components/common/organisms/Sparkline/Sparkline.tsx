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
import React, { useId, useMemo } from 'react';
import { cx } from '../../utils/cx';

interface SparklineProps {
  values: number[];
  className?: string;
  height?: number;
}

export const Sparkline: React.FC<SparklineProps> = ({ values, className, height = 32 }) => {
  const gradientId = useId();

  const { line, area, lastPoint } = useMemo(() => {
    if (values.length < 2) return { line: '', area: '', lastPoint: null as null | [number, number] };
    const max = Math.max(...values, 1);
    const w = 100;
    const h = height;
    const pts = values.map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      // Inset by 3px top and bottom so the 2px stroke and end-dot never clip.
      const y = h - 3 - (v / max) * (h - 6);
      return [x, y] as [number, number];
    });
    return {
      line: pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' '),
      area: `${pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ')} L100,${h} L0,${h} Z`,
      lastPoint: pts[pts.length - 1],
    };
  }, [values, height]);

  if (!line) return null;

  return (
    <svg
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      className={cx('w-full block', className)}
      style={{ height }}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--chart-series)" stopOpacity="0.16" />
          <stop offset="100%" stopColor="var(--chart-series)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke="var(--chart-series)"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      {lastPoint && (
        <circle
          cx={lastPoint[0]}
          cy={lastPoint[1]}
          r="2.5"
          fill="var(--chart-series)"
          stroke="var(--surface)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
};

/* ── Donut — composition of a whole ───────────────────────────────────── */
