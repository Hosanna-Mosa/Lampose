import React from 'react';

/* <footer> — passes every attribute straight through and adds nothing of its
   own, so the rendered markup is identical to the hand-written element. */
export const ContentInfo: React.FC<React.HTMLAttributes<HTMLElement>> = ({ children, ...rest }) => (
  <footer {...rest}>{children}</footer>
);
