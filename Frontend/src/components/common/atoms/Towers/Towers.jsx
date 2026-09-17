import React from 'react';

export const Towers = () => (
  <g transform="translate(1090 40)">
    <rect x="0" y="96" width="86" height="128" rx="8" fill="var(--green)" opacity=".9" />
    <rect x="98" y="40" width="96" height="184" rx="8" fill="var(--ink)" />
    <rect x="206" y="120" width="78" height="104" rx="8" fill="var(--green-m, #22a355)" opacity=".85" />
    {[0, 1, 2, 3].map(r =>
      [0, 1, 2].map(c => (
        <rect
          key={`${r}-${c}`} x={112 + c * 26} y={58 + r * 32}
          width="14" height="16" rx="3" fill="var(--amber)" opacity={r === 1 && c === 1 ? '.95' : '.5'}
        />
      ))
    )}
    <g transform="translate(232 46)">
      <circle cx="26" cy="26" r="26" fill="var(--amber)" />
      <path d="M17 27l6 6 12-13" fill="none" stroke="var(--ink)" strokeWidth="4"
        strokeLinecap="round" strokeLinejoin="round" />
    </g>
    <rect x="-20" y="224" width="330" height="10" rx="5" fill="var(--ink)" opacity=".12" />
  </g>
);
