import React from 'react';

/* <figure> — passes every attribute straight through and adds nothing of its
   own, so the rendered markup is identical to the hand-written element. The
   ref is forwarded: code that held a ref to the raw element still holds one. */
export const Figure = React.forwardRef(({ children, ...rest }, ref) => (
  <figure ref={ref} {...rest}>{children}</figure>
));
Figure.displayName = 'Figure';
