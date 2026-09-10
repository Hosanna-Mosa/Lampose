/**
 * Lampose Admin — UI primitives.
 *
 * Every surface in the panel is composed from these. Sizes, weights, radii and
 * colours come from the token layer in `index.css`; nothing here hardcodes a
 * hex value or an arbitrary font size, which is what keeps typography and
 * spacing consistent across pages.
 */
import React, { useEffect } from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { IconButton } from '../../atoms/IconButton';
import { cx } from '../../utils/cx';
import { Box } from '../../atoms/Box';
import { Text } from '../../atoms/Text';

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
    <Box
      role="status"
      className="fixed bottom-5 right-5 z-60 max-w-sm anim-fade-up"
    >
      <Box
        className={cx(
          'flex items-start gap-2.5 px-4 py-3 rounded-panel border shadow-[var(--shadow-lg)] bg-surface',
          toast.tone === 'good' ? 'border-good-border' : 'border-crit-border'
        )}
      >
        <Icon
          className={cx('size-4 shrink-0 mt-0.5', toast.tone === 'good' ? 'text-good' : 'text-crit')}
          strokeWidth={2}
        />
        <Text className="text-sm text-ink flex-1">{toast.message}</Text>
        <IconButton icon={X} label="Dismiss" onClick={onDismiss} className="-mr-1.5 -mt-1 size-6" />
      </Box>
    </Box>
  );
};

/* ── Misc ─────────────────────────────────────────────────────────────── */
