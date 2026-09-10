import React from 'react';

export const ListItem: React.FC<React.LiHTMLAttributes<HTMLLIElement> & { ref?: React.Ref<HTMLLIElement> }> = (props) => (
  <li {...props} />
);
