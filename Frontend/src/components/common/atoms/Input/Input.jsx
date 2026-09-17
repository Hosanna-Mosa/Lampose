import React from 'react';

/* <input> — a void element, so it renders no children, exactly as the raw
   element does. Every attribute is passed straight through, and the ref is
   forwarded so this behaves like the raw element in that respect too. */
export const Input = React.forwardRef((props, ref) => <input ref={ref} {...props} />);
Input.displayName = 'Input';
