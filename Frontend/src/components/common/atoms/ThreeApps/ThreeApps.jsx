import React from 'react';

export const ThreeApps = () => (
  <g transform="translate(1064 46)">
    {[
      { x: 0, y: 26, h: 168, fill: 'var(--green)' },
      { x: 116, y: 0, h: 208, fill: 'var(--ink)' },
      { x: 232, y: 26, h: 168, fill: 'var(--amber-d, #b8860b)' },
    ].map((p, i) => (
      <g key={i} transform={`translate(${p.x} ${p.y})`}>
        <rect width="104" height={p.h} rx="20" fill={p.fill} />
        <rect x="7" y="7" width="90" height={p.h - 14} rx="15" fill="#fff" />
        {[0, 1, 2].map(r => (
          <g key={r} transform={`translate(17 ${24 + r * 34})`}>
            <rect width="70" height="24" rx="7" fill="#eef0f3" />
            <circle cx="13" cy="12" r="6" fill={p.fill} opacity=".85" />
            <rect x="26" y="8" width="34" height="6" rx="3" fill="var(--ink)" opacity=".3" />
          </g>
        ))}
      </g>
    ))}
  </g>
);
