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
import React, { useId, useMemo, useState } from 'react';
import { cx } from '../ui';

/* ── Shared bits ──────────────────────────────────────────────────────── */

export interface Datum {
  label: string;
  value: number;
  /** Optional CSS colour var override, e.g. `var(--chart-critical)`. */
  color?: string;
  /** Extra line shown in the tooltip. */
  meta?: string;
}

/** Off-screen table so the values are never gated behind hover or colour. */
const DataTable: React.FC<{ caption: string; data: Datum[]; unit?: string }> = ({
  caption,
  data,
  unit = '',
}) => (
  <table className="sr-only">
    <caption>{caption}</caption>
    <tbody>
      {data.map((d) => (
        <tr key={d.label}>
          <th scope="row">{d.label}</th>
          <td>
            {d.value.toLocaleString('en-IN')}
            {unit}
          </td>
        </tr>
      ))}
    </tbody>
  </table>
);

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
    <div
      className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full"
      style={{ left: `${state.x}%`, top: `${state.y}%` }}
    >
      <div className="mb-2 px-2.5 py-1.5 rounded-control bg-surface border border-line-strong shadow-[var(--shadow-md)] whitespace-nowrap">
        <p className="text-micro uppercase text-ink-3">{state.title}</p>
        <p className="text-body font-medium text-ink figure mt-0.5">{state.value}</p>
        {state.meta && <p className="text-label text-ink-3 mt-0.5">{state.meta}</p>}
      </div>
    </div>
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
    <figure className="m-0">
      <div className="flex gap-3">
        {/* Y axis ticks — carry the values not directly labelled */}
        <div
          className="flex flex-col justify-between text-micro text-ink-3 tabular shrink-0"
          style={{ height }}
        >
          {[...ticks].reverse().map((t) => (
            <span key={t}>{format(t)}</span>
          ))}
        </div>

        <div className="flex-1 min-w-0">
          {/* Plot area — gridlines, columns and the tooltip share this box so the
              tooltip lands exactly on the column cap. */}
          <div className="relative" style={{ height }} onMouseLeave={() => setHover(null)}>
            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
              {ticks.map((t) => (
                <div key={t} className="h-px w-full" style={{ background: 'var(--chart-grid)' }} />
              ))}
            </div>

            <div className="relative h-full flex items-end justify-between gap-px">
              {data.map((d, i) => {
                const pct = max > 0 ? (d.value / max) * 100 : 0;
                const active = hover === i;
                return (
                  <div
                    key={`${d.label}-${i}`}
                    className="relative flex-1 h-full flex items-end justify-center cursor-default"
                    onMouseEnter={() => setHover(i)}
                  >
                    {d.value > 0 ? (
                      <div
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
                      <div
                        style={{
                          width: '62%',
                          maxWidth: 24,
                          minWidth: 3,
                          height: 2,
                          background: 'var(--chart-grid)',
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>

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
          </div>

          {/* Baseline */}
          <div className="h-px w-full" style={{ background: 'var(--chart-axis)' }} />

          {/* X ticks — sparse by design, positioned rather than laid out, so a
              label is never squeezed into one column's width and clipped. */}
          {xTick && (
            <div className="relative h-4 mt-1.5">
              {data.map((d, i) => {
                const label = xTick(d, i, data.length);
                if (!label) return null;
                const isFirst = i === 0;
                const isLast = i === data.length - 1;
                return (
                  <span
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
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <DataTable caption={caption} data={data} unit={unit} />
    </figure>
  );
};

/* ── Ranked bars — magnitude by category ──────────────────────────────── */

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
    <figure className="m-0 space-y-3">
      {data.map((d) => {
        const share = total > 0 ? (d.value / total) * 100 : 0;
        return (
          <div key={d.label} className="group">
            <div className="flex items-baseline justify-between gap-3 mb-1.5">
              <span className="text-sm text-ink truncate">{d.label}</span>
              <span className="text-sm text-ink-2 tabular shrink-0">
                {format(d.value)}
                {secondary && (
                  <span className="text-ink-3 ml-1.5">{secondary(d, share)}</span>
                )}
              </span>
            </div>
            {/* Track is a lighter step of the same ramp, so state reads across the bar */}
            <div className="h-1.5 w-full rounded-pill overflow-hidden" style={{ background: 'var(--chart-series-wash)' }}>
              <div
                className="h-full rounded-pill transition-[width] duration-300"
                style={{
                  width: `${max > 0 ? Math.max((d.value / max) * 100, d.value > 0 ? 3 : 0) : 0}%`,
                  background: d.color || 'var(--chart-series)',
                }}
              />
            </div>
          </div>
        );
      })}
      <DataTable caption={caption} data={data} unit={unit} />
    </figure>
  );
};

/* ── Sparkline — the shape of a trend inside a stat tile ──────────────── */

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
    <figure className="m-0 flex items-center gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
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
        <div className="absolute inset-0 grid place-content-center text-center">
          <span className="text-metric text-ink figure block">{centerValue}</span>
          <span className="text-micro uppercase text-ink-3">{centerLabel}</span>
        </div>
      </div>

      {/* Legend — always present for ≥2 series; identity never colour-alone */}
      <ul className="flex-1 min-w-0 space-y-2 m-0 p-0 list-none">
        {data.map((d, i) => (
          <li
            key={d.label}
            className="flex items-center gap-2 cursor-default"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <span
              className="size-2 rounded-[2px] shrink-0"
              style={{ background: d.color || 'var(--chart-series)' }}
            />
            <span className="text-sm text-ink-2 truncate flex-1">{d.label}</span>
            <span className="text-sm text-ink tabular shrink-0">{d.value.toLocaleString('en-IN')}</span>
            <span className="text-label text-ink-3 tabular w-11 text-right shrink-0">
              {total > 0 ? `${Math.round((d.value / total) * 100)}%` : '0%'}
            </span>
          </li>
        ))}
      </ul>
      <DataTable caption={caption} data={data} />
    </figure>
  );
};
