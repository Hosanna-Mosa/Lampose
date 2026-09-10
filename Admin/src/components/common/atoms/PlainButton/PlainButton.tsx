import React from 'react';

export const PlainButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { ref?: React.Ref<HTMLButtonElement> }> = (props) => (
  <button {...props} />
);
