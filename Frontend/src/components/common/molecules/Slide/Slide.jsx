import React from 'react';
import { VB } from '../../utils/bannerArt';
import { Phone } from '../../atoms/Phone/Phone';
import { Towers } from '../../atoms/Towers/Towers';
import { Scooter } from '../../atoms/Scooter/Scooter';
import { Cards } from '../../atoms/Cards/Cards';
import { ThreeApps } from '../../atoms/ThreeApps/ThreeApps';
import { MapPins } from '../../atoms/MapPins/MapPins';

/* ══════════════════════════════════════════════════════════════════════════
   Banner artwork — drawn inline rather than loaded.

   Inline SVG (not <img src="…svg">) because an <img> is an isolated document:
   it cannot see the page's webfonts or CSS custom properties. Drawn here, the
   banners use the real Plus Jakarta Sans and follow the theme tokens, so they
   restyle with the rest of the site instead of being baked pictures.
   ══════════════════════════════════════════════════════════════════════════ */

/* Which art each slide names. Slide's own dispatch table, so it lives
   beside Slide rather than in utils. */
const ART = {
  phone: Phone, towers: Towers, scooter: Scooter,
  cards: Cards, apps: ThreeApps, map: MapPins,
};

export function Slide({ eyebrow, lines, accentFrom = 1, points, art, tint = 'green' }) {
  const Art = ART[art] || Phone;
  const wash = {
    green: ['#ffffff', 'var(--green-t)'],
    amber: ['#ffffff', 'var(--amber-t)'],
    grey: ['#ffffff', '#eef0f3'],
  }[tint];

  const gid = `bw-${art}-${tint}`;

  return (
    <svg
      className="sec-banner-slide" viewBox={`0 0 ${VB.w} ${VB.h}`}
      preserveAspectRatio="xMinYMid slice" role="img"
      aria-label={lines.join(' ')}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={wash[0]} />
          <stop offset="1" stopColor={wash[1]} />
        </linearGradient>
        <pattern id={`${gid}-dots`} width="26" height="26" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.6" fill="var(--ink)" opacity=".07" />
        </pattern>
      </defs>

      <rect width={VB.w} height={VB.h} fill={`url(#${gid})`} />
      <rect width={VB.w} height={VB.h} fill={`url(#${gid}-dots)`} />

      {/* eyebrow pill */}
      <g transform="translate(70 44)">
        <rect width={eyebrow.length * 8.6 + 44} height="34" rx="17" fill="#fff" stroke="var(--border)" />
        <circle cx="22" cy="17" r="5" fill="var(--green)" />
        <text
          x="36" y="22" fill="var(--ink-light)"
          style={{ font: '600 12px var(--font-body)', letterSpacing: '.12em' }}
        >
          {eyebrow.toUpperCase()}
        </text>
      </g>

      {/* headline */}
      {lines.map((line, i) => (
        <text
          key={line} x="70" y={132 + i * 56}
          fill={i >= accentFrom ? 'var(--green)' : 'var(--ink)'}
          style={{ font: '800 46px var(--font-head)', letterSpacing: '-.03em' }}
        >
          {line}
        </text>
      ))}

      {/* feature points */}
      <g transform="translate(70 224)">
        {points.map((p, i) => (
          <g key={p} transform={`translate(${i * 224} 0)`}>
            <circle cx="14" cy="14" r="14" fill="#fff" stroke="var(--border)" />
            <circle cx="14" cy="14" r="5" fill="var(--green)" />
            <text
              x="38" y="19" fill="var(--ink-mid)"
              style={{ font: '600 15px var(--font-body)' }}
            >
              {p}
            </text>
          </g>
        ))}
      </g>

      <Art />
    </svg>
  );
}
