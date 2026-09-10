import React from 'react';

export const PlainTextarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: React.Ref<HTMLTextAreaElement> }> = (props) => (
  <textarea {...props} />
);
