import React from 'react';

/* <nav> — passes every attribute straight through and adds nothing of its
   own, so the rendered markup is identical to the hand-written element. The
   ref is forwarded: code that held a ref to the raw element still holds one. */
export const Navigation = React.forwardRef(({ children, ...rest }, ref) => (
  <nav ref={ref} {...rest}>{children}</nav>
));
Navigation.displayName = 'Navigation';
