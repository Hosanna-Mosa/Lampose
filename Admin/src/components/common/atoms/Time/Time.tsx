import React from 'react';

export const Time: React.FC<React.TimeHTMLAttributes<HTMLTimeElement> & { ref?: React.Ref<HTMLTimeElement> }> = (props) => (
  <time {...props} />
);
