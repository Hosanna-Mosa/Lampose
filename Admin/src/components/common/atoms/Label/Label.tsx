import React from 'react';

export const Label: React.FC<React.LabelHTMLAttributes<HTMLLabelElement> & { ref?: React.Ref<HTMLLabelElement> }> = (props) => (
  <label {...props} />
);
