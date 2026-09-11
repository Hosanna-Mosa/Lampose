import React from 'react';

/* <dt> — passes every attribute straight through and adds nothing of its
   own, so the rendered markup is identical to the hand-written element. The
   ref is forwarded: code that held a ref to the raw element still holds one. */
export const DescriptionTerm = React.forwardRef(({ children, ...rest }, ref) => (
  <dt ref={ref} {...rest}>{children}</dt>
));
DescriptionTerm.displayName = 'DescriptionTerm';
