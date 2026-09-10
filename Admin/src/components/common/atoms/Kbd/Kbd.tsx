import React from 'react';

export const Kbd: React.FC<React.HTMLAttributes<HTMLElement> & { ref?: React.Ref<HTMLElement> }> = (props) => (
  <kbd {...props} />
);
