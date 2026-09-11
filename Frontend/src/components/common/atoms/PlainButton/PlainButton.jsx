import React from 'react';

/* <button> — passes every attribute straight through and adds nothing of its
   own, so the rendered markup is identical to the hand-written element. The
   ref is forwarded: code that held a ref to the raw element still holds one. */
export const PlainButton = React.forwardRef(({ children, ...rest }, ref) => (
  <button ref={ref} {...rest}>{children}</button>
));
PlainButton.displayName = 'PlainButton';
