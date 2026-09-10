import React from 'react';

interface ListProps extends React.HTMLAttributes<HTMLUListElement> {
  /** `true` renders an `ol`, otherwise a `ul`. */
  ordered?: boolean;
  ref?: React.Ref<HTMLUListElement>;
}

export const List: React.FC<ListProps> = ({ ordered, ...rest }) => {
  // Narrowed for the same reason `Heading` narrows: a union of two intrinsic
  // tags will not accept one spread of props, though either alone does.
  const Tag = (ordered ? 'ol' : 'ul') as 'ul';
  return <Tag {...rest} />;
};
