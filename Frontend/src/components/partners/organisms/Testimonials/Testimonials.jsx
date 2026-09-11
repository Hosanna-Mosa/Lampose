import React from 'react';
import { useState, useRef, useCallback, useEffect } from 'react';
import { REDUCED } from '../../../../hooks/useSite';
import { TESTIMONIALS } from '../../utils/testimonials';
import { SecHead } from '../../../common/molecules/SecHead/SecHead';
import { Box, Inline, PlainButton, Region, Text } from '../../../common/atoms';

export function Testimonials() {
  const [i, setI] = useState(0);
  const track = useRef(null);

  const position = useCallback(index => {
    const el = track.current;
    const card = el?.querySelector('.tcard');
    if (!card) return;
    el.style.transform = `translateX(-${index * (card.offsetWidth + 24)}px)`;
  }, []);

  useEffect(() => { position(i); }, [i, position]);

  useEffect(() => {
    const onResize = () => position(i);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [i, position]);

  useEffect(() => {
    if (REDUCED) return;
    const t = setInterval(() => setI(p => (p + 1) % TESTIMONIALS.length), 4200);
    return () => clearInterval(t);
  }, [i]);

  const go = step => setI(p => (p + step + TESTIMONIALS.length) % TESTIMONIALS.length);

  return (
    <Region id="testimonials">
      <Box className="sec-inner">
        <SecHead tag="Voices" title="What people said" em="after checking out." />

        <Box className="tc-wrap">
          <Box className="tc" id="tc" ref={track}>
            {TESTIMONIALS.map(t => (
              <Box className="tcard" key={t.name}>
                <Box className="stars">★★★★★</Box>
                <Text className="tq">&ldquo;{t.q}&rdquo;</Text>
                <Box className="tau">
                  <Box className="avatar"><Inline className="tn">{t.tn}</Inline></Box>
                  <Box>
                    <Box className="tname">{t.name}</Box>
                    <Box className="trole">{t.role}</Box>
                  </Box>
                </Box>
              </Box>
            ))}
          </Box>
        </Box>

        <Box style={{ display: 'flex', justifyContent: 'center', gap: '1rem', alignItems: 'center' }}>
          <PlainButton className="tbtn" onClick={() => go(-1)} aria-label="Previous">←</PlainButton>
          <Box id="tdots" className="tdots">
            {TESTIMONIALS.map((t, n) => (
              <Box
                key={t.name} className={`tdot${n === i ? ' active' : ''}`}
                onClick={() => setI(n)}
              />
            ))}
          </Box>
          <PlainButton className="tbtn" onClick={() => go(1)} aria-label="Next">→</PlainButton>
        </Box>
      </Box>
    </Region>
  );
}
