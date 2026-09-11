import React from 'react';

/* <h1>-<h6> as one component with an explicit rank, so a heading's level is a
   value rather than six near-identical components. `level` selects the
   element and is consumed here — it never reaches the DOM. */
export const Heading = React.forwardRef(({ level, children, ...rest }, ref) =>
  React.createElement(`h${level}`, { ...rest, ref }, children));
Heading.displayName = 'Heading';
