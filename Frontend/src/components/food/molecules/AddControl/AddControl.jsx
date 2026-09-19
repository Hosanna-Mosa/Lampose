import React from 'react';
import { Box, Inline, PlainButton } from '../../../common/atoms';

/* ══ ADD / quantity ═══════════════════════════════════════════════════════
   One control with two faces: the word ADD until the dish is in the cart,
   then − n + on the same footprint, so the row does not reflow the moment
   somebody taps it.

   A sold-out dish gets a dead chip rather than a disabled ADD, because
   "Sold out" is an answer and a greyed button is a question.
   ════════════════════════════════════════════════════════════════════════ */

export function AddControl({
  qty = 0, onAdd, onLess, onMore, soldOut = false, closed = false, label = 'ADD',
}) {
  if (soldOut) return <Inline className="fd-add fd-add--dead">Sold out</Inline>;
  if (closed) return <Inline className="fd-add fd-add--dead">Closed</Inline>;

  if (!qty) {
    return (
      <PlainButton type="button" className="fd-add" onClick={onAdd}>{label}</PlainButton>
    );
  }

  return (
    <Box className="fd-qty">
      <PlainButton type="button" onClick={onLess} aria-label="One fewer">−</PlainButton>
      <Inline className="fd-qty__n">{qty}</Inline>
      <PlainButton type="button" onClick={onMore} aria-label="One more">+</PlainButton>
    </Box>
  );
}
