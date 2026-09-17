import React from 'react';

/* <select> — passes every attribute straight through and adds nothing of its
   own, so the rendered markup is identical to the hand-written element. The
   ref is forwarded: code that held a ref to the raw element still holds one. */
export const Select = React.forwardRef(({ children, ...rest }, ref) => (
  <select ref={ref} {...rest}>{children}</select>
));
Select.displayName = 'Select';
