import React from 'react';

/* <label> — passes every attribute straight through and adds nothing of its
   own, so the rendered markup is identical to the hand-written element. The
   ref is forwarded: code that held a ref to the raw element still holds one. */
export const Label = React.forwardRef(({ children, ...rest }, ref) => (
  <label ref={ref} {...rest}>{children}</label>
));
Label.displayName = 'Label';
