import React from 'react';

export const Aside: React.FC<React.HTMLAttributes<HTMLElement> & { ref?: React.Ref<HTMLElement> }> = (props) => (
  <aside {...props} />
);
