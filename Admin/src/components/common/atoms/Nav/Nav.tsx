import React from 'react';

export const Nav: React.FC<React.HTMLAttributes<HTMLElement> & { ref?: React.Ref<HTMLElement> }> = (props) => (
  <nav {...props} />
);
