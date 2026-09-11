import React from 'react';
import { Box, Inline } from '../../../common/atoms';

export function SpecItem({ label, value }) {
  return (
    <Box style={{
      padding: '10px 12px',
      borderRadius: 'var(--radius-sm)',
      background: 'rgba(255, 255, 255, 0.05)',
      border: '1px solid var(--border-glass)'
    }}>
      <Inline style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>{label}</Inline>
      <Inline style={{ fontSize: '0.88rem', fontWeight: 600, color: '#ffffff' }}>{value}</Inline>
    </Box>
  );
}
