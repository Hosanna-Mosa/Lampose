import React from 'react';

/* <code> — passes every attribute straight through and adds nothing of its
   own, so the rendered markup is identical to the hand-written element. The
   ref is forwarded: code that held a ref to the raw element still holds one. */
export const Code = React.forwardRef(({ children, ...rest }, ref) => (
  <code ref={ref} {...rest}>{children}</code>
));
Code.displayName = 'Code';
