import React from 'react';

/* <span> — passes every attribute straight through and adds nothing of its
   own, so the rendered markup is identical to the hand-written element. */
export const Inline: React.FC<React.HTMLAttributes<HTMLSpanElement>> = ({ children, ...rest }) => (
  <span {...rest}>{children}</span>
);
