import React from 'react';

/* <input> — a void element, so it renders no children, exactly as the raw
   element does. Every attribute is passed straight through. */
export const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => <input {...props} />;
