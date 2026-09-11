import React from 'react';

/* <span> — passes every attribute straight through and adds nothing of its
   own, so the rendered markup is identical to the hand-written element. The
   ref is forwarded: code that held a ref to the raw element still holds one. */
export const Inline = React.forwardRef(({ children, ...rest }, ref) => (
  <span ref={ref} {...rest}>{children}</span>
));
Inline.displayName = 'Inline';
