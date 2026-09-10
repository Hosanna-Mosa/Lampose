import React from 'react';

export const Form: React.FC<React.FormHTMLAttributes<HTMLFormElement> & { ref?: React.Ref<HTMLFormElement> }> = (props) => (
  <form {...props} />
);
