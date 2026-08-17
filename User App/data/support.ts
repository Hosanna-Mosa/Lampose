import type { ReportReason, TicketCategory } from '@/types/support';

/**
 * The choices the support screens offer, and the sentences they must print.
 *
 * ## What used to be here, and where it went
 *
 * This file held three fixture ticket threads, a fake notification inbox and a
 * `findTicket` that searched them. Every support screen read from it, so the
 * whole feature was a rehearsal: "Send to support" navigated away without
 * sending anything, the reply box cleared itself, and every ticket id opened
 * the identical conversation about a water pump. Tickets come from
 * `/api/v2/support` now — see `services/hooks/useTickets.ts` — and the
 * notification fixtures went when the alerts screen was wired to the server.
 *
 * ## Why the lists below did NOT go with them
 *
 * They are not data about anybody. They are the form's options and the
 * product's own copy, and they belong with the app that renders them for two
 * reasons.
 *
 * The picker must work offline and on the first frame. A student opening
 * "What's wrong?" on a train should see six choices immediately, not a
 * spinner over a list of categories that have not changed in a year.
 *
 * And the server stores the ID that was chosen, never the sentence. A label
 * stored on a record is a label that goes stale the first time anybody rewords
 * the form, and then a two-month-old ticket disagrees with the picker that
 * created it. The ids here and the enums in
 * `Backend/src/modules/support/ticket.model.js` are the contract; everything
 * else on this page is wording, and wording is allowed to change.
 */

/**
 * OPEN QUESTION, and it is a promise rather than a fact.
 *
 * This is printed twice — on the ticket list and again on the new-ticket
 * screen — and nothing in the system measures or enforces it. It has been
 * flagged since the fixtures were written and it is still nobody's number.
 * Whoever staffs the queue owns it; a promise made twice and kept never is
 * worse than no promise at all.
 */
export const SUPPORT_HOURS_NOTE =
  'Most tickets get a first reply within 4 hours, 9 am to 9 pm.';

/**
 * The six categories, by the ids the server validates against.
 *
 * `id` is the contract. `label` and `hint` are wording.
 */
export const ticketCategories: readonly TicketCategory[] = [
  {
    id: 'property',
    label: 'Something at the place',
    hint: 'Water, power, cleaning, a broken thing nobody is fixing.',
  },
  {
    id: 'deposit',
    label: 'My deposit',
    hint: 'Late, short, or deductions you were not shown evidence for.',
  },
  { id: 'payment', label: 'A payment', hint: 'Charged twice, charged wrongly, a refund missing.' },
  {
    id: 'owner',
    label: 'The owner',
    hint: 'Not replying, changing the terms, asking for money outside the app.',
  },
  { id: 'booking', label: 'My booking', hint: 'Dates, sharing type, moving in or out.' },
  { id: 'other', label: 'Something else', hint: 'Anything that does not fit above.' },
];

/* ------------------------------------------------------------------ *
 * Reports — the heavier path
 * ------------------------------------------------------------------ */

/**
 * `evidenceRequired` is repeated on the server.
 *
 * Not duplicated by accident: the flag here decides whether the form asks for
 * a screenshot, and the copy in `ticket.model.js` decides whether the safety
 * queue is told to chase for one. A client that is the only thing enforcing a
 * rule is a client that can turn the rule off.
 */
export const reportReasons: readonly ReportReason[] = [
  { id: 'deposit-threat', label: 'Owner is threatening to keep my deposit', evidenceRequired: true },
  { id: 'not-as-listed', label: 'The place is not what was listed', evidenceRequired: true },
  { id: 'safety', label: 'Safety concern about the building' },
  { id: 'harassment', label: 'Harassment or inappropriate behaviour' },
  { id: 'extra-money', label: 'Owner is asking for extra money', evidenceRequired: true },
  { id: 'discrimination', label: 'Discrimination' },
];

/**
 * Two sentences that must appear on the report screen, and one that must appear
 * above both.
 *
 * The emergency line is first because a student in danger should not read a
 * paragraph about our investigation process before being told to call 100.
 */
export const REPORT_EMERGENCY_NOTE =
  'If you are in immediate danger, call 100 first. This is not an emergency line.';

export const REPORT_WEIGHT_NOTE =
  'A report goes to our safety team, not to the owner. She is not told you filed it until we have looked into it. We may suspend the listing while we investigate.';

export const REPORT_DETAIL_HINT =
  'Dates, amounts and exact words matter here — this may be used in a dispute.';

/**
 * Long enough to be investigable, short enough not to be a wall.
 *
 * Enforced here on the button AND on the server, which refuses a shorter one
 * with the reason attached. The server check is the real one: this is the
 * record that may end up in front of somebody arbitrating a deposit, and
 * "owner is bad" costs the safety queue an investigation it cannot run.
 */
export const REPORT_MIN_CHARS = 50;
