import React from 'react';

/* <h1>-<h6> as one component with an explicit rank, so a heading's level is a
   value rather than six near-identical components. `level` selects the
   element; everything else passes straight through unchanged. */
export const Heading = ({ level, children, ...rest }) =>
  React.createElement(`h${level}`, rest, children);
