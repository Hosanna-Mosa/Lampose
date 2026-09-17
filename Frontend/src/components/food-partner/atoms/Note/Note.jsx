import React from 'react';
import { Icon } from '../../../common/atoms/Icon/Icon';
import { Inline, Text } from '../../../common/atoms';

/* tone: ok | bad | info | warn */

export const Note = ({ tone = 'info', icon, children }) => (
  <Text className={`ob-note ob-note--${tone}`}>
    {icon && <Icon name={icon} className="ob-ico" />}
    <Inline>{children}</Inline>
  </Text>
);
