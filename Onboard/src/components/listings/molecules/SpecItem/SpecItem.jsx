import React from 'react';
import { Box, Inline } from '../../../common/atoms';

export function SpecItem({ label, value }) {
  return (
    <Box style={{
      padding: '12px 14px',
      borderRadius: '12px',
      background: '#f8faf8',
      border: '1px solid #e2e8f0'
    }}>
      <Inline style={{ fontSize: '0.74rem', color: '#64748b', display: 'block', fontWeight: 500, marginBottom: '2px' }}>{label}</Inline>
      <Inline style={{ fontSize: '0.88rem', fontWeight: 700, color: '#181e1b' }}>{value || 'N/A'}</Inline>
    </Box>
  );
}
