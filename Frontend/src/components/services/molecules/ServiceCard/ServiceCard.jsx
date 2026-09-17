import React from 'react';
import { useTilt } from '../../../../hooks/useSite';
import { Icon } from '../../../common/atoms/Icon/Icon';
import { Box, Heading, Inline, Text } from '../../../common/atoms';

export function ServiceCard({ card, open, onToggle, delay }) {
  const tilt = useTilt();

  return (
    <Box className="reveal" style={{ transitionDelay: `${delay}ms`, height: '100%' }}>
      <Box
        className={`svc-card${open ? ' svc-active' : ''}`}
        ref={tilt}
        onClick={onToggle}
        style={{ '--card-clr': card.color, height: '100%' }}
      >
        <Box
          className="svc-icon-wrap"
          style={{ '--icon-bg': card.iconBg, '--icon-hover': card.iconHover }}
        >
          <Icon name={card.icon} />
        </Box>
        <Heading level={3} className="svc-h3">{card.title}</Heading>
        <Text className="svc-p">{card.body}</Text>
        <Box className="svc-tag">{card.cta} <Inline className="svc-arrow">→</Inline></Box>
        <Box className="tilt-shine" />
      </Box>
    </Box>
  );
}
