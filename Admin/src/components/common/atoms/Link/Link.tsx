import React from 'react';

export const Link: React.FC<React.AnchorHTMLAttributes<HTMLAnchorElement> & { ref?: React.Ref<HTMLAnchorElement> }> = (props) => (
  <a {...props} />
);
