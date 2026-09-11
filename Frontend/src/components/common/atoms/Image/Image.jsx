import React from 'react';

/* <img> — a void element, so it renders no children, exactly as the raw
   element does. Every attribute is passed straight through, and the ref is
   forwarded so this behaves like the raw element in that respect too. */
export const Image = React.forwardRef((props, ref) => <img ref={ref} {...props} />);
Image.displayName = 'Image';
