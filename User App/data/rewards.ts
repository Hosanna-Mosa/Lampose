/**
 * What a confirmed request unlocks.
 *
 * Server-owned in production — an offer is a commercial promise with an expiry
 * and an eligibility rule behind it, and a client that hardcodes one will keep
 * showing it a week after finance pulled it. This module is the shape and the
 * placeholder content, nothing more.
 *
 * ## These are read-only here
 *
 * Nothing on the confirmation screen applies an offer. The screen is a wait;
 * the student has not paid anything and cannot yet choose how to. Showing what
 * confirming earns is encouragement. Letting them *pick* one before the owner
 * has even answered would be collecting a decision we might have to take back,
 * which is the worst possible moment to take something back.
 *
 * The choosing happens on the payment screen, against a real total.
 *
 * ## Nothing here is a countdown
 *
 * No "expires in 4 minutes", no scarcity. The student is already sitting under
 * a draining bar waiting on a stranger; adding a second clock they can lose
 * would make the screen adversarial.
 */

export type ConfirmationReward = {
  id: string;
  /**
   * The offer itself, in the fewest words that stay true.
   *
   * No per-row icon. The set is capped at 22 deliberately, none of them means
   * "discount", and three rows each carrying the same tick is a list — which is
   * what this is.
   */
  label: string;
  /** The condition. Always present — an offer with hidden terms is a trap. */
  terms: string;
};

export const confirmationRewards: readonly ConfirmationReward[] = [
  {
    id: 'first-month',
    label: '₹500 off your first month',
    terms: 'Applied at payment. First booking only.',
  },
  {
    id: 'deposit-split',
    label: 'Split the deposit over two months',
    terms: 'On stays of three months or longer.',
  },
  {
    id: 'no-service-fee',
    label: 'No service fee on this booking',
    terms: 'Automatic while the place is newly listed.',
  },
];
