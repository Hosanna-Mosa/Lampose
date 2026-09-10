/**
 * Lampose Admin — UI primitives.
 *
 * Every surface in the panel is composed from these. Sizes, weights, radii and
 * colours come from the token layer in `index.css`; nothing here hardcodes a
 * hex value or an arbitrary font size, which is what keeps typography and
 * spacing consistent across pages.
 */
import React from 'react';
import { Loader2 } from 'lucide-react';
import { cx } from '../../utils/cx';
import { PlainButton } from '../PlainButton';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ElementType;
  loading?: boolean;
}

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-brand text-white hover:bg-brand-hover border border-transparent shadow-[var(--shadow-sm)]',
  secondary:
    'bg-surface text-ink border border-line hover:bg-surface-inset hover:border-line-strong',
  ghost: 'bg-transparent text-ink-2 border border-transparent hover:bg-surface-inset hover:text-ink',
  danger: 'bg-crit-soft text-crit border border-crit-border hover:brightness-97',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-2.5 gap-1.5 text-label',
  md: 'h-9 px-3.5 gap-2 text-body font-medium',
};

export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  loading,
  className,
  children,
  disabled,
  ...rest
}) => (
  <PlainButton
    className={cx(
      'inline-flex items-center justify-center rounded-control transition-colors duration-120 whitespace-nowrap',
      'disabled:opacity-50 disabled:pointer-events-none',
      BUTTON_VARIANTS[variant],
      BUTTON_SIZES[size],
      className
    )}
    disabled={disabled || loading}
    {...rest}
  >
    {loading ? (
      <Loader2 className="size-4 animate-spin shrink-0" strokeWidth={2} />
    ) : (
      Icon && <Icon className="size-4 shrink-0" strokeWidth={1.75} />
    )}
    {children}
  </PlainButton>
);
