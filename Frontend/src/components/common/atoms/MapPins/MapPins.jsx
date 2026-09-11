import React from 'react';

export const MapPins = () => (
  <g transform="translate(1090 40)">
    <circle cx="160" cy="112" r="104" fill="none" stroke="var(--green)" strokeWidth="2" opacity=".25" />
    <circle cx="160" cy="112" r="70" fill="none" stroke="var(--green)" strokeWidth="2" opacity=".35" />
    <circle cx="160" cy="112" r="36" fill="var(--green-t)" />
    <path d="M40 190 C90 150 130 176 176 128 C214 88 250 96 286 70" fill="none"
      stroke="var(--ink)" strokeWidth="3" strokeDasharray="9 10" opacity=".4" />
    {[
      { x: 132, y: 62, fill: 'var(--ink)' },
      { x: 246, y: 30, fill: 'var(--green)' },
      { x: 34, y: 148, fill: 'var(--amber)' },
    ].map((p, i) => (
      <g key={i} transform={`translate(${p.x} ${p.y})`}>
        <path d="M22 0C9.8 0 0 9.8 0 22c0 15 22 38 22 38s22-23 22-38C44 9.8 34.2 0 22 0z" fill={p.fill} />
        <circle cx="22" cy="21" r="8.5" fill="#fff" />
      </g>
    ))}
  </g>
);
