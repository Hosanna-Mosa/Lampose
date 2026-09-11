import React from 'react';

/* <header> — passes every attribute straight through and adds nothing of its
   own, so the rendered markup is identical to the hand-written element. */
export const Banner: React.FC<React.HTMLAttributes<HTMLElement>> = ({ children, ...rest }) => (
  <header {...rest}>{children}</header>
);
