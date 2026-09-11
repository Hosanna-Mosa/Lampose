import React from 'react';

/* <th> — passes every attribute straight through and adds nothing of its
   own, so the rendered markup is identical to the hand-written element. The
   ref is forwarded: code that held a ref to the raw element still holds one. */
export const TableHeaderCell = React.forwardRef(({ children, ...rest }, ref) => (
  <th ref={ref} {...rest}>{children}</th>
));
TableHeaderCell.displayName = 'TableHeaderCell';
