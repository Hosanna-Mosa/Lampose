import React from 'react';

export const Chevron = ({ back }) => (
  <svg className="lst-nav__ico" viewBox="0 0 24 24" aria-hidden="true">
    <path d={back ? 'M15 4 L7 12 L15 20' : 'M9 4 L17 12 L9 20'} />
  </svg>
);
