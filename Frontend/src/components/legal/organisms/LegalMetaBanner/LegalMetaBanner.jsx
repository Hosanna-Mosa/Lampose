import React from 'react';
import { Box, Inline } from '../../../common/atoms';

/* The band of ENTITY / APPLICATION / VERSION pairs at the top of each legal
   document. Privacy, Terms and Child Safety each carried their own copy of
   this markup — the same four rows, the same classes, different words.

   The last row wears `meta-badge` on all three, so `badge` is a flag rather
   than a free-form class: there is one variant, and naming it stops a fourth
   page inventing a fifth. */
export const LegalMetaBanner = ({ items }) => (
  <Box className="privacy-meta-banner">
    {items.map(({ label, value, badge }) => (
      <Box className="meta-item" key={label}>
        <Inline className="meta-label">{label}</Inline>
        <Inline className={badge ? 'meta-val meta-badge' : 'meta-val'}>{value}</Inline>
      </Box>
    ))}
  </Box>
);
