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
import { Inline } from '../../atoms/Inline';
import { Label } from '../../atoms/Label';

interface FieldProps {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

export const Field: React.FC<FieldProps> = ({ label, hint, required, children, className }) => (
  <Label className={cx('block', className)}>
    <Inline className="block text-label text-ink-2 mb-1.5">
      {label}
      {required && <Inline className="text-crit ml-0.5">*</Inline>}
    </Inline>
    {children}
    {hint && <Inline className="block text-label text-ink-3 mt-1.5">{hint}</Inline>}
  </Label>
);
