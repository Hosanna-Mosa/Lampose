import React from 'react';

/* <footer> — passes every attribute straight through and adds nothing of its
   own, so the rendered markup is identical to the hand-written element. The
   ref is forwarded: code that held a ref to the raw element still holds one. */
export const ContentInfo = React.forwardRef(({ children, ...rest }, ref) => (
  <footer ref={ref} {...rest}>{children}</footer>
));
ContentInfo.displayName = 'ContentInfo';
