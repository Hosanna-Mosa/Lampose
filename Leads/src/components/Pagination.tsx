import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  pages: number;
  total: number;
  /** How many rows this page is showing, for the "1–25 of 226" line. */
  count: number;
  limit: number;
  onPageChange: (page: number) => void;
  onLimitChange?: (limit: number) => void;
  /** "leads", "properties" — what is being counted, in words. */
  noun?: string;
}

const PAGE_SIZES = [25, 50, 100, 200];

/**
 * The pager under a long list.
 *
 * It always states the range and the total — "26–50 of 226" — because the
 * page number alone does not tell anyone whether they have seen everything,
 * and this list is a work queue: a rep who cannot tell that 200 leads sit
 * below the fold works the first twenty and stops.
 *
 * The window of page buttons is capped at five with the current page in the
 * middle. Rendering 40 numbered buttons for a 1000-lead table is a scrollbar
 * inside a scrollbar.
 */
export const Pagination: React.FC<PaginationProps> = ({
  page,
  pages,
  total,
  count,
  limit,
  onPageChange,
  onLimitChange,
  noun = 'leads',
}) => {
  // Nothing to page through, and no page-size choice worth offering.
  if (total === 0) return null;

  const first = total === 0 ? 0 : (page - 1) * limit + 1;
  const last = (page - 1) * limit + count;

  const windowStart = Math.max(1, Math.min(page - 2, pages - 4));
  const numbers: number[] = [];
  for (let n = windowStart; n <= Math.min(pages, windowStart + 4); n += 1) numbers.push(n);

  const stepClass = (disabled: boolean) =>
    `flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold transition ${
      disabled
        ? 'bg-slate-50 text-slate-300 cursor-not-allowed'
        : 'bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer'
    }`;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-1 pt-4">
      <div className="flex items-center gap-3">
        <span className="text-xs text-slate-500 font-semibold">
          Showing <strong className="text-slate-900">{first}–{last}</strong> of{' '}
          <strong className="text-slate-900">{total}</strong> {noun}
        </span>

        {onLimitChange && (
          <select
            value={limit}
            onChange={(e) => onLimitChange(Number(e.target.value))}
            className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-2xs text-slate-600 font-semibold focus:outline-none focus:border-cyan-500 cursor-pointer"
            aria-label="Rows per page"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>{size} / page</option>
            ))}
          </select>
        )}
      </div>

      {pages > 1 && (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className={stepClass(page <= 1)}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Prev</span>
          </button>

          {windowStart > 1 && <span className="px-1 text-2xs text-slate-400">…</span>}

          {numbers.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onPageChange(n)}
              aria-current={n === page ? 'page' : undefined}
              className={`min-w-[34px] px-2.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                n === page
                  ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/25'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              }`}
            >
              {n}
            </button>
          ))}

          {windowStart + 4 < pages && <span className="px-1 text-2xs text-slate-400">…</span>}

          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= pages}
            className={stepClass(page >= pages)}
          >
            <span>Next</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
