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
import { Inline } from '../Inline';

export type BadgeTone = 'neutral' | 'brand' | 'good' | 'warn' | 'crit';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-neutral-soft text-ink-2 border-neutral-border',
  brand: 'bg-brand-soft text-brand-ink border-brand-border',
  good: 'bg-good-soft text-good border-good-border',
  warn: 'bg-warn-soft text-warn border-warn-border',
  crit: 'bg-crit-soft text-crit border-crit-border',
};

interface BadgeProps {
  tone?: BadgeTone;
  icon?: React.ElementType;
  children: React.ReactNode;
  className?: string;
}

/** Status is always colour + icon + label — never colour alone. */
export const Badge: React.FC<BadgeProps> = ({ tone = 'neutral', icon: Icon, children, className }) => (
  <Inline
    className={cx(
      'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-control border text-label whitespace-nowrap',
      BADGE_TONES[tone],
      className
    )}
  >
    {Icon && <Icon className="size-3 shrink-0" strokeWidth={2} />}
    {children}
  </Inline>
);

/* ── Form controls ────────────────────────────────────────────────────── */
