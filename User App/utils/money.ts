import { money } from '@/constants/tokens';

/**
 * Rupee formatting, in one place.
 *
 * Indian digit grouping is not the western one — ₹1,20,000, never ₹120,000 —
 * and getting it wrong is the kind of detail that tells a user the app was not
 * built for them.
 */
export function formatRupees(value: number): string {
  return `${money.symbol}${value.toLocaleString(money.locale)}`;
}

/** Formats a ceiling, marking the top of the range with a trailing +. */
export function formatCeiling(value: number, max: number, zeroLabel?: string): string {
  if (value === 0 && zeroLabel) return zeroLabel;
  return `${formatRupees(value)}${value >= max ? '+' : ''}`;
}

/** The short form used on filter chips: ₹8k, ₹30k+. */
export function formatShort(value: number, max: number): string {
  const short = value >= 1000 ? `${value / 1000}k` : `${value}`;
  return `${money.symbol}${short}${value >= max ? '+' : ''}`;
}

/** Digits only, for pairing with a separately-typeset ₹ symbol. */
export function formatDigits(value: number): string {
  return value.toLocaleString(money.locale);
}

/**
 * How stale a quoted price is.
 *
 * A price older than the freshness window must be re-fetched before it is
 * acted on — the number on screen is a snapshot, and the product's whole
 * argument is that it says so.
 */
export function freshnessLabel(quotedAt: Date, now: Date = new Date()): string {
  const minutes = Math.floor((now.getTime() - quotedAt.getTime()) / 60000);
  if (minutes < 1) return 'price updated just now';
  return `price updated ${minutes} min ago`;
}

export function isStale(quotedAt: Date, now: Date = new Date()): boolean {
  const minutes = (now.getTime() - quotedAt.getTime()) / 60000;
  return minutes > money.freshnessMaxAgeMinutes;
}
