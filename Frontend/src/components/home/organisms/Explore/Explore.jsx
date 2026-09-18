import React from 'react';
import { SecHead } from '../../../common/molecules/SecHead/SecHead';
import { SERVICES } from '../../../../data/home';
import { Icon } from '../../../common/atoms/Icon/Icon';
import { Anchor, Box, Heading, Inline, Region, Text } from '../../../common/atoms';
import { useDeckSpread } from '../../../common/hooks/useDeckSpread/useDeckSpread';

export function Explore() {
  const { spread, containerRef } = useDeckSpread();

  return (
    <Region id="explore" style={{ padding: '2rem 0', '--pcard-w': '290px', '--pcard-h': '360px', '--pcard-gap': '20px' }}>
      <Box className="sec-inner">
        <SecHead
          tag="Explore Lampose" title="Everything, one" em="click away."
          sub="Whether you want a room, a meal, or to know if we're in your city yet."
          mb="1rem"
        />
        
        <Box 
          ref={containerRef}
          className={`partner-deck-container ${spread ? 'is-spread' : ''}`}
          style={{ marginTop: '1rem' }}
        >
          <Box className="partner-deck">
            {/* Anchors rather than router links: both cards point at sections
                of this same page, and a <Link> would re-render the page the
                visitor is already on to move them a screen or two up. The
                shell's scroll-to-top only fires on a pathname change, so a
                hash lands where it says. */}
            {SERVICES.map((s, i) => (
              <Anchor
                href={s.href}
                onClick={(e) => {
                  /* Smooth where the browser allows it, and never a broken
                     jump: the native hash behaviour is the fallback if the
                     section is not on the page for any reason. */
                  const target = document.querySelector(s.href);
                  if (!target) return;
                  e.preventDefault();
                  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className={`svc-card deck-card card-${i}`} 
                key={s.title} 
                style={{ 
                  '--i': String(i), 
                  '--card-clr': s.color,
                  textDecoration: 'none', 
                  color: 'inherit', 
                  display: 'block' 
                }}
              >
                <Box
                  className="svc-icon-wrap"
                  style={{ '--icon-bg': s.iconBg, '--icon-hover': s.iconHover }}
                >
                  <Icon name={s.icon} />
                </Box>
                <Heading level={3} className="svc-h3">{s.title}</Heading>
                <Text className="svc-p">{s.body}</Text>
                <Box className="svc-tag">{s.cta} <Inline className="svc-arrow">→</Inline></Box>
                <Inline className="svc-num">{s.no}</Inline>
              </Anchor>
            ))}
          </Box>
        </Box>
        
        <Box className="deck-hint">
          <Inline className="hint-dot" />
          {spread ? 'Tap or hover to stack cards' : 'Tap or hover the cards to spread them out'}
        </Box>
      </Box>
    </Region>
  );
}
