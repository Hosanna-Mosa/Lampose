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
import { PlainInput } from '../PlainInput';

export const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({
  className,
  ...rest
}) => <PlainInput className={cx('field', className)} {...rest} />;
