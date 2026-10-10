/**
 * Lampose Admin — a row of filter chips, each carrying its own count.
 *
 * "Pending 4 · Approved 31 · Rejected 2 · All 37". The count on a chip is how
 * many records that chip would show, so a reviewer can see where the work is
 * without clicking through every status. A count that is not known yet
 * (still loading, or the server does not report it) is simply left off —
 * never shown as 0, because 0 is a claim.
 */
import { cx } from '../../utils/cx';
import { Box } from '../../atoms/Box';
import { Inline } from '../../atoms/Inline';
import { PlainButton } from '../../atoms/PlainButton';
import type { BadgeTone } from '../../atoms/Badge';

export interface FilterChipOption<T extends string = string> {
  id: T;
  label: string;
  count?: number | null;
  /** Colours the count pill, so "Rejected 3" reads as red at a glance. */
  tone?: BadgeTone;
}

interface FilterChipsProps<T extends string> {
  options: ReadonlyArray<FilterChipOption<T>>;
  value: T;
  onChange: (id: T) => void;
  /** Read out to screen readers: "Status", "Who cancelled". */
  label?: string;
  className?: string;
}

const COUNT_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-neutral-soft text-ink-2',
  brand: 'bg-brand-soft text-brand-ink',
  good: 'bg-good-soft text-good',
  warn: 'bg-warn-soft text-warn',
  crit: 'bg-crit-soft text-crit',
};

export const FilterChips = <T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: FilterChipsProps<T>) => (
  <Box role="group" aria-label={label} className={cx('flex flex-wrap items-center gap-1.5', className)}>
    {options.map((o) => {
      const active = o.id === value;
      return (
        <PlainButton
          key={o.id}
          aria-pressed={active}
          onClick={() => onChange(o.id)}
          className={cx(
            'inline-flex items-center gap-1.5 h-8 px-3 rounded-control border text-body transition-colors duration-120 whitespace-nowrap',
            active
              ? 'bg-brand-soft text-brand-ink border-brand-border font-medium'
              : 'bg-surface text-ink-2 border-line hover:bg-surface-inset hover:text-ink'
          )}
        >
          {o.label}
          {o.count != null && (
            <Inline
              className={cx(
                'min-w-5 px-1.5 rounded-full text-label tabular text-center',
                active ? 'bg-brand text-white' : COUNT_TONES[o.tone ?? 'neutral']
              )}
            >
              {o.count.toLocaleString('en-IN')}
            </Inline>
          )}
        </PlainButton>
      );
    })}
  </Box>
);
