import React from 'react';

/* <h1>-<h4> as one component with an explicit rank, so a heading's level is
   a value rather than four near-identical components. `level` selects the
   element; everything else passes straight through unchanged. */
export interface HeadingProps extends React.HTMLAttributes<HTMLHeadingElement> {
  level: 1 | 2 | 3 | 4 | 5 | 6;
}

export const Heading: React.FC<HeadingProps> = ({ level, children, ...rest }) =>
  React.createElement(`h${level}`, rest, children);
