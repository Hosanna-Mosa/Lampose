/**
 * The shapes the backend actually sends, written down.
 *
 * These are NOT the app's types. They are a transcription of what comes back
 * from `/api/v2`, field for field, and they exist so the boundary between
 * "what the server said" and "what the app renders" is a file you can point
 * at rather than a cast buried in a hook.
 *
 * Everything here mirrors, in order:
 *   Backend/src/modules/listings/listing.formatter.js   — formatListing()
 *   Backend/src/modules/listings/listing.controller.js  — getListingMeta()
 *   Backend/src/modules/visits/visitRequest.model.js    — toPublic()
 *
 * Nothing in `app/` or `components/` should import from this file. Screens
 * consume the app's own types; `services/adapters/` is what crosses over.
 */

/* ------------------------------------------------------------------ *
 * Listings
 * ------------------------------------------------------------------ */

/** The four values the `properties` collection's category enum allows. */
/**
 * What `properties.category` holds.
 *
 * The same four the app uses — the backend adopted them (see
 * Backend/src/shared/constants/categories.js) and migrated its rows, so the
 * adapter's translation is now the identity. The pre-migration spellings are
 * kept in the union because a cached response or a deployment mid-rollout can
 * still produce one, and `toStayCategory` maps them.
 */
export type BackendCategory =
  | 'PG_HOSTEL' | 'BACHELOR' | 'HOTEL' | 'COLIVE'
  | 'PG' | 'Hostel' | 'Dormitory' | 'Bachelor Room';

export type BackendSharingOption = {
  /** "Single", "2 Sharing", "Double Sharing" — the panel's own wording. */
  label: string;
  /** Monthly, per person. `null` where the panel recorded no per-option price. */
  price: number | null;

  /**
   * `${propertyId}:${slug}` — the bed pool a request claims from.
   *
   * Stable across a property being re-saved, unlike the row's own id, which
   * is why a request carries this rather than a database id.
   */
  shareTypeId?: string | null;

  /**
   * The three ways a hotel bed is sold, where the owner priced more than one.
   *
   * A hostel sells the same bed by the night, by the month and by the hour at
   * rates that are not multiples of each other, so the guest picks. Every
   * value is `null` on the categories that sell one way — the field is only
   * populated for HOTEL.
   */
  rates?: {
    nightly: number | null;
    monthly: number | null;
    flexible: number | null;
  } | null;
  /** The same three with AC, where it is offered. */
  acRates?: {
    nightly: number | null;
    monthly: number | null;
    flexible: number | null;
  } | null;

  /** Beds in this room type, as recorded at onboarding. */
  totalBeds?: number | null;

  /**
   * Beds free right now.
   *
   * `null` is NOT zero. Null means nobody has ever recorded a count for this
   * option — true of every property onboarded before bed counts existed — and
   * the honest rendering is "we do not know", not "full". Ten of the twelve
   * live listings are in that state today.
   */
  availableBeds?: number | null;

  /** Whether a request for this option would be accepted at all. */
  requestable?: boolean;

  /**
   * Why not, when it is not.
   *
   * Three different situations, and a listing page needs three different
   * sentences: nobody recorded a count, the owner switched this room type
   * off, and every bed is taken. Reporting only `requestable: false` had the
   * app say "live availability not confirmed" about a room with six free beds
   * the owner had simply paused.
   */
  reason?: 'NO_INVENTORY_RECORDED' | 'OWNER_PAUSED' | 'NO_BEDS_FREE' | null;
};

export type BackendStayRates = {
  short: {
    available: boolean;
    dailyPrice: number | null;
    maxDays: number;
    label: string | null;
  };
  long: {
    available: boolean;
    monthlyPrice: number | null;
    monthOptions: number[];
    label: string | null;
  };
};

export type BackendListing = {
  id: string;
  name: string;
  /** Free text from the panel: "HSR Layout Sector 1, Bangalore". */
  place: string;
  /** Derived from `place` server-side. The `?city=` filter matches this. */
  city: string;
  locality: string;
  category: BackendCategory | string;
  categorySlug: string;
  stayType: string;
  longStayDuration: string | null;
  shortStayDuration: string | null;
  rent: number;
  pricePeriod: '/mo' | '/day';
  monthlyPrice: number | null;
  dailyPrice: number | null;
  deposit: number | null;
  ownerName: string;
  /** Present in the payload; the app never dials it directly. */
  ownerMobile: string;
  address: string;
  description: string;
  /** Free text, one string per amenity. Not a controlled vocabulary. */
  amenities: string[];
  /** Cloudinary URLs from the onboarding upload, in upload order. */
  images: string[];
  /** `categoryDetails` — whatever the panel recorded for this category. */
  details: Record<string, unknown> | null;
  isVerified: boolean;
  verificationStatus: 'pending' | 'verified' | 'rejected' | null;
  sharingOptions: BackendSharingOption[];
  /** True when ANY option on this listing can be requested right now. */
  requestable?: boolean;
  stayRates: BackendStayRates;
  durationOptions: { shortDays: number[]; longMonths: number[] };
  /** The joining dates the server will accept, inclusive. `YYYY-MM-DD`. */
  joinWindow: { min: string; max: string };
  /**
   * Whether a confirmed visit here is paid for.
   *
   * Exposed rather than inferred from `simpleSharingPath`: the two cover the
   * same categories today, and a screen that guessed one from the other would
   * start asking for money — or stop — the moment they diverge.
   */
  visitToken?: { required: boolean; amountPaise: number | null };

  /** True for categories priced by the bed: no stay type, no duration. */
  simpleSharingPath: boolean;
  meals: { included: boolean; foodType: string | null } | null;
  /** Only hostels carry one. `null` everywhere else — see Listing.gender. */
  gender: string | null;
  listedAt: string;
};

/**
 * How many places of each kind, keyed by the collection's own category names
 * — "PG_HOSTEL", "BACHELOR", "HOTEL", "COLIVE". The same four as the tabs;
 * `BACKEND_CATEGORIES` is what maps between them.
 */
export type CategoryCounts = Record<string, number>;

export type BackendListingMeta = {
  total: number;
  /** Every `medianRent` here is monthly. Nightly listings are excluded. */
  cities: { name: string; count: number; medianRent: number | null; categories: CategoryCounts }[];
  localities: {
    id: string;
    name: string;
    city: string;
    /** Every kind of place in the area, which is NOT what one tab shows. */
    listingCount: number;
    medianRent: number | null;
    /** The breakdown, so a per-tab empty state can count the other kinds. */
    categories: CategoryCounts;
  }[];
  categories: { name: string; slug: string; count: number }[];
  monthlyRent: { min: number | null; max: number | null; median: number | null };
};

/* ------------------------------------------------------------------ *
 * Customer accounts
 * ------------------------------------------------------------------ */

/**
 * A student's account, as `customer.model.js#toPublic()` projects it.
 *
 * The whole `otp` sub-document is absent — hash, salt, attempt count and all.
 * It is projected by whitelist server-side rather than deleted from a copy,
 * so a field added to the schema later cannot leak by being forgotten.
 */
export type BackendCustomer = {
  /** `cus_…`. A string id, not the Mongo `_id`. */
  id: string;
  /** E.164, as the server normalised it. */
  phone: string;
  /** Empty until they say. A signed-in customer with no name is ordinary. */
  name: string;
  email: string;
  category: string | null;
  phoneVerifiedAt: string | null;
  createdAt: string;
};

/** What a code request answers with. Every number here is the server's. */
export type BackendOtpChallenge = {
  /** "•••••43210" — shown above the code boxes. */
  phoneMasked: string;
  /** How many boxes to draw. Not assumed by the client. */
  otpLength: number;
  /** Seconds before another code may be asked for. */
  resendInSeconds: number;
  /** Wrong tries allowed on this code before it locks. */
  maxAttempts: number;
};

/**
 * What `verify` says about a referral code sent alongside the OTP, if one
 * was. Absent entirely when no code was submitted — see
 * `customer.controller.js#verifyAuth`.
 */
export type BackendReferralOutcome = {
  status: 'applied' | 'invalid' | 'expired' | 'used' | 'phone_mismatch' | 'already_referred';
  /** Only set when `status` is `'applied'`. */
  propertyName?: string;
  discountRupees?: number;
};

export type BackendSession = {
  token: string;
  customer: BackendCustomer;
  referral?: BackendReferralOutcome;
};

/**
 * The food-order discount a referral code unlocked, as
 * `foodCoupon.controller.js#getMyCoupon` projects it. `null` when this
 * customer has none — the ordinary case for most.
 */
export type BackendFoodCoupon = {
  id: string;
  amountRupees: number;
  propertyName: string;
  status: 'active' | 'used';
} | null;

/**
 * One alert, derived from a visit request rather than stored.
 *
 * `kind` is drawn from the app's own notification vocabulary so the row's
 * glyph set needs no translation. Only `visit` and `owner` are ever produced
 * today — the others (`payment`, `refund`, `rent`, `support`, `booking`)
 * describe things this backend has no record of, and inventing them was
 * exactly what the fixtures did.
 */
export type BackendNotification = {
  id: string;
  kind: 'visit' | 'owner';
  title: string;
  body: string;
  /** ISO. Grouped into days by the client, in the reader's own timezone. */
  at: string;
  unread: boolean;
  /** What to open. Both are present on every alert this backend produces. */
  listingId: string;
  requestId: string;
};

/* ------------------------------------------------------------------ *
 * Support tickets and safety reports
 * ------------------------------------------------------------------ */

/**
 * Where a ticket has got to.
 *
 *   open               with us, nothing is needed from the customer.
 *   awaiting_customer  we asked something and are waiting on an answer.
 *   resolved           done, and `outcome` says what actually happened.
 *   closed             finished and no longer accepting replies.
 *
 * Only the queue writes this. The one transition the app can cause is
 * indirect: replying to an `awaiting_customer` or `resolved` thread reopens
 * it, because the customer is telling us it was not finished.
 */
export type BackendTicketStatus = 'open' | 'awaiting_customer' | 'resolved' | 'closed';

export type BackendTicketMessage = {
  id: string;
  /**
   * `system` is its own author, not support with a flag on it. A system line
   * records what HAPPENED rather than what anyone said, and the app draws it
   * as a rule rather than a speech bubble — a process guarantee wearing the
   * shape of a person's reassurance is worth a different amount.
   */
  author: 'customer' | 'support' | 'system';
  /** A named human on the support side. "LAMPOSE Support" answers nobody. */
  authorName: string;
  body: string;
  /** ISO. Formatted for reading by the client, in the reader's own timezone. */
  at: string;
};

export type BackendTicket = {
  /** The public reference — TKT-… or RPT-…. There is no other id on the wire. */
  reference: string;
  /**
   * Which of the two things this is, and it is never inferred from anything
   * else. A report goes to a safety team and the owner is not told it exists;
   * a ticket goes to support and the owner may be looped in.
   */
  kind: 'ticket' | 'report';
  /** Set on tickets. Null on reports. */
  category: string | null;
  /** Set on reports. Null on tickets. */
  reason: string | null;
  subject: string;
  placeLabel: string;
  listingId: string | null;
  status: BackendTicketStatus;
  /**
   * The outcome in the queue's own words — "Refunded ₹1,000". Empty until
   * somebody writes one, because a row that just says "Resolved" tells a
   * student nothing and earns a second ticket about the same thing.
   */
  outcome: string;
  unread: boolean;
  messageCount: number;
  lastMessagePreview: string;
  lastActivityAt: string;
  createdAt: string;
};

/** The thread. Everything the list row has, plus the messages. */
export type BackendTicketDetail = BackendTicket & {
  evidenceRequired: boolean;
  messages: BackendTicketMessage[];
};

/* ------------------------------------------------------------------ *
 * Visit requests
 * ------------------------------------------------------------------ */

/**
 * Where a request has got to.
 *
 *   otp_pending    the code is out to the customer. The owner knows nothing.
 *   pending_owner  the code was right and the owner has been asked.
 *   confirmed      the owner replied AVAILABLE.
 *   declined       the owner said no.
 *   expired        24 hours passed with no reply.
 */
export type VisitRequestStatus =
  | 'otp_pending'
  | 'pending_owner'
  | 'confirmed'
  | 'declined'
  | 'expired';

/**
 * Exactly what `visitRequest.model.js#toPublic()` projects, and nothing more.
 *
 * Note what is absent: the owner's name and number, the customer's phone, and
 * the OTP in any form. The owner's contact details are read from the property
 * document server-side and never travel to a client — that is what stops this
 * endpoint being a way to look up a stranger's number.
 */
/** The five endings, plus the one live state. */
export type StayRequestStatus =
  | 'pending_owner'
  | 'confirmed'
  | 'declined'
  | 'expired'
  | 'cancelled';

/**
 * Why a request ended, where the status alone does not say.
 *
 * `INVENTORY_TAKEN` is the one that earns its keep: a decline nobody made,
 * because the last bed went while this student was waiting. Showing it as a
 * plain rejection would be untrue, and it is the difference between "look
 * elsewhere" and "try again in a minute".
 */
export type StayDecisionReason =
  | 'OWNER_DECLINED'
  | 'INVENTORY_TAKEN'
  | 'NO_ANSWER'
  | 'STUDENT_WITHDREW';

export type BackendStayRequest = {
  /**
   * The visit token, on the categories that charge one.
   *
   * `required` is the category's answer; `status` is where this request got
   * to. A client can tell "no token needed" from "not paid yet" without
   * knowing the category rules.
   */
  payment?: {
    required: boolean;
    status: 'not_required' | 'pending' | 'paid' | 'failed' | 'expired';
    amountPaise: number | null;
    /** ISO. The owner is holding a layout until this passes. */
    dueBy: string | null;
    paidAt: string | null;
  };
  /** ISO, once the token is paid. Null before — the address is not given. */
  addressReleasedAt?: string | null;
  id: string;
  listingId: string;
  propertyName: string;
  status: StayRequestStatus;
  channel: 'web' | 'app';

  createdAt: string;
  /** When the owner's window closes. Set by the server, never by this app. */
  expiresAt: string | null;
  decidedAt: string | null;
  cancelledAt: string | null;
  decisionReason: StayDecisionReason | null;

  sharing: { label: string | null; price: number | null } | null;
  shareTypeId: string | null;

  /**
   * The stages the waiting screen draws, each a real recorded event.
   *
   * `notifiedAt` is when the owner was reached — not when a handset lit up,
   * which nobody can know. `seenAt` is when they opened this request in their
   * app, which is the single most reassuring thing a waiting student can be
   * told. Null means it has not happened yet, never "unknown".
   */
  notifiedAt: string | null;
  seenAt: string | null;

  /** Where the student goes next once an owner has said yes. */
  bookingId: string | null;

  /**
   * The PIN the student and the owner compare at the door.
   *
   * Issued only when a request is confirmed, and held by both sides — it is
   * not a secret and proves nothing to the server. Null means nobody has said
   * yes yet.
   */
  entryPin: string | null;
  entryPinIssuedAt: string | null;

  /**
   * Moving in, which takes two confirmations in a fixed order.
   *
   * The owner marks it first — they are the one who checks the PIN and opens
   * a door — and the student confirms after. `awaitingStudent` is the
   * difference between "show them your PIN" and "you can confirm now", which
   * are two quite different sentences on the same screen.
   *
   * Absent until a booking exists.
   */
  moveIn?: {
    ownerConfirmedAt: string | null;
    studentConfirmedAt: string | null;
    awaitingStudent: boolean;
    complete: boolean;
  };

  /**
   * The server's clock, sent with every read.
   *
   * A phone's own clock is not trustworthy — thirty seconds out is visible on
   * a three-minute countdown, and a device set to next week would show an
   * expired request that is still live. The app computes an offset from this
   * once and then measures ELAPSED time locally, which phones are reliable
   * at, rather than asking them what time it is.
   */
  serverNow: string;
  /** Floored at zero. A negative countdown is not something to render. */
  secondsRemaining: number | null;
};

export type BackendVisitRequest = {
  id: string;
  listingId: string;
  propertyName: string;
  status: VisitRequestStatus;
  customerName: string;
  createdAt?: string;
  /**
   * When the customer's code came back correct — and therefore when the owner
   * was messaged, since both happen inside the verify request.
   */
  phoneVerifiedAt?: string | null;
  /** When the owner's window closes. Only set after the code is verified. */
  expiresAt?: string | null;
  decidedAt?: string | null;
  /** Free-text preferences, from clients written before `intent` existed. */
  preferredDate?: string | null;
  preferredTime?: string | null;
  sharing?: { label: string | null; price: number | null } | null;
  /** Rebuilt server-side from the property's own numbers, never from ours. */
  intent?: {
    stayType: 'short' | 'long' | null;
    duration: number | null;
    durationUnit: 'days' | 'months' | null;
    joiningDate: string | null;
    flexibleJoin: boolean;
    rateAmount?: number;
    rateUnit?: 'day' | 'month';
    totalAmount?: number | null;
    proratedFirstMonth?: {
      amount: number;
      daysCharged: number;
      daysInMonth: number;
      full: boolean;
    } | null;
  } | null;
  /** "+91••••••5084". Only on the create and resend replies. */
  phoneMasked?: string;
  /** The cooldown before another code may be asked for. */
  resendInSeconds?: number;
};

/* ------------------------------------------------------------------ *
 * Health
 * ------------------------------------------------------------------ */

export type BackendHealth = {
  status: string;
  service: string;
  message: string;
  database: { state: string; connected: boolean; name?: string; host?: string };
  storage: string;
  environment: string;
  uptimeSeconds: number;
};
