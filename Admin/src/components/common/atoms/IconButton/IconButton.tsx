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
import { PlainButton } from '../PlainButton';

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ElementType;
  label: string;
  tone?: 'default' | 'danger';
  spinning?: boolean;
}

export const IconButton: React.FC<IconButtonProps> = ({
  icon: Icon,
  label,
  tone = 'default',
  spinning,
  className,
  ...rest
}) => (
  <PlainButton
    type="button"
    title={label}
    aria-label={label}
    className={cx(
      'grid place-items-center size-8 rounded-control transition-colors duration-120',
      tone === 'danger'
        ? 'text-ink-3 hover:text-crit hover:bg-crit-soft'
        : 'text-ink-3 hover:text-ink hover:bg-surface-inset',
      className
    )}
    {...rest}
  >
    <Icon className={cx('size-4', spinning && 'animate-spin')} strokeWidth={1.75} />
  </PlainButton>
);

/* ── Badge ────────────────────────────────────────────────────────────── */
