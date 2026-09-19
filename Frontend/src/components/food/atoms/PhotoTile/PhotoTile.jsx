import React from 'react';
import { Box, Inline } from '../../../common/atoms';

/* ══ Photo tile ═══════════════════════════════════════════════════════════
   Where a photograph goes, and what stands there until one exists.

   Roughly half of what onboarding collects from kitchens this size arrives
   without a usable picture, so a missing photo is the ordinary case rather
   than the error case — every layout here is built to be correct without
   one. The tile carries a tint drawn from the kitchen or dish (`tone`) and a
   bowl glyph, so a grid of them still reads as a grid of different places
   rather than as six identical grey boxes.

   `label` prints the word "Photo" in the corner: the tile is honest about
   being a placeholder rather than pretending to be an image that failed.
   ════════════════════════════════════════════════════════════════════════ */

export function PhotoTile({ tone = 'stone', className = '', label = null, children = null }) {
  return (
    <Box className={`fd-tile fd-tile--${tone} ${className}`.trim()}>
      <svg className="fd-tile__glyph" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 11h18a9 9 0 0 1-18 0Z" />
        <path d="M9 7c0-1 1-1.4 1-2.5M13 7c0-1 1-1.4 1-2.5M17 7c0-1 1-1.4 1-2.5" />
      </svg>
      {label && <Inline className="fd-tile__label">{label}</Inline>}
      {children}
    </Box>
  );
}
