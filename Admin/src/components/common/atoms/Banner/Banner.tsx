import React from 'react';

export const Banner: React.FC<React.HTMLAttributes<HTMLElement> & { ref?: React.Ref<HTMLElement> }> = (props) => (
  <header {...props} />
);
