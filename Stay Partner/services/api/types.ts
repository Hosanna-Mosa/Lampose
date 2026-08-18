/**
 * The shapes the backend actually sends.
 *
 * Deliberately named `Backend*`. These are the wire format and they belong to
 * the server; the app's own types live in `lib/` and are what the screens
 * render. Keeping the two apart is what lets the server rename a field without
 * the change reaching a component — an adapter absorbs it.
 */

/**
 * Health answers a flat object rather than `{ success, data }`, because it is
 * also what uptime probes read.
 */
export type BackendHealth = {
  status: string;
  service: string;
  message: string;
  database: { state: string; connected: boolean; name?: string; host?: string };
  storage: string;
  environment: string;
  uptimeSeconds: number;
};

/* ------------------------------------------------------------------ *
 * The partner's account
 * ------------------------------------------------------------------ */

export type BackendPartner = {
  id: string;
  phone: string;
  name: string;
  email: string;
  businessName: string;
  phoneVerifiedAt: string | null;
  profileCompletedAt: string | null;
  /**
   * The app routes on this: false sends them to profile setup, true to the
   * dashboard. Sent as a boolean as well as a date because that is the question
   * being asked, and a client should not have to know that null is falsy.
   */
  profileComplete: boolean;
  createdAt: string;
};

/** What every send answers with, so the OTP screen has one thing to read. */
export type BackendOtpChallenge = {
  /** "•••••43210". The server's own masking of the number it messaged. */
  phoneMasked: string;
  otpLength: number;
  resendInSeconds: number;
  maxAttempts: number;
};

export type BackendPartnerSession = {
  token: string;
  partner: BackendPartner;
};

/* ------------------------------------------------------------------ *
 * Their portfolio
 * ------------------------------------------------------------------ */

/**
 * A listing as the public feed projects it — `formatListing` on the backend.
 *
 * Every field is optional except the id, and that is not laziness: the feed is
 * built from the `properties` collection, which is filled in by field agents
 * over time. A property onboarded this morning may have a name and a city and
 * nothing else, and a client that assumed otherwise would crash on the newest
 * rows rather than the oldest. The same looseness is why the property-edit
 * screen exists: most of what is missing here is exactly what that screen
 * lets an owner fill in.
 */
export type BackendListing = {
  id?: string;
  _id?: string;
  name?: string;
  category?: string;
  city?: string;
  place?: string;
  locality?: string;
  landmark?: string;
  stayType?: string;
  longStayDuration?: string | null;
  shortStayDuration?: string | null;
  rent?: number | null;
  monthlyPrice?: number | null;
  dailyPrice?: number | null;
  deposit?: number | null;
  gender?: string;
  ownerName?: string;
  ownerMobile?: string;
  address?: string;
  description?: string;
  amenities?: string[];
  /** The gallery, as the backend actually names it. */
  images?: string[];
  photoUris?: string[];
  /** `categoryDetails`, projected under this name by `formatListing`. */
  details?: Record<string, unknown> | null;
  isVerified?: boolean;
  verificationStatus?: string | null;
  listedAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

/**
 * Where a visit request has got to.
 *
 *   pending_owner  the customer proved their number and the owner was asked.
 *   confirmed      the owner replied AVAILABLE.
 *   declined       the owner said no.
 *   expired        24 hours passed with no reply.
 *
 * `otp_pending` exists in the database and is never sent here — see the note on
 * `partnerRequests` in `endpoints.ts`.
 */
export type BackendRequestStatus = 'pending_owner' | 'confirmed' | 'declined' | 'expired';

export type BackendPartnerRequest = {
  id: string;
  status: BackendRequestStatus;
  listingId: string;
  propertyName: string;
  /** Who is coming. The reason this screen exists at all. */
  customer: { name: string; phone: string; email: string };
  preferredDate: string | null;
  preferredTime: string | null;
  /**
   * What they actually want. Every figure was re-derived from the property by
   * the visit-request controller, so it is what the page showed rather than
   * what a payload claimed.
   */
  intent: {
    stayType: 'short' | 'long' | null;
    duration: number | null;
    durationUnit: 'days' | 'months' | null;
    joiningDate: string | null;
    flexibleJoin: boolean;
    rateAmount: number | null;
    rateUnit: 'day' | 'month' | null;
    totalAmount: number | null;
  } | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * The dashboard's counts.
 *
 * Every number here is the real one, INCLUDING when it is zero. The server
 * used to coalesce these through `||` — `0 || 9600` is `9600` in JavaScript,
 * so an owner who had been paid nothing was shown "₹9,600 today". Anything
 * that cannot be answered is `null` rather than a stand-in, and the screens
 * render an empty state off that.
 */
export type BackendPartnerSummary = {
  properties: number;
  /**
   * The first property matched to this partner's number, for the header pill.
   * `null` when their number matches nothing in the catalogue — a real state,
   * and one the header has to say out loud rather than paper over.
   */
  propertyName: string | null;

  requests: {
    total: number;
    awaitingYou: number;
    confirmed: number;
    declined: number;
    expired: number;
  };

  /** Today's movements, from `partner_bookings`. Zero is a real answer. */
  today: {
    inHouse: number;
    arrivals: number;
    departures: number;
  };

  /**
   * Completed payouts only.
   *
   * `today`/`week` are pre-formatted in Indian digit grouping for the tile;
   * `todayAmount`/`weekAmount` are the raw numbers, so the app can tell "₹0"
   * from "not loaded" without parsing a currency string back into a number.
   */
  earnings: {
    today: string;
    week: string;
    todayAmount: number;
    weekAmount: number;
  };

  /** Open and in-progress complaints. */
  openComplaints: number;

  /** Whether any share type is currently accepting bookings. */
  isAvailable: boolean;

  /** So the app can say WHICH number the portfolio was matched on. */
  linkedByPhone: string;
};
