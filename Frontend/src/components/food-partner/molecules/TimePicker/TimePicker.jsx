import React from 'react';
import { Inline, Input, Label } from '../../../common/atoms';

export const TimePicker = ({ label, value, onChange }) => (
  <Label className="ob-time">
    <Inline>{label}</Inline>
    <Input type="time" value={value} onChange={e => onChange(e.target.value)} />
  </Label>
);
