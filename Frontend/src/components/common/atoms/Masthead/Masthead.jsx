import React from 'react';

/* <header> — passes every attribute straight through and adds nothing of its
   own, so the rendered markup is identical to the hand-written element. The
   ref is forwarded: code that held a ref to the raw element still holds one. */
export const Masthead = React.forwardRef(({ children, ...rest }, ref) => (
  <header ref={ref} {...rest}>{children}</header>
));
Masthead.displayName = 'Masthead';
