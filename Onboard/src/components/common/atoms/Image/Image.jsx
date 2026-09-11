import React from 'react';

/* <img> — a void element, so it renders no children, exactly as the raw
   element does. Every attribute is passed straight through. */
export const Image = (props) => <img {...props} />;
