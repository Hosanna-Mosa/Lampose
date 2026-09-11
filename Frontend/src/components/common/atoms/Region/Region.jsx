import React from 'react';

/* <section> — passes every attribute straight through and adds nothing of its
   own, so the rendered markup is identical to the hand-written element. The
   ref is forwarded: code that held a ref to the raw element still holds one. */
export const Region = React.forwardRef(({ children, ...rest }, ref) => (
  <section ref={ref} {...rest}>{children}</section>
));
Region.displayName = 'Region';
