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

export const Card: React.FC<React.HTMLAttributes<HTMLDivElement> & { padded?: boolean }> = ({
  className,
  padded = true,
  children,
  ...rest
}) => (
  <Box className={cx('card', padded && 'p-5', className)} {...rest}>
    {children}
  </Box>
);
