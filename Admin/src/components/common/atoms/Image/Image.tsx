import React from 'react';

export const Image: React.FC<React.ImgHTMLAttributes<HTMLImageElement> & { ref?: React.Ref<HTMLImageElement> }> = (props) => (
  <img {...props} />
);
