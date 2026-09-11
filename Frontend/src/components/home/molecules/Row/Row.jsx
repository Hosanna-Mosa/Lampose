import React from 'react';
import { Box, Inline } from '../../../common/atoms';

export const Row = ({ items, dir }) => (
  <Box className="mq-row">
    <Box className={`mq-track ${dir}`}>
      {[...items, ...items].map((t, i) => (
        <Inline className="ti" key={`${t}-${i}`} style={{ '--i': i }}>
          <Inline className="td" />
          <Inline className="ti__t">{t}</Inline>
        </Inline>
      ))}
    </Box>
  </Box>
);
