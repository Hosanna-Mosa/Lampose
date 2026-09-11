import React from 'react';

/* <article> — passes every attribute straight through and adds nothing of its
   own, so the rendered markup is identical to the hand-written element. The
   ref is forwarded: code that held a ref to the raw element still holds one. */
export const Article = React.forwardRef(({ children, ...rest }, ref) => (
  <article ref={ref} {...rest}>{children}</article>
));
Article.displayName = 'Article';
