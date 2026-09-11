import React from 'react';
import { useStatCard } from '../../../../hooks/useSite';
import { Box, Inline } from '../../../common/atoms';

export function StatCard({ stat, delay, index }) {
  const { card, num, ringPath } = useStatCard(stat.target, stat.pct, stat.suffix);

  /* Where the progress arc ends, so a marker can sit on it. The <svg> is
     rotated -90deg, so angle 0 in this space already points at the top —
     the same place the arc starts. */
  const angle = (stat.pct / 100) * Math.PI * 2;
  const capX = 40 + 35 * Math.cos(angle);
  const capY = 40 + 35 * Math.sin(angle);

  return (
    <Box
      className="stat-card reveal" ref={card}
      style={{ transitionDelay: `${delay}ms`, '--i': String(index) }}
    >
      <Box className="stat-ring-wrap">
        <svg className="sring" viewBox="0 0 80 80">
          <circle className="sr-bg" cx="40" cy="40" r="35" />
          <circle className="sr-fg" cx="40" cy="40" r="35" ref={ringPath} />
          {/* Marker on the end of the arc — the one thing that keeps moving
              once the count has finished, so the card never looks frozen. */}
          <circle className="sr-halo" cx={capX} cy={capY} r="7" />
          <circle className="sr-cap" cx={capX} cy={capY} r="3.6" />
        </svg>
        <Box className="sr-lbl">{stat.ring}</Box>
      </Box>
      <Inline className="stat-num" ref={num}>0</Inline>
      <Box className="stat-lbl">{stat.label}</Box>
    </Box>
  );
}
