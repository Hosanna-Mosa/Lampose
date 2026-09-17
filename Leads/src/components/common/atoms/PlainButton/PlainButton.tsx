import React from 'react';

/* <button> — passes every attribute straight through and adds nothing of its
   own, so the rendered markup is identical to the hand-written element. */
export const PlainButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ children, ...rest }) => (
  <button {...rest}>{children}</button>
);
