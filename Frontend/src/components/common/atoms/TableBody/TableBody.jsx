import React from 'react';

/* <tbody> — passes every attribute straight through and adds nothing of its
   own, so the rendered markup is identical to the hand-written element. The
   ref is forwarded: code that held a ref to the raw element still holds one. */
export const TableBody = React.forwardRef(({ children, ...rest }, ref) => (
  <tbody ref={ref} {...rest}>{children}</tbody>
));
TableBody.displayName = 'TableBody';
