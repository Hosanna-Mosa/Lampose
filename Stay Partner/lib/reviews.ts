/**
 * Guest reviews and the owner's replies.
 *
 * The rating summary (average, count, star distribution) reflects the
 * property's full history — 42 reviews' worth — while `REVIEWS` holds only the
 * handful of recent ones actually shown, matching what the design draws. The
 * two aren't meant to reconcile to each other; a real backend would compute
 * the summary server-side from records the device never fully holds, the same
 * relationship static payouts have to bookings no longer on record.
 */

export const RATING_SUMMARY = {
  average: 4.6,
  totalReviews: 42,
  /** Percent of all reviews at each star level, 5 down to 1. */
  distribution: { 5: 70, 4: 20, 3: 6, 2: 3, 1: 1 } as Record<1 | 2 | 3 | 4 | 5, number>,
};

export type ReviewReply = {
  author: string;
  text: string;
};

export type Review = {
  id: string;
  guestName: string;
  roomType: string;
  date: Date;
  /** Whole stars, 1–5 — guests rate in integers, unlike the fractional average. */
  rating: number;
  text: string;
  reply?: ReviewReply;
};

function at(dayOffset: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(0, 0, 0, 0);
  return d;
}

export const REVIEWS: Review[] = [
  {
    id: 'RV-1',
    guestName: 'Sana Iyer',
    roomType: 'Deluxe Double',
    date: at(-10),
    rating: 4,
    text: 'Beautiful villa, exactly as pictured. The host was quick to respond and check-in was seamless. Would book again.',
  },
  {
    id: 'RV-2',
    guestName: 'Meera Joseph',
    roomType: 'Family Suite',
    date: at(-15),
    rating: 4,
    text: 'Great location, a bit noisy on weekend nights. Room was clean and spacious.',
    reply: {
      author: 'Sea View Villa (You)',
      text: "Thanks for the feedback, Meera — we've asked guests to keep noise down after 10pm. Hope to host you again!",
    },
  },
];

export function getReview(id: string | undefined): Review | undefined {
  return REVIEWS.find((r) => r.id === id);
}

// ── Mutation ──────────────────────────────────────────────────────────────
//
// Same shape as inventory, pricing, and payouts: an in-memory list plus a
// subscription. Posting a reply has to actually attach it, or the composer's
// round trip is theatre.

const listeners = new Set<() => void>();

export function subscribeReviews(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** The label every owner reply is posted under — there's one property, one voice. */
export const REPLY_AUTHOR = 'Sea View Villa (You)';

export function postReply(id: string, text: string) {
  const review = REVIEWS.find((r) => r.id === id);
  if (!review) return;
  review.reply = { author: REPLY_AUTHOR, text: text.trim() };
  listeners.forEach((fn) => fn());
}
