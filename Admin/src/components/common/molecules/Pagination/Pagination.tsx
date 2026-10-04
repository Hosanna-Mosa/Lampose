/**
 * Lampose Admin — page controls for a list held in the browser.
 *
 * "Showing 21–40 of 57", a rows-per-page picker, and previous / numbered /
 * next buttons. Long runs of pages collapse to 1 … 4 5 6 … 12 so the bar
 * stays one line on a phone.
 */
import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cx } from '../../utils/cx';
import { Box } from '../../atoms/Box';
import { Inline } from '../../atoms/Inline';
import { Option } from '../../atoms/Option';
import { PlainButton } from '../../atoms/PlainButton';
import { Select } from '../../atoms/Select';
import { Text } from '../../atoms/Text';

interface PaginationProps {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  onPageSize?: (size: number) => void;
  pageSizes?: readonly number[];
  /** What is being counted: "dishes", "items". */
  noun?: string;
  className?: string;
}

/** 1 … 4 5 6 … 12 — the current page, its neighbours, and both ends. */
const pagesToShow = (page: number, count: number): (number | 'gap')[] => {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const wanted = new Set([1, count, page - 1, page, page + 1]);
  const list = [...wanted].filter((n) => n >= 1 && n <= count).sort((a, b) => a - b);
  const out: (number | 'gap')[] = [];
  list.forEach((n, i) => {
    if (i > 0 && n - list[i - 1] > 1) out.push('gap');
    out.push(n);
  });
  return out;
};

const pageButton =
  'inline-flex items-center justify-center min-w-8 h-8 px-2 rounded-control border text-label tabular transition-colors duration-120 disabled:opacity-40 disabled:cursor-not-allowed';

export const Pagination: React.FC<PaginationProps> = ({
  page,
  pageCount,
  pageSize,
  total,
  onPage,
  onPageSize,
  pageSizes = [10, 20, 50, 100],
  noun = 'items',
  className,
}) => {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <Box className={cx('flex flex-wrap items-center justify-between gap-3', className)}>
      <Box className="flex items-center gap-3">
        <Text className="text-label text-ink-3 tabular">
          Showing {from}–{to} of {total} {noun}
        </Text>
        {onPageSize && (
          <Box className="flex items-center gap-1.5">
            <Select
              aria-label="Rows per page"
              className="h-8 py-0 text-label w-auto"
              value={pageSize}
              onChange={(e) => onPageSize(Number(e.target.value))}
            >
              {pageSizes.map((size) => (
                <Option key={size} value={size}>
                  {size} / page
                </Option>
              ))}
            </Select>
          </Box>
        )}
      </Box>

      {pageCount > 1 && (
        <Box className="flex items-center gap-1" role="navigation" aria-label="Pages">
          <PlainButton
            className={cx(pageButton, 'bg-surface border-line text-ink-2 hover:bg-surface-inset')}
            onClick={() => onPage(page - 1)}
            disabled={page <= 1}
            aria-label="Previous page"
          >
            <ChevronLeft className="size-4" />
          </PlainButton>
          {pagesToShow(page, pageCount).map((n, i) =>
            n === 'gap' ? (
              <Inline key={`gap-${i}`} className="px-1 text-ink-3">
                …
              </Inline>
            ) : (
              <PlainButton
                key={n}
                className={cx(
                  pageButton,
                  n === page
                    ? 'bg-brand-soft border-brand-border text-brand-ink font-medium'
                    : 'bg-surface border-line text-ink-2 hover:bg-surface-inset'
                )}
                onClick={() => onPage(n)}
                aria-current={n === page ? 'page' : undefined}
              >
                {n}
              </PlainButton>
            )
          )}
          <PlainButton
            className={cx(pageButton, 'bg-surface border-line text-ink-2 hover:bg-surface-inset')}
            onClick={() => onPage(page + 1)}
            disabled={page >= pageCount}
            aria-label="Next page"
          >
            <ChevronRight className="size-4" />
          </PlainButton>
        </Box>
      )}
    </Box>
  );
};
