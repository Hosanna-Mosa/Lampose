import React from 'react';
import { Box } from '../../atoms/Box';
import { Text } from '../../atoms/Text';

export const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <Box>
    <Text className="text-micro uppercase text-ink-3 mb-1.5">{title}</Text>
    <Box>{children}</Box>
  </Box>
);
