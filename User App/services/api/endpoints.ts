import { API_VERSION } from './config';

/**
 * Every backend path this app is allowed to call, in one table.
 *
 * This mirrors `Backend/routes/index.js`, which is the authority. Keeping the
 * two in the same shape is the point: a route can be read off one file and
 * found in the other without guessing, and a path that does not appear here
 * is a path this app does not call.
 *
 * ## The version is in the string, deliberately
 *
 * Not a parameter, not a default, not a base URL with `/api/v2` baked into it.
 * The backend serves two surfaces that disagree about what `/properties`
 * means, and a call whose version is decided somewhere other than the call
 * itself is a call that can silently move between them. `V2` is written into
 * each line below so the version is visible at every use site.
 *
 * ## What is NOT here
 *
 * The v1 surface. It onboards properties on an employee's behalf and its
 * writes need an administrator's grant — nothing a student's phone should be
 * able to reach. If a v1 route is ever genuinely needed, it gets its own
 * block here and a comment saying why, rather than being reached for inline.
 *
 * The unversioned aliases (`/api/listings`) are equally absent. They work,
 * and they resolve to whichever version answered them historically — which
 * is exactly the ambiguity the versioned paths exist to remove.
 */

const V2 = API_VERSION.v2;

export const endpoints = {
  /** Process and database status. Answers on both surfaces; v2 for consistency. */
  health: `${V2}/health`,

  /**
   * The public Explore feed — the `properties` collection, projected for
   * reading. Same data lampose.com shows.
   *
   * Filters the server accepts: `category`, `city`, `maxPrice`, `search`.
   * Everything else the app filters (gender, sharing, amenities) has no
   * column to filter on and is applied client-side — see `listings.api.ts`.
   */
  listings: `${V2}/listings`,

  /**
   * Which cities, localities and categories actually have something in them.
   *
   * Read before the feed, by the screens that ask "where are you looking?"
   * and "what kind of place?". Both of those used to be answered from a
   * hardcoded list of Hyderabad localities, which is how an app whose
   * database holds Bangalore and Anakapalli came to offer neither.
   */
  listingMeta: `${V2}/listings/meta`,

  /** One listing, by its Mongo id. 404 on anything that is not one. */
  listing: (id: string) => `${V2}/listings/${encodeURIComponent(id)}`,

  /**
   * "Request a visit" — the one write this app makes.
   *
   * Four steps, and the order is a safety property rather than a convenience:
   * the owner's phone is only rung after a code sent to the customer's own
   * number comes back correct. Without that ordering the button is a way to
   * make a stranger's WhatsApp ring under an invented name.
   *
   *   create  form in, SMS code out. Nothing reaches the owner yet.
   *   verify  code checked, THEN the owner is asked on WhatsApp.
   *   resend  a new code. Rate limited, with a cooldown the server sets.
   *   status  what the waiting screen polls until the owner answers.
   */
  /**
   * The student's own account — phone plus a one-time code, no password.
   *
   * NOT `${V2}/auth`. That one is staff: the leads panel and the onboarding
   * app, with an email, a password and an ADMIN or EMPLOYEE role, stored in
   * `scriper_users`. Customers live in `app_customers` and have none of
   * those. The two are separate identity systems that happen to share a
   * signing secret, and a customer token carries `typ: "customer"` so a staff
   * token cannot be used here or the reverse.
   *
   * Sign-in and sign-up are the same two calls: a number the server knows
   * signs in, one it does not creates an account. The app chooses the words
   * from the tab that was pressed; the server never reports which case it is,
   * because an endpoint that did would let anybody test a list of numbers
   * against Lampose's customers.
   */
  customerAuthStart: `${V2}/customers/auth/start`,
  customerAuthVerify: `${V2}/customers/auth/verify`,
  customerAuthResend: `${V2}/customers/auth/resend`,
  /** GET for the profile behind a session; PATCH to change name or email. */
  customerMe: `${V2}/customers/me`,

  /**
   * The alerts inbox, derived from this customer's visit requests.
   *
   * There is no notifications collection: everything that happens to a
   * customer already exists as a VisitRequest with a status, and a second row
   * per change would be a source of truth that can drift from the first. The
   * consequence to know about is that alerts cannot be dismissed one at a
   * time — `read` is a single watermark on the account, which is what the
   * second endpoint moves.
   */
  customerNotifications: `${V2}/customers/notifications`,
  customerNotificationsRead: `${V2}/customers/notifications/read`,

  /**
   * The shortlist. GET hydrates it into current listings, each paired with
   * the rent it was saved at, so the "cheaper since you saved it" line has
   * both numbers to compare.
   */
  customerSaved: `${V2}/customers/saved`,
  customerSavedOne: (listingId: string) =>
    `${V2}/customers/saved/${encodeURIComponent(listingId)}`,

  /**
   * Support tickets and safety reports.
   *
   * Its own group rather than a branch of `/customers`, matching the backend:
   * a ticket has its own collection and a reader who is not the customer.
   *
   * `supportReports` is a SEPARATE path from `supportTickets` rather than the
   * same one with a kind in the body, and that is the point. A report is an
   * allegation about a person and goes to a different queue under different
   * rules — the owner is not told it exists until somebody has looked. An
   * endpoint that decided which queue from a string in the payload is an
   * endpoint where a typo files a safety report as a billing question.
   */
  supportTickets: `${V2}/support/tickets`,
  supportTicket: (reference: string) =>
    `${V2}/support/tickets/${encodeURIComponent(reference)}`,
  supportTicketMessages: (reference: string) =>
    `${V2}/support/tickets/${encodeURIComponent(reference)}/messages`,
  supportTicketRead: (reference: string) =>
    `${V2}/support/tickets/${encodeURIComponent(reference)}/read`,
  supportReports: `${V2}/support/reports`,

  visitRequests: `${V2}/visit-requests`,
  visitRequest: (id: string) => `${V2}/visit-requests/${encodeURIComponent(id)}`,
  visitRequestVerify: (id: string) => `${V2}/visit-requests/${encodeURIComponent(id)}/verify`,
  visitRequestResend: (id: string) => `${V2}/visit-requests/${encodeURIComponent(id)}/resend`,
} as const;

export default endpoints;
