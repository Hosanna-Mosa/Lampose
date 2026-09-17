import React from 'react';

/* <td> — passes every attribute straight through and adds nothing of its
   own, so the rendered markup is identical to the hand-written element. The
   ref is forwarded: code that held a ref to the raw element still holds one. */
export const TableCell = React.forwardRef(({ children, ...rest }, ref) => (
  <td ref={ref} {...rest}>{children}</td>
));
TableCell.displayName = 'TableCell';
