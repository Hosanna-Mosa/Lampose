import React from 'react';

export const Strong: React.FC<React.HTMLAttributes<HTMLElement> & { ref?: React.Ref<HTMLElement> }> = (props) => (
  <strong {...props} />
);
