import React from 'react';

/* <fieldset> — passes every attribute straight through and adds nothing of its
   own, so the rendered markup is identical to the hand-written element. The
   ref is forwarded: code that held a ref to the raw element still holds one. */
export const FieldSet = React.forwardRef(({ children, ...rest }, ref) => (
  <fieldset ref={ref} {...rest}>{children}</fieldset>
));
FieldSet.displayName = 'FieldSet';
