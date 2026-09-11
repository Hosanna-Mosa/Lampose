import React from 'react';

/* <em> — passes every attribute straight through and adds nothing of its
   own, so the rendered markup is identical to the hand-written element. The
   ref is forwarded: code that held a ref to the raw element still holds one. */
export const Emphasis = React.forwardRef(({ children, ...rest }, ref) => (
  <em ref={ref} {...rest}>{children}</em>
));
Emphasis.displayName = 'Emphasis';
