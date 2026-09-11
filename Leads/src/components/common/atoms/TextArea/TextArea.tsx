import React from 'react';

/* <textarea> — passes every attribute straight through and adds nothing of its
   own, so the rendered markup is identical to the hand-written element. */
export const TextArea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = ({ children, ...rest }) => (
  <textarea {...rest}>{children}</textarea>
);
