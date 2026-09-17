import React from 'react';

/* <form> — passes every attribute straight through and adds nothing of its
   own, so the rendered markup is identical to the hand-written element. */
export const Form: React.FC<React.FormHTMLAttributes<HTMLFormElement>> = ({ children, ...rest }) => (
  <form {...rest}>{children}</form>
);
