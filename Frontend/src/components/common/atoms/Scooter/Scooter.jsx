import React from 'react';

export const Scooter = () => (
  <g transform="translate(1080 56)">
    <path d="M6 168 C70 118 150 196 230 132 C270 100 300 104 330 118" fill="none"
      stroke="var(--green)" strokeWidth="4" strokeDasharray="12 12" strokeLinecap="round" opacity=".55" />
    <g transform="translate(20 108)">
      <circle cx="30" cy="72" r="26" fill="none" stroke="var(--ink)" strokeWidth="9" />
      <circle cx="148" cy="72" r="26" fill="none" stroke="var(--ink)" strokeWidth="9" />
      <path d="M30 72h34l30-44h34" fill="none" stroke="var(--ink)" strokeWidth="9"
        strokeLinecap="round" strokeLinejoin="round" />
      <path d="M64 72h84l-14-34" fill="none" stroke="var(--ink)" strokeWidth="9"
        strokeLinecap="round" strokeLinejoin="round" />
      <rect x="96" y="-4" width="56" height="46" rx="10" fill="var(--green)" />
      <rect x="112" y="14" width="24" height="6" rx="3" fill="#fff" opacity=".9" />
    </g>
    <g transform="translate(268 20)">
      <path d="M26 0C11.6 0 0 11.6 0 26c0 18 26 44 26 44s26-26 26-44C52 11.6 40.4 0 26 0z" fill="var(--amber)" />
      <circle cx="26" cy="25" r="10" fill="var(--ink)" />
    </g>
  </g>
);
