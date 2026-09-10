import React from 'react';

export const Inline: React.FC<React.HTMLAttributes<HTMLSpanElement> & { ref?: React.Ref<HTMLSpanElement> }> = (props) => (
  <span {...props} />
);
