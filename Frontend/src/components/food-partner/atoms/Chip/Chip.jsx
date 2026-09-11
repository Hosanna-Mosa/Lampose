import React from 'react';
import { PlainButton } from '../../../common/atoms';

export const Chip = ({ active, onClick, children, title }) => (
  <PlainButton
    type="button" onClick={onClick} title={title}
    className={`ob-chip${active ? ' is-on' : ''}`}
  >
    {children}
  </PlainButton>
);
