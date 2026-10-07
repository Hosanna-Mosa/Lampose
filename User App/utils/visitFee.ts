import type { Listing } from '@/types/listing';
import { formatRupees } from '@/utils/money';

/**
 * What an assisted visit costs on this listing, for the option picked.
 *
 * The server prices a Bachelor or House / Co-live visit by LAYOUT and a
 * Commercial one by category (Backend: modules/visitFees), and sends the fee
 * for every layout the listing offers in `visitToken.byLayout`. Nothing here
 * knows a price — it only looks one up, so the app and the charge agree.
 *
 * `optionId` is the sharing option's id (what the listing screen stores);
 * it is matched to its label, which is what the server keys fees by.
 */
export function visitFeePaise(listing: Listing | undefined, optionId?: string | null): number | null {
  const token = listing?.visitToken;
  if (!token?.required || token.purpose !== 'assisted_visit') return null;

  const label = optionId
    ? listing?.sharingOptions?.find((o) => o.id === optionId)?.label ?? null
    : null;
  const row = label ? token.byLayout?.find((r) => r.label === label) : undefined;
  if (row) return row.amountPaise;

  /* Layouts that differ and nothing picked: there is no single answer. */
  if (token.varies) return null;
  return token.amountPaise ?? null;
}

/** "₹699", or "from ₹199" when layouts differ and none is picked yet. */
export function visitFeeLabel(listing: Listing | undefined, optionId?: string | null): string | null {
  const exact = visitFeePaise(listing, optionId);
  if (exact) return formatRupees(exact / 100);
  const from = listing?.visitToken?.amountPaise;
  return from ? `from ${formatRupees(from / 100)}` : null;
}
