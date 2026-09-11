import React from 'react';
import { BANNER_SETS } from '../../utils/bannerSets';
import { Slide } from '../../molecules/Slide/Slide';
import { Box } from '../../atoms';

/* ── Carousel ─────────────────────────────────────────────────────────── */
export function Banner({ set = 'home' }) {
  const slides = BANNER_SETS[set] || BANNER_SETS.home;
  return (
    <Box className="sec-banner">
      <Box className="sec-banner-track">
        {slides.map(s => <Slide key={s.lines[0]} {...s} />)}
      </Box>
    </Box>
  );
}
