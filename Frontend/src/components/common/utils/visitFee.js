/* ══════════════════════════════════════════════════════════════════════════
   What an assisted visit costs on this listing, for the layout picked.

   The server prices a Bachelor or House / Co-live visit by LAYOUT and a
   Commercial one by category (Backend: modules/visitFees). The listing
   carries the answer for every layout it offers in `visitToken.byLayout`,
   so nothing here knows a price — it only looks one up.

     visitFeeFor(listing, label)   paise for that layout, or the listing's
                                   single fee when it has no layouts
     visitFeeLabel(listing)        "₹999", or "from ₹299" when layouts differ
   ══════════════════════════════════════════════════════════════════════════ */

const inr = (paise) => `₹${Math.round((Number(paise) || 0) / 100).toLocaleString('en-IN')}`;

export const chargesVisitFee = (listing) =>
  listing?.visitToken?.required === true && listing.visitToken.purpose === 'assisted_visit';

export const visitFeeFor = (listing, label) => {
  const token = listing?.visitToken;
  if (!token || token.purpose !== 'assisted_visit') return null;
  const row = (token.byLayout || []).find((r) => r.label === label);
  if (row) return row.amountPaise;
  /* No pick yet on a listing whose layouts differ: there is no single answer,
     and quoting the lowest as if it were THE fee would be wrong. */
  if (token.varies) return null;
  return token.amountPaise || null;
};

export const visitFeeLabel = (listing, label) => {
  const exact = visitFeeFor(listing, label);
  if (exact) return inr(exact);
  const from = listing?.visitToken?.amountPaise;
  return from ? `from ${inr(from)}` : null;
};

export const formatFee = inr;
