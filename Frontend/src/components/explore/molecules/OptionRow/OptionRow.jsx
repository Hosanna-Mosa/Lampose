import React from 'react';
import { Icon } from '../../../common/atoms/Icon/Icon';
import { Emphasis, Inline, PlainButton } from '../../../common/atoms';

export function OptionRow({ icon, label, count, active, onClick }) {
  return (
    <PlainButton
      className={`xp-opt${active ? ' active' : ''}`}
      role="radio"
      aria-checked={active}
      disabled={!active && count === 0}
      onClick={onClick}
    >
      <Icon name={icon} className="exp-ico" />
      <Inline>{label}</Inline>
      <Emphasis>{count}</Emphasis>
    </PlainButton>
  );
}
