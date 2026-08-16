/**
 * The booking request — the emotional centre of the product.
 *
 * Every screen in this flow is written for two readers at once: a nervous
 * eighteen-year-old and the parent looking over their shoulder. Nothing here
 * says "sorry", and one sentence — "nothing is charged today" — appears four
 * separate times on purpose. A parent scanning their child's phone reads one
 * line, and it should be that one.
 */

/**
 * How long the owner has to answer.
 *
 * ONE constant, because this number is user-facing in at least four places —
 * the waiting ring, the expired screen and the push copy —
 * and they must never disagree.
 *
 * NOTE, unresolved: the Batch 9 sheet states 30 minutes and its expired screen
 * says "the 30-minute window closed", while `constants/copy.ts` (shipped in
 * UNCONFIRMED — the product owner has not settled this yet (asked 14 Aug 2026).
 *
 * Three sources disagreed: Batch 9 says 30 minutes, `copy.ts` told students 4
 * hours, and Batch 4 describes the clock as "30-60 min · patient". Those cannot
 * all be true, and until Batch 12 two of them were shipping simultaneously —
 * the code counted down 30 minutes while the Bookings empty state promised 4
 * hours.
 *
 * This constant is now the ONLY place the number exists. Every countdown,
 * threshold and user-facing string derives from it, so when the real answer
 * arrives it is a one-line change and nothing can drift back apart.
 *
 * When the server starts sending a per-request deadline, this becomes a
 * fallback for the pre-response estimate only. The live timer must always run
 * on the absolute server timestamp, never on this.
 */
export const OWNER_WINDOW_MINUTES = 3;

/** The same window in the unit copy uses. Never write the number in a string. */
export const ownerWindowLabel = (): string =>
  OWNER_WINDOW_MINUTES >= 60
    ? `${Math.round(OWNER_WINDOW_MINUTES / 60)} hour${OWNER_WINDOW_MINUTES >= 120 ? 's' : ''}`
    : `${OWNER_WINDOW_MINUTES} minutes`;

/**
 * The same window in seconds, which is what a draining bar needs.
 *
 * There is exactly one clock. An earlier draft had two — a short one for the
 * screen and a long one for the request — on the assumption that killing a
 * request in three minutes would kill most bookings with it. The client was
 * clear: three minutes is the deadline, and running out cancels the request.
 *
 * Derived rather than written twice, so the bar and the copy can never disagree
 * about how long an owner has.
 *
 * The consequence is worth stating plainly: an owner who is asleep, driving or
 * away from their phone loses the booking. That is a business decision, not a
 * bug, but it is the number to revisit first if acceptance rates are low.
 */
export const SCREEN_WAIT_SECONDS = OWNER_WINDOW_MINUTES * 60;

/** How long payment stays open once the owner accepts. */
export const PAYMENT_WINDOW_MINUTES = 120;

/* ------------------------------------------------------------------ *
 * The quote
 * ------------------------------------------------------------------ */

/**
 * A server object with an id. The client renders it and never computes it —
 * every figure carries when it was quoted, so the UI is visibly reporting
 * rather than asserting.
 *
 * On submit the quote FREEZES: the accepted request preserves this exact id, so
 * the owner accepts the price the student saw. That is the promise the whole
 * flow rests on.
 */
export type Quote = {
  id: string;
  listingId: string;
  propertyName: string;
  sharingLabel: string;
  gender: string;
  locality: string;
  moveInLabel: string;

  rent: number;
  deposit: number;
  depositMonths: number;
  joiningCharge: number;
  lamposeFee: number;
  discount: number;

  /** Absolute server timestamp. The quote's validity, never a duration. */
  validUntil: string;
  /** "quoted at 6:12 pm" — the UI reports, it does not assert. */
  quotedAtLabel: string;

  /**
   * Set when a refresh returned a different price. Both numbers are shown, the
   * old struck through — silently swapping a number the user has already read
   * destroys more trust than the rise itself.
   */
  previous?: { rent?: number; deposit?: number };
};

export function quoteTotal(quote: Quote): number {
  return quote.rent + quote.deposit + quote.joiningCharge + quote.lamposeFee - quote.discount;
}

/** What comes back at the end. The number that makes the total bearable. */
export function refundable(quote: Quote): number {
  return quote.deposit;
}

/* ------------------------------------------------------------------ *
 * Tenant details
 * ------------------------------------------------------------------ */

export type TenantDetails = {
  name: string;
  phone: string;
  /** LAMPOSE only, in an emergency. Never given to the owner. */
  guardianPhone: string;
  /** Required by law for the owner's tenant register. Masked to last 4. */
  idLast4: string;
  /** Passed on as a note, not a promise. */
  note: string;
};

export const EMPTY_TENANT: TenantDetails = {
  name: '',
  phone: '',
  guardianPhone: '',
  idLast4: '',
  note: '',
};

/** Who sees each field, and why. Rendered next to the field, never in a footer. */
export const FIELD_AUDIENCE: Record<keyof TenantDetails, string> = {
  name: 'The owner sees this · needed to let you in at the gate',
  phone: 'The owner sees this · only after she accepts',
  guardianPhone: 'LAMPOSE only, in an emergency. Never given to the owner, never used for marketing.',
  idLast4: "Required by law for the owner's tenant register. Shown to her only at move-in.",
  note: 'Passed on to the owner as a note, not as a promise.',
};

export function tenantIssues(details: TenantDetails): Partial<Record<keyof TenantDetails, string>> {
  const issues: Partial<Record<keyof TenantDetails, string>> = {};

  if (details.name.trim().length > 0 && details.name.trim().length < 2) {
    issues.name = 'That looks too short.';
  }

  // The common workaround, and it makes the field useless in the emergency it
  // exists for. Caught in place rather than at submit.
  const own = details.phone.replace(/\D/g, '').slice(-10);
  const guardian = details.guardianPhone.replace(/\D/g, '').slice(-10);
  if (guardian.length === 10 && guardian === own) {
    issues.guardianPhone =
      'This is your own number. It needs to be someone we can reach if we cannot reach you.';
  } else if (guardian.length > 0 && guardian.length < 10) {
    issues.guardianPhone = 'A ten-digit mobile number.';
  }

  if (details.idLast4.length > 0 && details.idLast4.length < 4) {
    issues.idLast4 = 'The last four digits.';
  }

  return issues;
}

export function tenantReady(details: TenantDetails): boolean {
  const issues = tenantIssues(details);
  return (
    details.name.trim().length > 1 &&
    details.idLast4.length === 4 &&
    Object.keys(issues).length === 0
  );
}

/* ------------------------------------------------------------------ *
 * Outcomes
 * ------------------------------------------------------------------ */

export type RequestOutcome = 'waiting' | 'accepted' | 'rejected' | 'expired';
