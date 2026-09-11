import React from 'react';
import { Icon } from '../../../common/atoms/Icon/Icon';
import { Box, Heading, Inline, Region } from '../../../common/atoms';

/* Section header inside a step — an icon tile and a title, repeated enough
   times that it earns a component. */

export const Block = ({ icon, title, children }) => (
  <Region className="ob-block">
    <Box className="ob-block__head">
      <Inline className="ob-block__ico"><Icon name={icon} className="ob-ico" /></Inline>
      <Heading level={2}>{title}</Heading>
    </Box>
    <Box className="ob-card">{children}</Box>
  </Region>
);
