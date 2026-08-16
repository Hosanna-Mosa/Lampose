/* ══════════════════════════════════════════════════════════════════════════
   Presentation for the categories the onboarding panel offers.

   Not a list of what exists — the pages derive that from the listings the API
   returns, so a category the panel adds tomorrow needs no change here. This
   file only says how a known category should look and where it should sit.
   ══════════════════════════════════════════════════════════════════════════ */

/* Icon names must exist in components/Icon.jsx; an unknown category falls
   back to the room glyph rather than breaking the row it sits in. */
export const CATEGORY_ICONS = {
  PG: 'stay',
  Hostel: 'users',
  Dormitory: 'grid',
  'Bachelor Room': 'stay',
};

export const iconForCategory = category => CATEGORY_ICONS[category] || 'stay';

/* Chosen rather than alphabetical: the filters should lead with what people
   search for most, not with whatever starts with a B. A category that is not
   in this list sorts to the end by name instead of jumping to the front. */
const CATEGORY_ORDER = ['Hostel', 'PG', 'Bachelor Room', 'Dormitory'];

export const byCategoryOrder = (a, b) => {
  const ia = CATEGORY_ORDER.indexOf(a);
  const ib = CATEGORY_ORDER.indexOf(b);
  if (ia === -1 && ib === -1) return a.localeCompare(b);
  if (ia === -1) return 1;
  if (ib === -1) return -1;
  return ia - ib;
};
