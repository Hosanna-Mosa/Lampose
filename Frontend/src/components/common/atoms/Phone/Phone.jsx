import React from 'react';

export const Phone = () => (
  <g transform="translate(1120 32)">
    <rect x="70" y="0" width="150" height="236" rx="26" fill="var(--ink)" />
    <rect x="78" y="8" width="134" height="220" rx="20" fill="#fff" />
    <rect x="126" y="16" width="38" height="7" rx="3.5" fill="var(--ink)" opacity=".8" />
    {[
      { y: 34, c: 'var(--green-t)', d: 'var(--green)' },
      { y: 92, c: 'var(--amber-t)', d: 'var(--amber-d, #b8860b)' },
      { y: 150, c: '#eef0f3', d: 'var(--ink)' },
    ].map((r, i) => (
      <g key={i} transform={`translate(90 ${r.y + 8})`}>
        <rect width="110" height="48" rx="12" fill={r.c} />
        <circle cx="26" cy="24" r="12" fill={r.d} opacity=".9" />
        <rect x="48" y="15" width="48" height="7" rx="3.5" fill="var(--ink)" opacity=".7" />
        <rect x="48" y="28" width="30" height="5" rx="2.5" fill="var(--ink)" opacity=".35" />
      </g>
    ))}
    <rect x="122" y="214" width="46" height="5" rx="2.5" fill="var(--ink)" opacity=".3" />
  </g>
);
