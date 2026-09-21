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
  /* What guests said about a place, with the owner's replies. Public. */
  listingReviews: (id: string) => `${V2}/listings/${encodeURIComponent(id)}/reviews`,

  /**
   * The stay request: ask an owner for a bed, watch the clock, pull it back.
   *
   * Three calls where the website's guest flow needed four. The code step is
   * gone because the phone was proved at sign-in, and the WhatsApp step is
   * gone because the owner has an app — see `stayRequests.api.ts`.
   *
   * The deadline is minutes, not a day, and it is set and owned entirely by
   * the server. This app renders `expiresAt`; it never computes one.
   */
  /* The student's own bookings — the customer half of the row the owner's app
     writes. Read-only from here; every state change on it is an owner action. */
  bookings: `${V2}/customers/bookings`,
  booking: (id: string) => `${V2}/customers/bookings/${encodeURIComponent(id)}`,
  /** The student's own Cancel button — only while the stay is still `upcoming`. */
  bookingCancel: (id: string) => `${V2}/customers/bookings/${encodeURIComponent(id)}/cancel`,
  /* Where a cancelled stay's refund should go — asked after an owner
     cancelled, or if the guest skipped it when cancelling. */
  bookingRefundDetails: (id: string) => `${V2}/customers/bookings/${encodeURIComponent(id)}/refund-details`,
  /** "Rate your stay" — offered once a booking reaches `completed`. */
  bookingReview: (id: string) => `${V2}/customers/bookings/${encodeURIComponent(id)}/review`,
  /* DEVELOPMENT ONLY — 404s unless the server has DEV_ALLOW_FORCE_CHECKIN on,
     which env.js refuses under NODE_ENV=production. Stamps both halves of a
     move-in so the hotel settlement chain can be walked without waiting for a
     real check-in date. Remove with the dev button on `bookings/[id].tsx`. */
  bookingDevForceCheckIn: (id: string) =>
    `${V2}/customers/bookings/${encodeURIComponent(id)}/dev-force-checkin`,
  stayRequests: `${V2}/customers/stay-requests`,
  /* The visit-request routes, shared with the website. The token steps live
     there rather than under /customers because a request made from either
     surface is paid for the same way. */
  visitRequests: `${V2}/visit-requests`,
  stayRequest: (id: string) => `${V2}/customers/stay-requests/${encodeURIComponent(id)}`,
  stayRequestWithdraw: (id: string) =>
    `${V2}/customers/stay-requests/${encodeURIComponent(id)}/withdraw`,
  /* The student's half of moving in — the owner confirms first. */
  /* DEVELOPMENT ONLY — 404s unless the server has DEV_ALLOW_MARK_PAID on,
     which it refuses in production. */
  visitRequestDevMarkPaid: (id: string) =>
    `${V2}/visit-requests/${encodeURIComponent(id)}/payment/dev-mark-paid`,
  stayRequestMovedIn: (id: string) =>
    `${V2}/customers/stay-requests/${encodeURIComponent(id)}/moved-in`,

  /*
   * The website's visit request used to be here, and is deliberately gone.
   *
   * Four paths under `${V2}/visit-requests` — create, verify, resend, status.
   * They still serve lampose.com and are untouched; this app simply has no
   * business on them. Its own flow is the three paths above.
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
  /** Forgets this handset's push token; `everywhere: true` revokes every session. */
  customerAuthLogout: `${V2}/customers/auth/logout`,
  /** GET for the profile behind a session; PATCH to change name or email. */
  customerMe: `${V2}/customers/me`,

  /**
   * This handset, so the backend can reach it when the app is closed.
   *
   * Behind a session on purpose: the token says WHICH device, the session
   * says whose. A public route taking both would let anybody register a
   * stranger's handset against an account they do not own.
   */
  devices: `${V2}/customers/devices`,

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
  /* Food favourites — the heart on a dish and on a kitchen. A DIFFERENT list
     from `customerSaved` above, which is the stay shortlist: that one exists
     to compare rent over time, this one to get back to something you liked. */
  customerFoodFavourites: `${V2}/customers/food-favourites`,
  customerFoodFavouriteOne: (kind: 'dish' | 'kitchen', id: string) =>
    `${V2}/customers/food-favourites/${kind}/${encodeURIComponent(id)}`,

  customerSaved: `${V2}/customers/saved`,
  customerSavedOne: (listingId: string) =>
    `${V2}/customers/saved/${encodeURIComponent(listingId)}`,

  /**
   * The food-order discount a valid owner-invite code unlocks at sign-up.
   * Null data when there isn't one — not having a coupon is the ordinary
   * case, not an error. See `Backend/src/modules/customers/
   * foodCoupon.controller.js`.
   */
  customerFoodCoupon: `${V2}/customers/food-coupon`,
  /* Plural, and a list — a student earns one per move-in and may hold
     several, unlike the single referral food coupon above. */
  customerStayCoupons: `${V2}/customers/stay-coupons`,

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
  /** The audience-scoped id list — see `data/support.ts` for why the labels
      that go with them still live on the device. */
  supportCategories: `${V2}/support/categories`,

  /* ---------------------------------------------------------------- *
   * Food
   * ---------------------------------------------------------------- */

  /**
   * Kitchens, from `food_restaurants`.
   *
   * The restaurants on the other end of these routes onboard through the
   * Food-Partner app and are listed only once an administrator has approved
   * them — the feed filters on `verificationStatus: 'approved'` AND
   * `isActive`, server-side, so an unapproved kitchen cannot reach a diner
   * even if this app asked for one by id.
   *
   * `?lat&lng&radiusKm` runs a 2dsphere query and returns `distanceKm` on
   * every row, which is what the walking time is derived from. Without them
   * the feed is unordered by distance and the cards say nothing about how far
   * away a kitchen is, which is honest — the alternative is inventing a
   * number.
   */
  foodKitchens: `${V2}/food-partners/restaurants`,
  /** One kitchen, plus its menu already grouped by category. */
  foodKitchen: (restaurantId: string) =>
    `${V2}/food-partners/restaurants/${encodeURIComponent(restaurantId)}`,
  /** One dish, plus enough of its kitchen to render the screen. */
  foodDish: (productId: string) =>
    `${V2}/food-partners/products/${encodeURIComponent(productId)}`,

  /**
   * Orders, behind the customer session.
   *
   * The same `/food-partners` group as the kitchens above, because an order
   * belongs to the food domain rather than to a separate one — but on a
   * different identity: these are the only routes in that group a diner's
   * token opens, and none of them can see another restaurant's queue.
   */
  foodOrders: `${V2}/food-partners/orders`,
  foodOrder: (orderNumber: string) =>
    `${V2}/food-partners/orders/${encodeURIComponent(orderNumber)}`,
  foodOrderCancel: (orderNumber: string) =>
    `${V2}/food-partners/orders/${encodeURIComponent(orderNumber)}/cancel`,

  /**
   * Paying for an order, in two calls.
   *
   * The first mints a Razorpay order for the amount THIS SERVER computed — the
   * app never names a figure, which is the same rule that governs placing the
   * order in the first place. The second hands back the signature Razorpay's
   * checkout returned, and the server checks it against a secret only the
   * server holds.
   *
   * Nothing else marks an order paid. Until the second call (or Razorpay's own
   * webhook) succeeds, the kitchen has not been told and no rider has been
   * sent — see `Backend/src/modules/foodpartners/foodPayment.controller.js`.
   */
  foodOrderPayment: (orderNumber: string) =>
    `${V2}/food-partners/orders/${encodeURIComponent(orderNumber)}/payment`,
  foodOrderPaymentVerify: (orderNumber: string) =>
    `${V2}/food-partners/orders/${encodeURIComponent(orderNumber)}/payment/verify`,

  /**
   * The diner's address book.
   *
   * A LIST — an address is a property of the ORDER, chosen each time. Setting
   * the default is its own call rather than a field on the edit, because it is
   * one tap in a list and routing it through PATCH would make that tap send a
   * whole address body it never loaded.
   */
  addresses: `${V2}/customers/me/addresses`,
  address: (addressId: string) =>
    `${V2}/customers/me/addresses/${encodeURIComponent(addressId)}`,
  addressDefault: (addressId: string) =>
    `${V2}/customers/me/addresses/${encodeURIComponent(addressId)}/default`,
} as const;

export default endpoints;
