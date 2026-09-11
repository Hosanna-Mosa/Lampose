import React from 'react';
import { Inline, Label } from '../../../common/atoms';

export function Labelled({ label, children }) {
  return (
    <Label style={{ display: 'block' }}>
      <Inline style={{ display: 'block', fontSize: '0.75rem', color: '#64748b', fontWeight: 600, marginBottom: '4px' }}>{label}</Inline>
      {children}
    </Label>
  );
}
