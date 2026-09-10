import React from 'react';

export const Figure: React.FC<React.HTMLAttributes<HTMLElement> & { ref?: React.Ref<HTMLElement> }> = (props) => (
  <figure {...props} />
);
