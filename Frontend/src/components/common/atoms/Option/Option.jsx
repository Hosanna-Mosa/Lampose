import React from 'react';

/* <option> — passes every attribute straight through and adds nothing of its
   own, so the rendered markup is identical to the hand-written element. The
   ref is forwarded: code that held a ref to the raw element still holds one. */
export const Option = React.forwardRef(({ children, ...rest }, ref) => (
  <option ref={ref} {...rest}>{children}</option>
));
Option.displayName = 'Option';
