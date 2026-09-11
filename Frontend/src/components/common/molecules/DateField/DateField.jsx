import React from 'react';
import { Inline, Input, Label, Small } from '../../atoms';

export const DateField = ({ value, window: win, onChange, label = 'Joining date', hint = true }) => (
  <Label className="si-field">
    <Inline className="exp-lbl">{label}</Inline>
    <Input
      type="date"
      className="si-date"
      value={value || ''}
      min={win?.min}
      max={win?.max}
      onChange={e => onChange(e.target.value || null)}
    />
    {win && hint && (
      <Small className="si-hint">
        Anytime from {new Date(`${win.min}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
        {' '}to {new Date(`${win.max}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
      </Small>
    )}
  </Label>
);
