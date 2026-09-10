import React from 'react';

export const PlainSelect: React.FC<React.SelectHTMLAttributes<HTMLSelectElement> & { ref?: React.Ref<HTMLSelectElement> }> = (props) => (
  <select {...props} />
);
