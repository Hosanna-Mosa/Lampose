import React from 'react';

export const Option: React.FC<React.OptionHTMLAttributes<HTMLOptionElement> & { ref?: React.Ref<HTMLOptionElement> }> = (props) => (
  <option {...props} />
);
