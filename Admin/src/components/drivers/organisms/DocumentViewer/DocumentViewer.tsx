import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, RotateCw, X, ZoomIn, ZoomOut } from 'lucide-react';

import { Box } from '../../../common/atoms/Box';
import { Image } from '../../../common/atoms/Image';
import { Link } from '../../../common/atoms/Link';
import { PlainButton } from '../../../common/atoms/PlainButton';
import { Text } from '../../../common/atoms/Text';
import { cx } from '../../../common/utils';

/**
 * A rider's document scan, full screen, for READING it.
 *
 * The approver is checking whether a licence number can be read, whether the
 * photo matches a face, whether the edges are all there — so the scan fills
 * the screen and can be zoomed and turned the right way up. A phone photo of
 * a card is as often sideways as not.
 *
 * Portalled to the body and stacked above the rider dialog it opens from.
 * Escape closes THIS and not the dialog underneath: the dialog listens on the
 * document, so the key is caught first here, on the window, and stopped.
 */

export type ViewerSide = { label: string; url: string };

const ZOOMS = [1, 1.5, 2, 3, 4];

export const DocumentViewer: React.FC<{
  title: string;
  /** Subtitle — the number printed on the document, so it can be compared. */
  number: string;
  sides: ViewerSide[];
  initial: number;
  onClose: () => void;
}> = ({ title, number, sides, initial, onClose }) => {
  const [index, setIndex] = useState(initial);
  const [zoom, setZoom] = useState(0);
  const [turn, setTurn] = useState(0);
  const side = sides[index];

  /* A new side starts upright and unzoomed. */
  useEffect(() => {
    setZoom(0);
    setTurn(0);
  }, [index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      } else if (e.key === 'ArrowRight' && sides.length > 1) {
        setIndex((i) => (i + 1) % sides.length);
      } else if (e.key === 'ArrowLeft' && sides.length > 1) {
        setIndex((i) => (i - 1 + sides.length) % sides.length);
      } else if (e.key === '+' || e.key === '=') {
        setZoom((z) => Math.min(ZOOMS.length - 1, z + 1));
      } else if (e.key === '-') {
        setZoom((z) => Math.max(0, z - 1));
      } else if (e.key.toLowerCase() === 'r') {
        setTurn((t) => (t + 90) % 360);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose, sides.length]);

  if (!side) return null;

  const tool = 'inline-flex items-center justify-center size-9 rounded-control text-white/90 hover:bg-white/15 disabled:opacity-40';

  return createPortal(
    <Box
      className="fixed inset-0 z-[60] flex flex-col bg-black/90"
      role="dialog"
      aria-modal="true"
      aria-label={`${title} — ${side.label}`}
    >
      <Box className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <Box className="min-w-0">
          <Text className="text-body font-medium text-white">
            {title} · {side.label}
          </Text>
          <Text className="text-label text-white/60 font-mono tabular">{number || 'no number given'}</Text>
        </Box>
        <Box className="flex items-center gap-1">
          {sides.length > 1 &&
            sides.map((s, i) => (
              <PlainButton
                key={s.label}
                onClick={() => setIndex(i)}
                className={cx(
                  'h-9 px-3 rounded-control text-body',
                  i === index ? 'bg-white text-black' : 'text-white/90 hover:bg-white/15'
                )}
              >
                {s.label}
              </PlainButton>
            ))}
          <PlainButton
            className={tool}
            onClick={() => setZoom((z) => Math.max(0, z - 1))}
            disabled={zoom === 0}
            aria-label="Zoom out"
            title="Zoom out (−)"
          >
            <ZoomOut className="size-4" />
          </PlainButton>
          <Text className="w-12 text-center text-label text-white/80 tabular">{ZOOMS[zoom] * 100}%</Text>
          <PlainButton
            className={tool}
            onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))}
            disabled={zoom === ZOOMS.length - 1}
            aria-label="Zoom in"
            title="Zoom in (+)"
          >
            <ZoomIn className="size-4" />
          </PlainButton>
          <PlainButton
            className={tool}
            onClick={() => setTurn((t) => (t + 90) % 360)}
            aria-label="Rotate"
            title="Rotate (R)"
          >
            <RotateCw className="size-4" />
          </PlainButton>
          <Link
            href={side.url}
            target="_blank"
            rel="noreferrer"
            className={tool}
            aria-label="Open the original in a new tab"
            title="Open the original in a new tab"
          >
            <ExternalLink className="size-4" />
          </Link>
          <PlainButton className={tool} onClick={onClose} aria-label="Close" title="Close (Esc)">
            <X className="size-5" />
          </PlainButton>
        </Box>
      </Box>

      {/* Scrolls when zoomed past the screen, so every corner can be reached. */}
      <Box className="flex-1 overflow-auto" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <Box className="min-h-full min-w-full flex items-center justify-center p-6">
          <Image
            src={side.url}
            alt={`${title}, ${side.label.toLowerCase()}`}
            draggable={false}
            className="max-h-[80vh] max-w-full select-none shadow-2xl transition-transform duration-150"
            style={{
              transform: `rotate(${turn}deg) scale(${ZOOMS[zoom]})`,
              transformOrigin: 'center center',
              margin: zoom > 0 ? `${(ZOOMS[zoom] - 1) * 40}vh ${(ZOOMS[zoom] - 1) * 40}vw` : undefined,
            }}
          />
        </Box>
      </Box>
    </Box>,
    document.body
  );
};
