import React from 'react';

/* ══ Diet mark ════════════════════════════════════════════════════════════
   Veg, egg and non-veg told apart by SHAPE first: a dot in a green square, a
   dot in an amber square, a triangle in a red square. Colour is the second
   signal and never the only one — which matters for the eight percent of men
   who cannot read the difference between the green and the red, and happens
   also to be the mark Indian packaging law already trained everyone to read.

   Drawn rather than imported as an icon because the shape IS the meaning:
   `PATHS` holds stroked outlines, and these three are filled marks.
   ════════════════════════════════════════════════════════════════════════ */

const STROKE = { veg: '#17803d', egg: '#8a6409', nonveg: '#b3261e' };
const TITLE = { veg: 'Veg', egg: 'Contains egg', nonveg: 'Non-veg' };

export function DietMark({ diet = 'veg', size = 15 }) {
  const colour = STROKE[diet] || STROKE.veg;
  return (
    <svg
      className="fd-diet"
      width={size}
      height={size}
      viewBox="0 0 14 14"
      role="img"
      aria-label={TITLE[diet] || TITLE.veg}
    >
      <rect x="0.9" y="0.9" width="12.2" height="12.2" rx="2.4" fill="#ffffff" stroke={colour} strokeWidth="1.5" />
      {diet === 'nonveg'
        ? <path d="M7 3.6 10.2 9.6H3.8Z" fill={colour} />
        : <circle cx="7" cy="7" r="3" fill={colour} />}
    </svg>
  );
}
