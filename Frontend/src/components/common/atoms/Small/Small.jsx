import React from 'react';

/* <small> — passes every attribute straight through and adds nothing of its
   own, so the rendered markup is identical to the hand-written element. The
   ref is forwarded: code that held a ref to the raw element still holds one. */
export const Small = React.forwardRef(({ children, ...rest }, ref) => (
  <small ref={ref} {...rest}>{children}</small>
));
Small.displayName = 'Small';
