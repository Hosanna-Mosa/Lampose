import React from 'react';

export const Code: React.FC<React.HTMLAttributes<HTMLElement> & { ref?: React.Ref<HTMLElement> }> = (props) => (
  <code {...props} />
);
