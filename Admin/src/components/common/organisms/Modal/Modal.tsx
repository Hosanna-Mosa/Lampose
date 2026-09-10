/**
 * Lampose Admin — UI primitives.
 *
 * Every surface in the panel is composed from these. Sizes, weights, radii and
 * colours come from the token layer in `index.css`; nothing here hardcodes a
 * hex value or an arbitrary font size, which is what keeps typography and
 * spacing consistent across pages.
 */
import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { IconButton } from '../../atoms/IconButton';
import { cx } from '../../utils/cx';
import { Box } from '../../atoms/Box';
import { Heading } from '../../atoms/Heading';
import { Text } from '../../atoms/Text';

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

  /*
   * The latest `onClose`, without it being a dependency.
   *
   * This is the whole fix for a bug that made every form in this console
   * unusable: the effect below focuses the panel, and it used to list
   * `onClose` in its deps. Every call site passes an inline arrow or a
   * function declared in the render body, so `onClose` has a NEW IDENTITY on
   * every render — which means every keystroke in a modal re-ran the effect,
   * and the effect stole focus back to the panel. You could type one letter,
   * then had to click the field again.
   *
   * A ref keeps the Escape handler current without making the effect depend on
   * it, so the effect runs exactly when the modal opens and closes.
   */
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    /* Once, on open — moving focus to the panel is how a dialog announces
       itself to a screen reader, and doing it on every render is how it takes
       focus away from whatever the user is typing into. */
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' };

  return (
    <Box className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <Box
        className="absolute inset-0 bg-[rgb(9_12_20/0.55)] backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <Box
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cx(
          /* A column capped to the viewport, so the BODY scrolls rather than
             the panel growing off the screen. Without the cap a long dialog —
             a food-partner application is a couple of thousand pixels — runs
             past both edges with nothing to scroll, because the container is
             `fixed inset-0` and the page behind it is locked. */
          'relative w-full flex flex-col max-h-[calc(100vh-2rem)]',
          'bg-surface border border-line rounded-panel shadow-[var(--shadow-lg)] anim-scale-in outline-none',
          widths[size]
        )}
      >
        <Box className="shrink-0 flex items-start justify-between gap-4 px-5 py-4 border-b border-line">
          <Box className="min-w-0">
            <Heading level={2} className="text-section text-ink">{title}</Heading>
            {description && <Text className="text-sm text-ink-3 mt-0.5">{description}</Text>}
          </Box>
          <IconButton icon={X} label="Close dialog" onClick={onClose} className="-mr-1 -mt-0.5" />
        </Box>
        {/* `min-h-0` is load-bearing: a flex child defaults to `min-height:auto`,
            which refuses to shrink below its content and defeats the overflow.
            `overscroll-contain` stops a scroll that reaches the end here from
            chaining to whatever is behind the dialog. */}
        <Box className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-5">{children}</Box>
        {footer && (
          <Box className="shrink-0 flex items-center justify-end gap-2 px-5 py-3.5 border-t border-line bg-surface-subtle rounded-b-panel">
            {footer}
          </Box>
        )}
      </Box>
    </Box>
  );
};

/* ── Toast ────────────────────────────────────────────────────────────── */
