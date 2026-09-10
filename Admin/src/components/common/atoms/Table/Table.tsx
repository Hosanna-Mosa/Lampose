/**
 * Lampose Admin — UI primitives.
 *
 * Every surface in the panel is composed from these. Sizes, weights, radii and
 * colours come from the token layer in `index.css`; nothing here hardcodes a
 * hex value or an arbitrary font size, which is what keeps typography and
 * spacing consistent across pages.
 */
import React from 'react';
import { cx } from '../../utils/cx';
import { Box } from '../Box';
import { PlainTable, PlainTd, PlainTh, PlainTr } from '../PlainTable';

export const Table: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => (
  <Box className={cx('overflow-x-auto', className)}>
    <PlainTable className="w-full text-left border-collapse">{children}</PlainTable>
  </Box>
);

export const Th: React.FC<React.ThHTMLAttributes<HTMLTableCellElement>> = ({
  className,
  children,
  ...rest
}) => (
  <PlainTh
    className={cx(
      'text-micro uppercase text-ink-3 font-semibold px-4 py-2.5 bg-surface-subtle',
      'border-b border-line first:pl-5 last:pr-5',
      className
    )}
    {...rest}
  >
    {children}
  </PlainTh>
);

export const Td: React.FC<React.TdHTMLAttributes<HTMLTableCellElement>> = ({
  className,
  children,
  ...rest
}) => (
  <PlainTd className={cx('px-4 py-3 text-sm text-ink-2 align-middle first:pl-5 last:pr-5', className)} {...rest}>
    {children}
  </PlainTd>
);

export const Tr: React.FC<React.HTMLAttributes<HTMLTableRowElement>> = ({
  className,
  children,
  ...rest
}) => (
  <PlainTr
    className={cx('border-b border-line last:border-0 hover:bg-surface-subtle transition-colors', className)}
    {...rest}
  >
    {children}
  </PlainTr>
);

/* ── States ───────────────────────────────────────────────────────────── */
