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
import { Inline } from '../Inline';
import { PlainButton } from '../PlainButton';

interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Names what the switch controls — required, since the track carries no text. */
  label: string;
  disabled?: boolean;
  busy?: boolean;
  tone?: 'brand' | 'good';
  className?: string;
}

/**
 * A two-state toggle for a decision that takes effect on flip. The knob shifts
 * and the track changes colour together, so state never rests on colour alone.
 */
export const Switch: React.FC<SwitchProps> = ({
  checked,
  onChange,
  label,
  disabled,
  busy,
  tone = 'good',
  className,
}) => (
  <PlainButton
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    title={label}
    disabled={disabled || busy}
    onClick={() => onChange(!checked)}
    className={cx(
      'relative inline-flex items-center h-5 w-9 rounded-full shrink-0 transition-colors duration-120',
      'disabled:opacity-50 disabled:cursor-not-allowed',
      checked ? (tone === 'good' ? 'bg-good' : 'bg-brand') : 'bg-line-strong',
      className
    )}
  >
    <Inline
      className={cx(
        'grid place-items-center size-4 rounded-full bg-white shadow-[var(--shadow-sm)] transition-transform duration-120',
        checked ? 'translate-x-[18px]' : 'translate-x-0.5'
      )}
    >
      {busy && <Loader2 className="size-2.5 animate-spin text-ink-3" strokeWidth={2.5} />}
    </Inline>
  </PlainButton>
);
