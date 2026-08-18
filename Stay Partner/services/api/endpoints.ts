import { API_VERSION } from './config';

/**
 * Every backend path this app is allowed to call, in one table.
 *
 * This mirrors `Backend/routes/index.js`, which is the authority. Keeping the
 * two in the same shape is the point: a route can be read off one file and
 * found in the other without guessing, and a path that does not appear here is
 * a path this app does not call.
 *
 * ## The version is in the string, deliberately
 *
 * Not a parameter, not a default, not a base URL with `/api/v2` baked into it.
 * The backend serves two surfaces that disagree about what `/properties`
 * means, and a call whose version is decided somewhere other than the call
 * itself is a call that can silently move between them.
 */

const V2 = API_VERSION.v2;

export const endpoints = {
  /** Process and database status. Public, and answers on both surfaces. */
  health: `${V2}/health`,

  /* ---------------------------------------------------------------- *
   * The partner's own account
   * ---------------------------------------------------------------- */

  /**
   * Register and log in are the same two calls.
   *
   * A number Lampose has seen before signs in; one it has not creates an
   * account. The server never reports which case it is — an endpoint that did
   * would let anybody test a list of numbers against Lampose's owners. The app
   * picks its copy from the screen the user is on, not from the response.
   *
   * NOT `${V2}/auth`. That one is staff — the leads panel and the onboarding
   * app, with an email, a password and a role, stored in `scriper_users`.
   * Partners live in `app_partners` and have none of those. A partner token
   * carries `typ: "partner"`, so a staff or customer token cannot be used here
   * or the reverse.
   */
  partnerAuthStart: `${V2}/partners/auth/start`,
  partnerAuthVerify: `${V2}/partners/auth/verify`,
  partnerAuthResend: `${V2}/partners/auth/resend`,

  /** GET for the profile behind a session; PATCH is what profile-setup writes. */
  partnerMe: `${V2}/partners/me`,

  /**
   * This handset, so the backend can reach it when the app is closed.
   *
   * Behind a session on purpose: the token says WHICH device, the session
   * says whose. A public route taking both would let anybody register a
   * stranger's handset against an account they do not own.
   */
  devices: `${V2}/partners/devices`,

  /* ---------------------------------------------------------------- *
   * What they own, and who has asked about it
   * ---------------------------------------------------------------- */

  /**
   * The dashboard's counts.
   *
   * Only what can be counted honestly: properties, and visit requests by
   * status. There is no occupancy, revenue or rating in it because there is no
   * booking, payment or review anywhere in the backend — and a tile reading
   * "₹0 this month" is a claim about an owner's income, not an empty state.
   */
  partnerSummary: `${V2}/partners/summary`,

  /**
   * This partner's listings, scoped by the phone number they proved.
   */
  partnerProperties: `${V2}/partners/properties`,

  /**
   * One listing, and where an edit to it is sent.
   *
   * Distinct from the v1 onboarding surface's `PUT /api/v1/properties/:id`:
   * that one is gated on an administrator's grant to an employee email, this
   * one is gated on the property's `ownerMobile` matching the phone number
   * this session proved. See `Backend/src/modules/partners/
   * propertyEdit.controller.js` for why the two are separate routes rather
   * than one shared with a different header.
   */
  partnerProperty: (id: string) => `${V2}/partners/properties/${encodeURIComponent(id)}`,

  /**
   * Refer a CUSTOMER, not another owner — a second, separate growth loop from
   * `partnerReferrals` below, sharing only the points wallet.
   *
   * One path, GET to list what this partner has minted and POST to mint one
   * more. Every code is bound to one guest's already-proven phone number and
   * expires in a week — see `Backend/src/modules/partners/
   * customerReferral.controller.js` for why, and what this replaced (a single
   * static code printed per property, open to anyone who saw it).
   */
  partnerInvites: `${V2}/partners/invites`,

  /** Property photographs to Cloudinary. Returns the secure URLs to save onto `images`. */
  partnerPropertyImageUpload: `${V2}/partners/uploads/property-images`,

  /**
   * Visit requests customers have sent to this partner's properties.
   *
   * Real rows, written by the User App's "Request a visit" — the one place in
   * this app where a screen is backed by something a customer actually did.
   * Requests still in `otp_pending` are never included: that is a form somebody
   * abandoned before proving their own number, and putting an unverified
   * stranger's name and number in front of an owner is how this app becomes a
   * way to harvest them.
   */
  partnerRequests: `${V2}/partners/requests`,
  partnerRequest: (id: string) => `${V2}/partners/requests/${encodeURIComponent(id)}`,
  partnerRequestsRead: `${V2}/partners/requests/read`,

  /**
   * Answering. The two taps this whole app exists for.
   *
   * Guarded, atomic and idempotent on the server: a second tap changes
   * nothing and comes back with the reason the first one lost — expired,
   * withdrawn, or somebody else took the last bed. The app renders that
   * reason rather than a generic failure.
   */
  partnerRequestAccept: (id: string) =>
    `${V2}/partners/requests/${encodeURIComponent(id)}/accept`,
  partnerRequestDecline: (id: string) =>
    `${V2}/partners/requests/${encodeURIComponent(id)}/decline`,

  /* ---------------------------------------------------------------- *
   * Add Customer — a walk-in the owner logs by hand
   * ---------------------------------------------------------------- */

  /**
   * A one-time code to the GUEST, so the owner can prove the person in front
   * of them is reachable on the number being typed.
   *
   * Not one of the auth routes. Those three all open an account, and the
   * person receiving this code is a walk-in who has none and is not signing
   * in — issuing them one as a side effect of an owner filling in a form
   * would be an account nobody asked for. Same OTP primitives underneath.
   */
  partnerGuestOtpStart: `${V2}/partners/guest-otp/start`,
  partnerGuestOtpVerify: `${V2}/partners/guest-otp/verify`,

  /**
   * Identity photographs to Cloudinary. Returns the secure URLs, which are
   * what `POST /partners/bookings` stores — the image bytes never go near the
   * database.
   */
  partnerKycUpload: `${V2}/partners/uploads/kyc`,

  /* Partner Domains */
  partnerBookings: `${V2}/partners/bookings`,
  partnerBooking: (id: string) => `${V2}/partners/bookings/${encodeURIComponent(id)}`,
  partnerBookingCheckin: (id: string) => `${V2}/partners/bookings/${encodeURIComponent(id)}/checkin`,
  partnerBookingCheckout: (id: string) => `${V2}/partners/bookings/${encodeURIComponent(id)}/checkout`,
  partnerBookingCancel: (id: string) => `${V2}/partners/bookings/${encodeURIComponent(id)}/cancel`,

  partnerEarnings: `${V2}/partners/earnings`,
  partnerPayouts: `${V2}/partners/payouts`,
  partnerPayout: (id: string) => `${V2}/partners/payouts/${encodeURIComponent(id)}`,
  partnerPaymentMethods: `${V2}/partners/payment-methods`,
  partnerPaymentMethod: (id: string) => `${V2}/partners/payment-methods/${encodeURIComponent(id)}`,

  partnerComplaints: `${V2}/partners/complaints`,
  partnerComplaint: (id: string) => `${V2}/partners/complaints/${encodeURIComponent(id)}`,

  partnerNotifications: `${V2}/partners/notifications`,
  partnerNotificationRead: (id: string) => `${V2}/partners/notifications/${encodeURIComponent(id)}/read`,

  partnerStaff: `${V2}/partners/staff`,
  partnerStaffInvite: `${V2}/partners/staff/invite`,
  partnerStaffDelete: (id: string) => `${V2}/partners/staff/${encodeURIComponent(id)}`,

  partnerReviews: `${V2}/partners/reviews`,
  partnerReferrals: `${V2}/partners/referrals`,
  partnerReferralsWithdraw: `${V2}/partners/referrals/withdraw`,

  partnerShareTypes: `${V2}/partners/share-types`,
  partnerShareTypesAvailability: `${V2}/partners/share-types/availability`,

  /* ---------------------------------------------------------------- *
   * Public catalogue
   * ---------------------------------------------------------------- */

  /** The public feed. Unscoped — every listing, not this owner's. */
  listings: `${V2}/listings`,
  listing: (id: string) => `${V2}/listings/${encodeURIComponent(id)}`,
} as const;

/**
 * The screens that still read `lib/` fixtures, and what each is waiting on.
 *
 * Kept here rather than in a document because this is the file somebody opens
 * when they go looking for the endpoint — and the honest answer for most of
 * this app is that the endpoint does not exist yet, and why.
 *
 * The backend's registered models are Admin, AppCustomer, AppPartner,
 * PermissionRequest, Product, Property, User, ScrapeJob, ScrapedLead,
 * SupportTicket, VerificationRequest and VisitRequest. Everything below needs a
 * collection that is not in that list.
 *
 *   bookings, check-in, checkout, active stay   no Booking model. Needs the
 *     tenancy domain: who marks arrival and departure, and what a stay IS as
 *     a record distinct from the visit request that led to it.
 *
 *   earnings, payouts, bank methods             no Payment or Payout model,
 *     and an open product question: the User App tells students "pay the owner
 *     directly, we only remind you", which means Lampose may never hold the
 *     money it would be paying out.
 *
 *   reviews                                      no Review model. Reviews were
 *     removed from the User App entirely, so there is no source for them.
 *
 *   staff, invites                               no Staff model, and it needs
 *     a permission story: a manager who can accept a request but not move
 *     money is a different token, not a flag.
 *
 *   complaints, disputes                         `SupportTicket` exists and is
 *     customer-scoped. The owner's side of a dispute is a real extension of
 *     it rather than a new collection — the nearest thing to shippable here.
 *
 *   referrals, pricing rules, share types        no model, and no agreed rules.
 */
export const FIXTURE_BACKED_SCREENS = [
  'bookings', 'booking/*', 'earnings/*', 'payouts',
  'reviews', 'staff/*', 'referrals/*', 'complaints', 'support/dispute',
  'inventory/*', 'share-types',
] as const;

export default endpoints;
