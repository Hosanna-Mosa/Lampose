/**
 * Platform commission — the one place the rate lives.
 *
 * The design's earnings breakdown shows ₹400 on ₹6,800 and ₹600 on ₹10,200,
 * which is exactly 1/17 (5.88%) in both cases. That's what you get when round
 * gross and round fee numbers are picked by hand, not a rate a platform would
 * publish. Stating 6% and deriving everything from it means the arithmetic is
 * consistent everywhere, at the cost of a few rupees against those mockups.
 */
export const PLATFORM_FEE_RATE = 0.06;

export function feeOn(gross: number): number {
  return Math.round(gross * PLATFORM_FEE_RATE);
}

/** What actually reaches the owner's bank. */
export function netOn(gross: number): number {
  return gross - feeOn(gross);
}

export const FEE_LABEL = `Platform fee (${Math.round(PLATFORM_FEE_RATE * 100)}%)`;
