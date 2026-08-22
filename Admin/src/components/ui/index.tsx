/**
 * Lampose Admin — UI primitives.
 *
 * Every surface in the panel is composed from these. Sizes, weights, radii and
 * colours come from the token layer in `index.css`; nothing here hardcodes a
 * hex value or an arbitrary font size, which is what keeps typography and
 * spacing consistent across pages.
 */
import React, { useEffect, useRef } from 'react';
import { AlertCircle, CheckCircle2, Info, Loader2, TriangleAlert, X } from 'lucide-react';

export const cx = (...parts: Array<string | false | null | undefined>): string =>
  parts.filter(Boolean).join(' ');

/* ── Card ─────────────────────────────────────────────────────────────── */

export const Card: React.FC<React.HTMLAttributes<HTMLDivElement> & { padded?: boolean }> = ({
  className,
  padded = true,
  children,
  ...rest
}) => (
  <div className={cx('card', padded && 'p-5', className)} {...rest}>
    {children}
  </div>
);

interface CardHeaderProps {
  title: string;
  description?: string;
  icon?: React.ElementType;
  action?: React.ReactNode;
  className?: string;
}

export const CardHeader: React.FC<CardHeaderProps> = ({
  title,
  description,
  icon: Icon,
  action,
  className,
}) => (
  <div className={cx('flex items-start justify-between gap-4', className)}>
    <div className="flex items-start gap-2.5 min-w-0">
      {Icon && (
        <span className="mt-0.5 grid place-items-center size-7 rounded-control bg-surface-inset text-ink-2 shrink-0">
          <Icon className="size-4" strokeWidth={1.75} />
        </span>
      )}
      <div className="min-w-0">
        <h2 className="text-section text-ink truncate">{title}</h2>
        {description && <p className="text-sm text-ink-3 mt-0.5">{description}</p>}
      </div>
    </div>
    {action && <div className="shrink-0 flex items-center gap-2">{action}</div>}
  </div>
);

/* ── Page header ──────────────────────────────────────────────────────── */

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  eyebrow,
  title,
  description,
  actions,
}) => (
  <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
    <div className="min-w-0">
      {eyebrow && <p className="text-micro uppercase text-ink-3 mb-1.5">{eyebrow}</p>}
      <h1 className="text-title text-ink">{title}</h1>
      {description && <p className="text-body text-ink-2 mt-1 max-w-2xl">{description}</p>}
    </div>
    {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
  </header>
);

/* ── Button ───────────────────────────────────────────────────────────── */

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
  <button
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
  </button>
);

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
  <button
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
  </button>
);

/* ── Badge ────────────────────────────────────────────────────────────── */

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
  <span
    className={cx(
      'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-control border text-label whitespace-nowrap',
      BADGE_TONES[tone],
      className
    )}
  >
    {Icon && <Icon className="size-3 shrink-0" strokeWidth={2} />}
    {children}
  </span>
);

/* ── Form controls ────────────────────────────────────────────────────── */

interface FieldProps {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

export const Field: React.FC<FieldProps> = ({ label, hint, required, children, className }) => (
  <label className={cx('block', className)}>
    <span className="block text-label text-ink-2 mb-1.5">
      {label}
      {required && <span className="text-crit ml-0.5">*</span>}
    </span>
    {children}
    {hint && <span className="block text-label text-ink-3 mt-1.5">{hint}</span>}
  </label>
);

export const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({
  className,
  ...rest
}) => <input className={cx('field', className)} {...rest} />;

/**
 * Spread onto credential inputs that must open empty.
 *
 * Chrome ignores `autocomplete="off"` on fields it reads as a username or
 * password and fills them from the saved-password store on load. It does skip
 * read-only inputs, so the field is rendered read-only and becomes editable the
 * moment the user focuses it — by which point the autofill pass has run. The
 * data attributes suppress the 1Password and LastPass overlays for the same
 * reason. Do not add `autoFocus` alongside this: focusing at mount would clear
 * the read-only flag before autofill runs and defeat it.
 */
export const NO_AUTOFILL = {
  autoComplete: 'off',
  readOnly: true,
  onFocus: (e: React.FocusEvent<HTMLInputElement>) =>
    e.currentTarget.removeAttribute('readonly'),
  'data-1p-ignore': true,
  'data-lpignore': 'true',
  'data-bwignore': true,
} as const;

export const Textarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = ({
  className,
  ...rest
}) => <textarea className={cx('field resize-y', className)} {...rest} />;

export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({
  className,
  children,
  ...rest
}) => (
  <select className={cx('field', className)} {...rest}>
    {children}
  </select>
);

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
  <button
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
    <span
      className={cx(
        'grid place-items-center size-4 rounded-full bg-white shadow-[var(--shadow-sm)] transition-transform duration-120',
        checked ? 'translate-x-[18px]' : 'translate-x-0.5'
      )}
    >
      {busy && <Loader2 className="size-2.5 animate-spin text-ink-3" strokeWidth={2.5} />}
    </span>
  </button>
);

interface SearchInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ElementType;
}

export const SearchInput: React.FC<SearchInputProps> = ({ icon: Icon, className, ...rest }) => (
  <div className={cx('relative', className)}>
    {Icon && (
      <Icon
        className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none"
        strokeWidth={1.75}
      />
    )}
    <input className={cx('field', Icon && 'pl-9')} {...rest} />
  </div>
);

/* ── Table ────────────────────────────────────────────────────────────── */

export const Table: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => (
  <div className={cx('overflow-x-auto', className)}>
    <table className="w-full text-left border-collapse">{children}</table>
  </div>
);

export const Th: React.FC<React.ThHTMLAttributes<HTMLTableCellElement>> = ({
  className,
  children,
  ...rest
}) => (
  <th
    className={cx(
      'text-micro uppercase text-ink-3 font-semibold px-4 py-2.5 bg-surface-subtle',
      'border-b border-line first:pl-5 last:pr-5',
      className
    )}
    {...rest}
  >
    {children}
  </th>
);

export const Td: React.FC<React.TdHTMLAttributes<HTMLTableCellElement>> = ({
  className,
  children,
  ...rest
}) => (
  <td className={cx('px-4 py-3 text-sm text-ink-2 align-middle first:pl-5 last:pr-5', className)} {...rest}>
    {children}
  </td>
);

export const Tr: React.FC<React.HTMLAttributes<HTMLTableRowElement>> = ({
  className,
  children,
  ...rest
}) => (
  <tr
    className={cx('border-b border-line last:border-0 hover:bg-surface-subtle transition-colors', className)}
    {...rest}
  >
    {children}
  </tr>
);

/* ── States ───────────────────────────────────────────────────────────── */

interface EmptyStateProps {
  icon: React.ElementType;
  title: string;
  description?: string;
  action?: React.ReactNode;
  tone?: 'neutral' | 'crit';
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  action,
  tone = 'neutral',
}) => (
  <div className="py-12 px-6 flex flex-col items-center text-center">
    <span
      className={cx(
        'grid place-items-center size-10 rounded-panel mb-3',
        tone === 'crit' ? 'bg-crit-soft text-crit' : 'bg-surface-inset text-ink-3'
      )}
    >
      <Icon className="size-5" strokeWidth={1.75} />
    </span>
    <p className="text-body font-medium text-ink">{title}</p>
    {description && <p className="text-sm text-ink-3 mt-1 max-w-sm">{description}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export const Skeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div className={cx('skeleton', className)} />
);

export const TableSkeleton: React.FC<{ rows?: number; cols: number }> = ({ rows = 5, cols }) => (
  <>
    {Array.from({ length: rows }).map((_, r) => (
      <tr key={r} className="border-b border-line last:border-0">
        {Array.from({ length: cols }).map((__, c) => (
          <td key={c} className="px-4 py-3.5 first:pl-5 last:pr-5">
            <Skeleton className={cx('h-3.5', c === 0 ? 'w-40' : 'w-20')} />
          </td>
        ))}
      </tr>
    ))}
  </>
);

/** Inline error surface for a failed request — states the real reason. */
export const ErrorState: React.FC<{ message: string; onRetry?: () => void }> = ({
  message,
  onRetry,
}) => (
  <div className="flex items-start gap-3 p-4 rounded-panel bg-crit-soft border border-crit-border">
    <AlertCircle className="size-4 text-crit shrink-0 mt-0.5" strokeWidth={2} />
    <div className="min-w-0 flex-1">
      <p className="text-body font-medium text-ink">Could not load data</p>
      <p className="text-sm text-ink-2 mt-0.5 break-words">{message}</p>
    </div>
    {onRetry && (
      <Button size="sm" variant="secondary" onClick={onRetry}>
        Retry
      </Button>
    )}
  </div>
);

/* ── Modal ────────────────────────────────────────────────────────────── */

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}) => {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-[rgb(9_12_20/0.55)] backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cx(
          'relative w-full bg-surface border border-line rounded-panel shadow-[var(--shadow-lg)] anim-scale-in outline-none',
          widths[size]
        )}
      >
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-line">
          <div className="min-w-0">
            <h2 className="text-section text-ink">{title}</h2>
            {description && <p className="text-sm text-ink-3 mt-0.5">{description}</p>}
          </div>
          <IconButton icon={X} label="Close dialog" onClick={onClose} className="-mr-1 -mt-0.5" />
        </div>
        <div className="px-5 py-5">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-line bg-surface-subtle rounded-b-panel">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

/* ── Toast ────────────────────────────────────────────────────────────── */

export interface ToastState {
  tone: 'good' | 'crit';
  message: string;
}

export const Toast: React.FC<{ toast: ToastState | null; onDismiss: () => void }> = ({
  toast,
  onDismiss,
}) => {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDismiss, 4500);
    return () => clearTimeout(t);
  }, [toast, onDismiss]);

  if (!toast) return null;

  const Icon = toast.tone === 'good' ? CheckCircle2 : AlertCircle;

  return (
    <div
      role="status"
      className="fixed bottom-5 right-5 z-60 max-w-sm anim-fade-up"
    >
      <div
        className={cx(
          'flex items-start gap-2.5 px-4 py-3 rounded-panel border shadow-[var(--shadow-lg)] bg-surface',
          toast.tone === 'good' ? 'border-good-border' : 'border-crit-border'
        )}
      >
        <Icon
          className={cx('size-4 shrink-0 mt-0.5', toast.tone === 'good' ? 'text-good' : 'text-crit')}
          strokeWidth={2}
        />
        <p className="text-sm text-ink flex-1">{toast.message}</p>
        <IconButton icon={X} label="Dismiss" onClick={onDismiss} className="-mr-1.5 -mt-1 size-6" />
      </div>
    </div>
  );
};

/* ── Misc ─────────────────────────────────────────────────────────────── */

export const SEVERITY_ICON = {
  good: CheckCircle2,
  warn: TriangleAlert,
  crit: AlertCircle,
  info: Info,
} as const;

/** A label/value pair used across detail panels and telemetry lists. */
export const DataRow: React.FC<{ label: string; value: React.ReactNode; mono?: boolean }> = ({
  label,
  value,
  mono,
}) => (
  <div className="flex items-baseline justify-between gap-4 py-2 border-b border-line last:border-0">
    <span className="text-sm text-ink-3 shrink-0">{label}</span>
    <span className={cx('text-sm text-ink text-right break-all', mono && 'font-mono tabular')}>
      {value}
    </span>
  </div>
);
