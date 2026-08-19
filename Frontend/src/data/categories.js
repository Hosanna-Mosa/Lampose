/* ══════════════════════════════════════════════════════════════════════════
   Presentation for the four property categories.

   The API returns a CODE — 'PG_HOSTEL', 'BACHELOR', 'HOTEL', 'COLIVE' — and
   this file says how each should look and where it should sit. The codes
   themselves are defined once, server-side, in
   Backend/src/shared/constants/categories.js.

   Labels live here rather than coming down with the payload because a label
   is presentation: this site says "PG / Hostel" with spaces around the slash
   because it has the room, and the mobile app's 2x2 tile does not.

   Not a list of what exists — the pages derive that from the listings the API
   returns, so a category added tomorrow needs no change here to APPEAR. It
   needs one to look right, and falls back sensibly until it gets one.
   ══════════════════════════════════════════════════════════════════════════ */

/* Icon names must exist in components/Icon.jsx; an unknown category falls
   back to the room glyph rather than breaking the row it sits in. */
export const CATEGORY_ICONS = {
  PG_HOSTEL: 'users',
  BACHELOR: 'stay',
  COLIVE: 'stay',
  HOTEL: 'grid',
};

/**
 * What a person reads.
 *
 * An unknown code falls through to the code itself rather than to a blank —
 * a tab labelled "PG_HOSTEL" is ugly and debuggable, and a tab labelled
 * nothing is neither.
 */
export const CATEGORY_LABELS = {
  PG_HOSTEL: 'PG / Hostel',
  BACHELOR: 'Bachelor',
  COLIVE: 'House / Co-live',
  HOTEL: 'Hotels',
};

export const labelForCategory = category => CATEGORY_LABELS[category] || category || 'Stays';

export const iconForCategory = category => CATEGORY_ICONS[category] || 'stay';

/* Chosen rather than alphabetical: the filters should lead with what people
   search for most, not with whatever starts with a B. A category that is not
   in this list sorts to the end by name instead of jumping to the front. */
const CATEGORY_ORDER = ['PG_HOSTEL', 'BACHELOR', 'COLIVE', 'HOTEL'];

export const byCategoryOrder = (a, b) => {
  const ia = CATEGORY_ORDER.indexOf(a);
  const ib = CATEGORY_ORDER.indexOf(b);
  if (ia === -1 && ib === -1) return a.localeCompare(b);
  if (ia === -1) return 1;
  if (ib === -1) return -1;
  return ia - ib;
};
