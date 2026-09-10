/**
 * Lampose Admin — UI primitives.
 *
 * Every surface in the panel is composed from these. Sizes, weights, radii and
 * colours come from the token layer in `index.css`; nothing here hardcodes a
 * hex value or an arbitrary font size, which is what keeps typography and
 * spacing consistent across pages.
 */
import React from 'react';
import { Skeleton } from '../../atoms/Skeleton';
import { cx } from '../../utils/cx';
import { PlainTd, PlainTr } from '../../atoms/PlainTable';

export const TableSkeleton: React.FC<{ rows?: number; cols: number }> = ({ rows = 5, cols }) => (
  <>
    {Array.from({ length: rows }).map((_, r) => (
      <PlainTr key={r} className="border-b border-line last:border-0">
        {Array.from({ length: cols }).map((__, c) => (
          <PlainTd key={c} className="px-4 py-3.5 first:pl-5 last:pr-5">
            <Skeleton className={cx('h-3.5', c === 0 ? 'w-40' : 'w-20')} />
          </PlainTd>
        ))}
      </PlainTr>
    ))}
  </>
);
