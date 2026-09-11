import React from 'react';

/* <aside> — passes every attribute straight through and adds nothing of its
   own, so the rendered markup is identical to the hand-written element. */
export const Aside: React.FC<React.HTMLAttributes<HTMLElement>> = ({ children, ...rest }) => (
  <aside {...rest}>{children}</aside>
);
