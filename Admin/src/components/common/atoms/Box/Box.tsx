import React from 'react';

export const Box: React.FC<React.HTMLAttributes<HTMLDivElement> & { ref?: React.Ref<HTMLDivElement> }> = (props) => (
  <div {...props} />
);
