import React from 'react';

/* <br> — a void element, so it renders no children, exactly as the raw
   element does. Every attribute is passed straight through, and the ref is
   forwarded so this behaves like the raw element in that respect too. */
export const Break = React.forwardRef((props, ref) => <br ref={ref} {...props} />);
Break.displayName = 'Break';
