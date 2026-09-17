import React from 'react';

/* <table> — passes every attribute straight through and adds nothing of its
   own, so the rendered markup is identical to the hand-written element. The
   ref is forwarded: code that held a ref to the raw element still holds one. */
export const Table = React.forwardRef(({ children, ...rest }, ref) => (
  <table ref={ref} {...rest}>{children}</table>
));
Table.displayName = 'Table';
