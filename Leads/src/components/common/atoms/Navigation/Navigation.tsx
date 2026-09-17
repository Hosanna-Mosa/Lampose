import React from 'react';

/* <nav> — passes every attribute straight through and adds nothing of its
   own, so the rendered markup is identical to the hand-written element. */
export const Navigation: React.FC<React.HTMLAttributes<HTMLElement>> = ({ children, ...rest }) => (
  <nav {...rest}>{children}</nav>
);
