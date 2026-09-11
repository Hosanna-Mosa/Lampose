import React from 'react';
import { useStatDots } from '../../../../hooks/useSite';
import { SecHead } from '../../../common/molecules/SecHead/SecHead';
import { STATS } from '../../../../data/home';
import { StatCard } from '../../molecules/StatCard/StatCard';
import { Box, Region } from '../../../common/atoms';

export function Stats() {
  const dots = useStatDots(8);

  return (
    <Region id="stats" ref={dots}>
      <Box className="sec-inner">
        <SecHead
          tag="By the numbers" title="Growing," em="city by city."
          sub="Where Lampose is today — counted, not estimated."
          mb="1rem"
        />
        <Box className="stats-grid">
          {STATS.map((s, i) => <StatCard key={s.label} stat={s} delay={i * 80} index={i} />)}
        </Box>
      </Box>
    </Region>
  );
}
