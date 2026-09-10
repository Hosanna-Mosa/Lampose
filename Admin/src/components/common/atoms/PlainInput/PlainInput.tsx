import React from 'react';

export const PlainInput: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { ref?: React.Ref<HTMLInputElement> }> = (props) => (
  <input {...props} />
);
