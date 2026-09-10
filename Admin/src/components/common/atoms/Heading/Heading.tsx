import React from 'react';

interface HeadingProps extends React.HTMLAttributes<HTMLHeadingElement> {
  /** The rank the element had before it was a component. */
  level: 1 | 2 | 3 | 4 | 5 | 6;
  ref?: React.Ref<HTMLHeadingElement>;
}

export const Heading: React.FC<HeadingProps> = ({ level, ...rest }) => {
  const Tag = `h${level}` as 'h1';
  return <Tag {...rest} />;
};
