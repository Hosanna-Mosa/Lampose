import React from 'react';

/* <legend> — passes every attribute straight through and adds nothing of its
   own, so the rendered markup is identical to the hand-written element. The
   ref is forwarded: code that held a ref to the raw element still holds one. */
export const Legend = React.forwardRef(({ children, ...rest }, ref) => (
  <legend ref={ref} {...rest}>{children}</legend>
));
Legend.displayName = 'Legend';
