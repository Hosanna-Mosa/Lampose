import React from 'react';

export const Text: React.FC<React.HTMLAttributes<HTMLParagraphElement> & { ref?: React.Ref<HTMLParagraphElement> }> = (props) => (
  <p {...props} />
);
