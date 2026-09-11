import React from 'react';

export const Cards = () => (
  <g transform="translate(1096 44)">
    <rect x="18" y="26" width="300" height="80" rx="18" fill="#fff" stroke="var(--border)" opacity=".7" />
    <g transform="translate(0 62)">
      <rect width="300" height="96" rx="18" fill="#fff" stroke="var(--border)" />
      <circle cx="48" cy="48" r="24" fill="var(--green-t)" />
      <path d="M38 48l7 8 15-17" fill="none" stroke="var(--green)" strokeWidth="5"
        strokeLinecap="round" strokeLinejoin="round" />
      <rect x="86" y="32" width="150" height="11" rx="5.5" fill="var(--ink)" opacity=".78" />
      <rect x="86" y="53" width="96" height="9" rx="4.5" fill="var(--ink)" opacity=".32" />
    </g>
    <g transform="translate(150 170)">
      <rect width="168" height="56" rx="16" fill="var(--ink)" />
      <rect x="26" y="24" width="80" height="9" rx="4.5" fill="#fff" opacity=".92" />
      <circle cx="132" cy="28" r="12" fill="var(--amber)" />
    </g>
  </g>
);
