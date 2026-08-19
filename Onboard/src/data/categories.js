/* ══════════════════════════════════════════════════════════════════════════
   Codes to words, for the onboarding app.

   The four codes are defined once, server-side, in
   Backend/src/shared/constants/categories.js — that module owns the list and
   the schema enum is built from it. This file only says how each should read
   on a field agent's screen.
   ══════════════════════════════════════════════════════════════════════════ */

export const CATEGORY_LABELS = {
  PG_HOSTEL: 'PG / Hostel',
  BACHELOR: 'Bachelor',
  HOTEL: 'Hotels',
  COLIVE: 'House / Co-live',
};

/**
 * An unknown code renders as itself rather than as a blank.
 *
 * A row onboarded by a newer build, or one that predates a migration, should
 * look wrong on screen instead of looking like it has no category at all —
 * the first is a bug report, the second is invisible.
 */
export const labelForCategory = (code) => CATEGORY_LABELS[code] || code || '—';
