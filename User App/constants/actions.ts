/**
 * One action, one string.
 *
 * This is the Batch 12 drift the audit said to fix first, and it is the one
 * that changes what a user believes rather than how the app looks. A student
 * who taps "Request booking" on the results screen and then sees "Send request
 * to Padma" on the next is reasonably unsure whether those are the same act —
 * and the moment they are unsure, the safe move is to not tap.
 *
 * Every button, push notification and support-ticket template that performs one
 * of these actions imports its label from here. Nothing types the string
 * inline. If a label needs to change, it changes once.
 *
 * The audit found four variants of the request action alone, across screens
 * built weeks apart. That is not carelessness — it is what happens without a
 * single source, every time.
 */
export const actions = {
  /**
   * "Send confirmation" rather than "Request this bed".
   *
   * The button now sits under a consent checkbox and two answered dropdowns, so
   * the tap is the student confirming a set of choices rather than opening a
   * negotiation. "Send" also names what actually happens — something leaves and
   * goes to the owner — which "Request" left the student guessing about.
   *
   * Nothing is booked or paid by this tap; the owner still has to accept. That
   * is said in the bar's own note rather than crammed into the label.
   *
   * Replaces: "Request this bed", "Request booking", "Request bed",
   * "Send request to Padma", "Request Vasavi Ladies PG".
   */
  requestBed: 'Send confirmation',

  /**
   * One string, and the reference is pre-filled behind the tap. Putting
   * "about LAM-4192" in the label makes the button look like a different
   * feature each time it appears.
   *
   * Replaces: "Message support about LAM-4192", "Talk to support", "Send to
   * support", "Get help with this booking", "Message support on WhatsApp".
   */
  support: 'Message support',

  /**
   * "Free" earns its place in the label rather than the fine print: the most
   * common reason a student does not book a visit is assuming it costs
   * something.
   *
   * Replaces: "Schedule visit", "Request this visit", "Pick a new slot".
   */
  bookVisit: 'Book a free visit',

  /**
   * "My parent" presumes; "a parent" does not — a good share of these students
   * are sending it to an uncle, an elder sibling or a guardian.
   *
   * Replaces: "Send to my parent", "Send these to a parent", "Send everything
   * to a parent".
   */
  sendToParent: 'Send to a parent',

  /**
   * The entry point. The date-bearing variant ("Give notice for 13 September")
   * is correct as a *confirm* button and wrong as an entry point — it is a
   * different act, not the same one relabelled.
   *
   * "Initiate move-out" is deleted. Nobody says it.
   */
  giveNotice: 'Give notice to move out',
} as const;

export type ActionKey = keyof typeof actions;
