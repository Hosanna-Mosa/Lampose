/**
 * The real copy for every empty and error state.
 *
 * Words are the design here, so they live in one file rather than being
 * retyped into screens. The rules they all follow:
 *
 *   - No "oops", no "sorry", no exclamation marks.
 *   - An error headline says what happened; the body says what to do.
 *   - An empty headline states the fact; the body says why it is normal and
 *     what comes next.
 *   - Every empty state has exactly one primary action.
 *   - Every number comes from the server. Nothing here invents a figure, which
 *     is why most of these are functions rather than strings.
 */

export type StateCopy = {
  headline: string;
  body: string;
  primaryAction: string;
  secondaryAction?: string;
  /** Renders the action as secondary — nothing is wrong, so nothing urges. */
  calm?: boolean;
  /**
   * Small print under the actions: a request id, a booking reference. It
   * belongs to the copy rather than to the screen, so support always sees the
   * same string the user did.
   */
  footnote?: string;
};

/* ------------------------------------------------------------------ *
 * Empty states
 * ------------------------------------------------------------------ */

export const emptyStates = {
  /**
   * Names the exact filter that emptied the list and offers the two real ways
   * out. Never "try adjusting your filters" — that makes the user hunt for the
   * culprit they cannot see.
   */
  /**
   * Nothing of this category here, with no filters to blame.
   *
   * Distinct from `noSearchResults` on purpose. Since the category became a
   * required filter, the most likely reason a feed is empty is not a rent
   * ceiling — it is that this locality has three PGs and no dormitories. Naming
   * a filter the user did not set would send them to clear filters that are
   * already clear, and they would conclude the app is broken.
   *
   * So it names the real cause, and offers the two ways out in the order that
   * usually works: change what you are looking for, or change where.
   */
  noneInCategory: (params: {
    categoryPlural: string;
    locality: string;
    otherCategoryCount: number;
  }): StateCopy => ({
    headline: `No ${params.categoryPlural} in ${params.locality} yet`,
    body:
      params.otherCategoryCount > 0
        ? `There are ${params.otherCategoryCount} other places here of a different kind — switch at the top of the screen to see them. Or try another area.`
        : 'We have not listed anything here yet. Try a nearby area, and we will tell you when something opens.',
    primaryAction: 'Search another area',
    secondaryAction: 'Tell me when one opens',
  }),

  noSearchResults: (params: {
    locality: string;
    rentCeiling: string;
    fittingCount: number;
    suggestedCeiling: string;
    nearbyCount: number;
    nearbyLocality: string;
  }): StateCopy => ({
    headline: `No places in ${params.locality} under ${params.rentCeiling}`,
    body: `${params.fittingCount} places here fit if you raise your rent ceiling to ${params.suggestedCeiling}. Or there are ${params.nearbyCount} under ${params.rentCeiling} in ${params.nearbyLocality}.`,
    primaryAction: `Raise ceiling to ${params.suggestedCeiling}`,
    secondaryAction: `Search ${params.nearbyLocality} instead`,
  }),

  /**
   * Teaches the request-then-approve model at the moment the user has time to
   * read it, so the first pending state is never a surprise.
   */
  noBookings: (params: { locality: string; ownerWindowLabel: string }): StateCopy => ({
    headline: 'Nothing booked yet',
    body: `Most students visit two or three places before requesting one. When you request a bed, the owner has ${params.ownerWindowLabel} to accept — and payment only opens after that.`,
    primaryAction: `Explore places in ${params.locality}`,
  }),

  /** Explains the payoff of saving, not the mechanic of tapping a bookmark. */
  noSaved: (): StateCopy => ({
    headline: 'Nothing shortlisted',
    body: 'Tap the bookmark on any listing and it stays here with its rent and deposit, so you can compare side by side instead of scrolling back.',
    primaryAction: 'Find places to compare',
  }),

  /**
   * The one empty state whose action is secondary-styled. Nothing is wrong
   * here, and a brand-filled button would manufacture urgency.
   */
  noNotifications: (): StateCopy => ({
    headline: 'No updates yet',
    body: 'Owner replies, rent changes on your shortlist, and visit reminders land here. We only send what affects a place you are actually looking at.',
    primaryAction: 'Turn on price-drop alerts',
    calm: true,
  }),

  /**
   * Says the honest thing about photos out loud. It is the top anxiety in this
   * category and the reason the visit step exists at all.
   */
  noVisits: (): StateCopy => ({
    headline: 'No visits booked',
    body: 'Owners take visits between 10 am and 7 pm, usually from the next day. Standing in the room is the only way to know the photos are current.',
    primaryAction: 'Schedule from your shortlist',
    secondaryAction: 'What happens on a visit?',
  }),

  /**
   * Calm, like `noNotifications`, and for the same reason: having no open
   * support requests is the good outcome. A brand-filled button would read as
   * an invitation to find something to complain about.
   *
   * The body names what this screen is for rather than describing its
   * emptiness. Somebody arriving here has usually not needed support yet, and
   * the useful thing to leave them with is where to come when they do —
   * `replyNote` carries the promise, passed in so the number lives in one
   * place rather than being restated here.
   */
  noTickets: ({ replyNote }: { replyNote: string }): StateCopy => ({
    headline: 'Nothing open',
    body: 'When something goes wrong — the water, your deposit, a payment an owner will not explain — this is where you tell us, and where our replies land.',
    primaryAction: 'New support request',
    footnote: replyNote,
    calm: true,
  }),
};

/* ------------------------------------------------------------------ *
 * Error states
 * ------------------------------------------------------------------ */

export const errorStates = {
  /**
   * The one error where the user can still do something useful, so browsing
   * stays available and the age of the data is stated twice.
   */
  offline: (params: { savedCount: number; ageMinutes: number }): StateCopy => ({
    headline: "You're offline",
    body: `These ${params.savedCount} places were saved ${params.ageMinutes} minutes ago. Rent and bed availability may have changed since — check both before you request anything.`,
    primaryAction: 'Try again',
    secondaryAction: 'Keep browsing saved results',
  }),

  /**
   * Not an error visually — no red. Nothing failed; the market moved. The
   * alternative count and price band come from the server, so the sentence is
   * never empty-handed.
   */
  listingTaken: (params: {
    filledMinutesAgo: number;
    alternativeCount: number;
    sharingType: string;
    locality: string;
    priceLow: string;
    priceHigh: string;
  }): StateCopy => ({
    headline: 'This bed is taken',
    body: `The owner marked it filled ${params.filledMinutesAgo} minutes ago. ${params.alternativeCount} ${params.sharingType} beds in ${params.locality} are open at ${params.priceLow}–${params.priceHigh}.`,
    primaryAction: `See the ${params.alternativeCount} open beds`,
    secondaryAction: 'Alert me if this one frees up',
  }),

  /**
   * "Do not pay again" is the highest-value sentence in the app and runs first,
   * ahead of any explanation — someone who thinks they have lost ₹25,000 reads
   * one sentence and nothing else.
   *
   * The identical string ships in three places: this screen, the push fired
   * when the webhook resolves, and the pre-filled support ticket, because the
   * user may not be looking at the app when it lands.
   */
  paymentUnverified: (params: { amount: string; holdUntil: string }): StateCopy => ({
    headline: 'Payment not confirmed yet',
    body: `Do not pay again. Your bank has taken ${params.amount} but has not confirmed it to us. Your bed stays reserved until ${params.holdUntil} while we check.`,
    primaryAction: 'Check again',
    secondaryAction: 'Talk to support',
  }),

  /**
   * Says whose fault it is, because a student on patchy 4G otherwise assumes
   * it is their data pack and stops trying. The request id is shown, not
   * buried in a log.
   */
  serverError: (params: { status: number; requestId: string }): StateCopy => ({
    headline: "Our server didn't answer",
    body: 'This is on our side, not your connection. Nothing you entered was lost. Try again in a moment.',
    primaryAction: 'Try again',
    footnote: `error ${params.status} · req ${params.requestId} — support can read this`,
  }),

  /**
   * Dead links here usually arrive over WhatsApp from a senior, so the copy
   * assumes a shared link rather than a mistyped address.
   */
  notFound: (): StateCopy => ({
    headline: "This page isn't here anymore",
    body: 'The link may be from an old message. Search the place by name, or start from your college.',
    primaryAction: 'Search by name',
    secondaryAction: 'Back to Explore',
  }),

  /**
   * A token refresh failing mid-request is the nastiest state in the product:
   * the student cannot tell whether the request went through. So the headline
   * answers exactly that question first, states that no money moved, and the
   * draft is echoed back as proof it survived.
   *
   * The primary action returns to the booking with the same payload — never a
   * bare login screen, which forces the user to guess whether to try again.
   */
  sessionExpired: (): StateCopy => ({
    headline: 'Your request was not sent',
    body: 'You were signed out while it was going through, so nothing reached the owner and no money has moved. Sign in and we will put you back on this bed with the same details.',
    primaryAction: 'Sign in and continue',
    secondaryAction: 'Start over',
  }),

  /**
   * Partial failure never blanks a working screen. This scopes exactly what is
   * stale and leaves the rest usable — critical when the stale field is money.
   */
  pricesStale: (params: { currentAsOf: string }): StateCopy => ({
    headline: "Couldn't load today's prices",
    body: `The rest of this page is current as of ${params.currentAsOf}. Prices shown are from yesterday.`,
    primaryAction: 'Reload prices',
  }),
};

/* ------------------------------------------------------------------ *
 * Success
 * ------------------------------------------------------------------ */

/**
 * No confetti. This is a large amount of someone's money, usually a parent's.
 *
 * The parent-receipt action exists for the same reason.
 */
export const successCopy = {
  bedConfirmed: (params: {
    propertyName: string;
    sharingType: string;
    moveInDate: string;
    arriveBy: string;
  }) => ({
    headline: 'Bed confirmed',
    body: `${params.propertyName} · ${params.sharingType}. Move in on ${params.moveInDate}. The owner has your number and expects you by ${params.arriveBy}.`,
    primaryAction: 'View booking',
    secondaryAction: 'Send receipt to my parent',
  }),
};
