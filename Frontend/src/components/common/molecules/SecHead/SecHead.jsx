import React from 'react';
import { Box, Emphasis, Heading, Inline, Text } from '../../atoms';

/* ══ Section heading ══════════════════════════════════════════════════════
   The tag / heading / sub trio repeats on every page, so it lives here once.
   ════════════════════════════════════════════════════════════════════════ */

export const SecHead = ({ tag, title, em, sub, align = 'center', mb = '2.5rem' }) => (
  <Box className="reveal" style={{ textAlign: align, marginBottom: mb }}>
    <Inline className="sec-tag">{tag}</Inline>
    <Heading level={2} className="sec-h2">{title} {em && <Emphasis>{em}</Emphasis>}</Heading>
    {sub && (
      <Text className="sec-sub" style={{ margin: align === 'center' ? '0.75rem auto' : '0.75rem 0' }}>
        {sub}
      </Text>
    )}
  </Box>
);
