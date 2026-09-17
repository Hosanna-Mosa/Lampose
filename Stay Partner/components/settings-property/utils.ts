/*
 * Helpers and types belonging to app/settings/property.tsx, used by the components
 * extracted from it. §4: "shared helpers to its utils".
 */
import { formatDateLong, formatINR } from '@/lib/format';

export const dash = (value: unknown): string => {
  if (value === null || value === undefined) return 'Not recorded';
  const text = String(value).trim();
  return text.length ? text : 'Not recorded';
};

export const money = (value: unknown): string => {
  const n = Number(value);
  /* `0` is a real deposit and must not be swallowed by a falsy check — a
     zero-deposit property is a selling point, not a missing field. */
  return Number.isFinite(n) && value !== null && value !== undefined
    ? formatINR(n)
    : 'Not recorded';
};

/**
 * "Aug 15, 2026" rather than "2026-08-15T07:16:53.330Z".
 *
 * The raw ISO string was going straight onto the row. It is unreadable, it is
 * three times too wide for a value column, and the milliseconds and timezone
 * are noise on a date whose only job is to say roughly when the listing went
 * up.
 */

export const listedOn = (value: unknown): string => {
  if (!value) return 'Not recorded';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? 'Not recorded' : formatDateLong(date);
};
