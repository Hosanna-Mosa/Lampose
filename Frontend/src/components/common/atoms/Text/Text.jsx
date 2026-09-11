import React from 'react';

/* <p> — passes every attribute straight through and adds nothing of its
   own, so the rendered markup is identical to the hand-written element. The
   ref is forwarded: code that held a ref to the raw element still holds one. */
export const Text = React.forwardRef(({ children, ...rest }, ref) => (
  <p ref={ref} {...rest}>{children}</p>
));
Text.displayName = 'Text';
