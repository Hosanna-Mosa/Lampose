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
import { Box } from '../../atoms/Box';
import { PlainInput } from '../../atoms/PlainInput';

interface SearchInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ElementType;
}

export const SearchInput: React.FC<SearchInputProps> = ({ icon: Icon, className, ...rest }) => (
  <Box className={cx('relative', className)}>
    {Icon && (
      <Icon
        className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none"
        strokeWidth={1.75}
      />
    )}
    <PlainInput className={cx('field', Icon && 'pl-9')} {...rest} />
  </Box>
);

/* ── Table ────────────────────────────────────────────────────────────── */
