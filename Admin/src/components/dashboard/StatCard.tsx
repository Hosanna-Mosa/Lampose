import React from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { cx, Skeleton } from '../ui';
import { Sparkline } from '../charts';

interface StatCardProps {
  label: string;
  value: string;
  /** Signed percentage vs the comparison period; null hides the delta. */
  delta?: number | null;
  deltaLabel?: string;
  /** Whether a rising number is good — drives the delta colour. */
  upIsGood?: boolean;
  footnote?: string;
  trend?: number[];
  icon?: React.ElementType;
  loading?: boolean;
}

/**
 * Stat tile: label · value · optional delta vs a named period · optional trend.
 * The value uses proportional figures (`.figure`); only columns get tabular.
 */
export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  delta = null,
  deltaLabel,
  upIsGood = true,
  footnote,
  trend,
  icon: Icon,
  loading,
}) => {
  if (loading) {
    return (
      <div className="card p-4">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-7 w-20 mt-3" />
        <Skeleton className="h-3 w-28 mt-3" />
      </div>
    );
  }

  const flat = delta !== null && Math.abs(delta) < 0.05;
  const positive = delta !== null && delta > 0;
  const DeltaIcon = flat ? Minus : positive ? ArrowUpRight : ArrowDownRight;
  const deltaGood = flat ? null : positive === upIsGood;

  return (
    <div className="card p-4 flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <p className="text-label text-ink-2">{label}</p>
        {Icon && <Icon className="size-4 text-ink-3 shrink-0" strokeWidth={1.75} />}
      </div>

      <p className="text-metric text-ink figure mt-2.5">{value}</p>

      <div className="flex items-center gap-2 mt-2 min-h-5">
        {delta !== null && (
          <span
            className={cx(
              'inline-flex items-center gap-0.5 text-label tabular',
              deltaGood === null ? 'text-ink-3' : deltaGood ? 'text-good' : 'text-crit'
            )}
          >
            <DeltaIcon className="size-3" strokeWidth={2.25} />
            {flat ? '0%' : `${Math.abs(delta).toFixed(Math.abs(delta) >= 10 ? 0 : 1)}%`}
          </span>
        )}
        {(deltaLabel || footnote) && (
          <span className="text-label text-ink-3 truncate">{deltaLabel || footnote}</span>
        )}
      </div>

      {trend && trend.length > 1 && (
        <div className="mt-3 -mb-1">
          <Sparkline values={trend} height={28} />
        </div>
      )}
    </div>
  );
};
