import React from 'react';
import { Inline } from '../../atoms';
import { availability } from '../../organisms/ListingCard/ListingCard';

/* The "N rooms free" pill, or nothing when the listing does not say.

   ListingCard and the Listing page each carried a byte-identical copy of this
   as an inline arrow-function expression. Six lines is small, but the two
   copies encode the same rule twice — that a full listing wears the muted
   class and an available one the dark class — and that is exactly the kind of
   pair that drifts.

   `availability` still lives with ListingCard, which is where it was and where
   the other caller imports it from. Moving it to utils would be the tidier
   layering, but it would mean rewriting an import in a page that this phase
   has no other reason to touch. */
export const AvailabilityChip = ({ item }) => {
  const free = availability(item);
  if (!free) return null;
  return (
    <Inline className={`exp-chip ${free.full ? 'exp-chip--muted' : 'exp-chip--dark'}`}>
      {free.label}
    </Inline>
  );
};
