import React from 'react';

/* <select> — passes every attribute straight through and adds nothing of its
   own, so the rendered markup is identical to the hand-written element. */
export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({ children, ...rest }) => (
  <select {...rest}>{children}</select>
);
