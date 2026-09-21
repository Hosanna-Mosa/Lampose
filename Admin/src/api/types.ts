import type { AxiosRequestConfig } from 'axios';

/**
 * Standardized API Response Envelope
 */
export interface ApiResponse<T = any> {
  data: T;
  status: number;
  message?: string;
  success: boolean;
  timestamp?: string;
  /**
   * Why it failed, in the SERVER's vocabulary when it sent one.
   *
   * A status alone cannot tell three refusals apart: ALREADY_REFUNDED,
   * NOT_OWED and REFUND_IN_FLIGHT are all 409 and all mean a different next
   * action. The body's own `code` is kept here so a caller can branch on the
   * reason rather than on the number. Falls back to the transport code
   * ('NETWORK_ERROR' when no response arrived at all, which is the one every
   * caller that writes something must read), and is absent on success.
   */
  code?: string;
}

/**
 * Standardized API Error Response Structure
 */
export interface ApiError {
  message: string;
  status: number;
  code?: string;
  errors?: Record<string, string[]>;
  /** Raw response body, when the server sent one. */
  data?: any;
  timestamp?: string;
}

/**
 * Paginated API Response Wrapper
 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Custom Request Options extending Axios
 */
export interface ApiRequestOptions extends AxiosRequestConfig {
  showToastOnError?: boolean;
  requiresAuth?: boolean;
  retryCount?: number;
}

/**
 * Console roles.
 *
 * 'Food Admin' works the food-partner approval queue and nothing else. It is a
 * role rather than a flag because the console already gates its nav and its
 * pages on `role`, and a second mechanism beside that one is how the two drift
 * apart. Kept in step with the enum in `Backend/src/modules/admins/admin.model.js`.
 */
export type AdminRole = 'Super Admin' | 'Admin' | 'Editor' | 'Viewer' | 'Food Admin' | 'Support';
export type AdminStatus = 'Active' | 'Inactive' | 'Pending';

/**
 * Administrator account — `admins` collection.
 */
export interface UserEntity {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  status: AdminStatus;
  avatar: string;
  /** ISO timestamp as stored by Mongo, or null when absent. */
  createdAt: string | null;
  lastLogin: string;
}

export type PropertyCategory = 'PG_HOSTEL' | 'BACHELOR' | 'HOTEL' | 'COLIVE' | 'COMMERCIAL';

/**
 * Accommodation listing — `properties` collection. Field names mirror the
 * Mongoose schema so nothing is invented on the way to the UI.
 */
export interface PropertyEntity {
  id: string;
  name: string;
  place: string;
  address: string;
  category: PropertyCategory | string;
  ownerName: string;
  /** The number the WhatsApp verification chain runs on. */
  ownerMobile: string;
  /** Optional second number the onboarding agent recorded; '' when none. */
  ownerAltMobile: string;
  employeeEmail: string;
  stayType: string;
  shortStayDuration: string;
  longStayDuration: string;
  dailyPrice: number;
  monthlyPrice: number;
  rent: number;
  deposit: number;
  imageUrl: string;
  images: string[];
  amenities: string[];
  /** Free text from the onboarding form — not shown anywhere before this. */
  description: string;
  /** Schema-less by design (`Mixed` in property.model.js) — shape depends on
   *  `category`. Known keys, per Backend/src/modules/listings/sharing.util.js:
   *    PG_HOSTEL      sharingTypes: string[] (or roomTypes[] on a row
   *                   onboarded as a hostel), sharingPrices: {label: price}
   *    HOTEL          bedTypes: string[], sharingPrices: {label: price},
   *                   checkInTime + checkOutTime; `bedType` is the physical
   *                   bed format, not an occupancy
   *    BACHELOR       roomTypes: string[], and per layout: sharingPrices,
   *    COLIVE         sharingRooms/sharingBeds (unit count),
   *                   furnishingByLayout, furnishingItemsByLayout,
   *                   allowedTenantsByLayout, kitchenByLayout.
   *                   Flat `furnishing` / `allowedTenants` ('Mixed' when the
   *                   layouts differ), `furnishingItems` (the union) and
   *                   `kitchenAvailable` (true if ANY layout has one) are
   *                   derived summaries.
   *                   (older rows carry one `roomType` string instead)
   *  Common to any category: foodIncluded, foodType, curfewTime, hostelType
   *  (gender), rateType ('Daily Rate' | 'Monthly Rate'). Anything else is
   *  whatever the onboarding form happened to send. */
  categoryDetails: Record<string, unknown>;
  /**
   * Ownership and premises paperwork. Hotels supply two; nothing else is
   * asked for any.
   *
   * Top-level rather than inside `categoryDetails` on purpose — the public
   * listing API returns that whole object verbatim, and a PAN filed there
   * would be served to anybody browsing the site. Nothing public projects
   * this. The URLs are unguessable Cloudinary links, which is not the same as
   * private: treat them as sensitive.
   */
  documents?: {
    /** 'pan' | 'premises' */
    kind: string;
    /** For a premises document, which of the accepted kinds it is. */
    docType?: string;
    url: string;
    name?: string;
    uploadedAt?: string;
  }[];
  /** False for a listing still awaiting owner/verifier WhatsApp confirmation —
   *  those rows aren't a document in `properties` yet, only a snapshot on
   *  their VerificationRequest (see property.routes.v1.js's GET /, which
   *  merges both into this same list). Edit/delete still work on them; the
   *  backend falls back to editing/cancelling that snapshot transparently. */
  isVerified: boolean;
  verificationStatus: string;
  createdAt: string | null;
  updatedAt: string | null;
}

/** Mirrors verificationRequest.model.js's `status` enum exactly — including
 *  the two-stage owner→verifier handoff, not just the WhatsApp delivery states. */
export type VerificationStatus =
  | 'pending'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'verified'
  | 'expired'
  | 'rejected'
  | 'owner_approved'
  | 'verifier_rejected';

/**
 * Owner verification request — `verificationrequests` collection.
 */
export interface VerificationEntity {
  id: string;
  ownerMobileE164: string;
  token: string;
  status: VerificationStatus;
  contentSid: string;
  outboundMessageSid: string;
  lastDeliveryStatus: string;
  lastError: string;
  attempts: number;
  createdAt: string | null;
  updatedAt: string | null;
  sentAt: string | null;
  respondedAt: string | null;
  expiresAt: string | null;
  /** WhatsApp number (E.164) of the team member the owner's YES was randomly
   *  forwarded to — empty until the owner approves, from VERIFICATION_TEAM_NUMBERS. */
  assignedVerifierMobileE164: string;
  property?: {
    _id: string;
    name: string;
    category: string;
    place: string;
    ownerName: string;
  } | null;
}

export type PermissionAction = 'edit' | 'delete';

export type PermissionStatus = 'pending' | 'granted' | 'denied' | 'revoked' | 'used';

/**
 * An employee's request for edit or delete rights on a listing —
 * `permissionrequests` collection. Field agents hold no standing write access,
 * so each attempt is recorded here and decided by an administrator.
 */
export interface PermissionEntity {
  id: string;
  propertyRef: string;
  propertyName: string;
  propertyPlace: string;
  propertyCategory: string;
  ownerName: string;
  ownerMobile: string;
  employeeEmail: string;
  action: PermissionAction;
  reason: string;
  status: PermissionStatus;
  /** True while the grant is approved, unspent and unexpired. */
  active: boolean;
  decidedBy: string;
  decidedAt: string | null;
  usedAt: string | null;
  expiresAt: string | null;
  requestedIp: string;
  createdAt: string | null;
  updatedAt: string | null;
}

/** A `{ label, count }` bucket returned by the stats aggregations. */
export interface CountBucket {
  label: string;
  count: number;
}

/**
 * One onboarding employee's full funnel, from `GET /api/admin/onboarders`.
 * Sourced from `verificationrequests` (not `properties`) because that's the
 * only collection with a row for every attempt regardless of outcome — a
 * rejected or still-pending onboarding never becomes a Property document.
 */
export interface OnboarderEntity {
  employeeEmail: string;
  total: number;
  verified: number;
  /** Still in flight: pending / sent / delivered / owner_approved. */
  pending: number;
  /** Owner or verifier said no: rejected / verifier_rejected. */
  rejected: number;
  failed: number;
  expired: number;
  /** verified ÷ (verified + rejected + failed + expired) as a percentage, or
   *  null when nothing has reached an outcome yet. */
  successRate: number | null;
  firstOnboardedAt: string | null;
  lastOnboardedAt: string | null;
}

/**
 * One verification-team member's workload, from `GET /api/admin/verifiers`.
 * A verifier is only ever a WhatsApp number from `VERIFICATION_TEAM_NUMBERS` —
 * there's no Verifier collection, so this is the roster's actual identity.
 */
export interface VerifierEntity {
  verifierMobileE164: string;
  /** False for a number that verified things in the past but has since been
   *  removed from VERIFICATION_TEAM_NUMBERS. */
  onRoster: boolean;
  totalAssigned: number;
  verified: number;
  rejected: number;
  /** Assigned and still waiting on this verifier's WhatsApp reply. */
  awaiting: number;
  /** verified ÷ (verified + rejected), or null before any decision lands. */
  successRate: number | null;
  firstAssignedAt: string | null;
  lastDecisionAt: string | null;
}

export interface PlaceBucket extends CountBucket {
  avgRent: number;
}

export interface TrendPoint {
  date: string;
  count: number;
}

/**
 * Aggregate dashboard metrics — every field computed from live collections
 * by `GET /api/admin/stats`.
 */
export interface StatsEntity {
  generatedAt: string;
  windowDays: number;
  admins: {
    total: number;
    active: number;
    byRole: CountBucket[];
  };
  properties: {
    total: number;
    addedInWindow: number;
    addedInPreviousWindow: number;
    byCategory: CountBucket[];
    byStayType: CountBucket[];
    topPlaces: PlaceBucket[];
    topOnboarders: CountBucket[];
    rent: {
      average: number;
      min: number;
      max: number;
      averageDeposit: number;
      portfolioMonthly: number;
    };
    trend: TrendPoint[];
  };
  verifications: {
    total: number;
    verified: number;
    failed: number;
    pending: number;
    expired: number;
    /** Null when no request has reached a terminal state yet. */
    successRate: number | null;
    createdInWindow: number;
    createdInPreviousWindow: number;
    byStatus: CountBucket[];
  };
}

export type ActivitySeverity = 'good' | 'warning' | 'critical' | 'info';

export interface ActivityEntity {
  id: string;
  kind: 'property' | 'verification' | 'admin';
  severity: ActivitySeverity;
  title: string;
  detail: string;
  timestamp: string;
}

export interface HealthEntity {
  status: 'ok' | 'degraded';
  service: string;
  database: {
    state: string;
    name: string | null;
    connected: boolean;
  };
  uptimeSeconds: number;
  timestamp: string;
  /** Round-trip time measured client side. */
  latencyMs?: number;
}

export interface SystemEntity {
  database: {
    name: string;
    host: string;
    readyState: string;
    connected: boolean;
    collections: Array<{ name: string; documents: number }>;
    stats: {
      storageSizeBytes: number;
      dataSizeBytes: number;
      indexSizeBytes: number;
      objects: number;
      indexes: number;
    } | null;
  };
  runtime: {
    node: string;
    platform: string;
    uptimeSeconds: number;
    heapUsedBytes: number;
    heapTotalBytes: number;
    rssBytes: number;
    pid: number;
  };
  generatedAt: string;
}

/* ── Google Analytics 4 (GET /api/admin/analytics/*) ─────────────────────
   Field names mirror what the backend already computed from the GA4 Data
   API response — nothing is reshaped again on the way into the UI. */

export type GaRangePreset = 'today' | 'yesterday' | '7d' | '30d' | '90d' | 'custom';

export interface GaRange {
  preset: GaRangePreset;
  label: string;
  startDate: string;
  endDate: string;
  previousStartDate: string;
  previousEndDate: string;
}

export interface GaOverviewMetrics {
  totalUsers: number;
  activeUsers: number;
  newUsers: number;
  sessions: number;
  screenPageViews: number;
  /** Percentage, 0–100. */
  engagementRate: number;
  /** Seconds. */
  avgEngagementTime: number;
  eventCount: number;
}

export interface GaOverviewEntity {
  generatedAt: string;
  range: GaRange;
  current: GaOverviewMetrics;
  previous: GaOverviewMetrics;
}

export interface GaTrafficPoint {
  date: string;
  totalUsers: number;
  sessions: number;
  newUsers: number;
  screenPageViews: number;
}

export type GaTrafficChannel = 'Organic Search' | 'Direct' | 'Referral' | 'Social' | 'Paid' | 'Other';

export interface GaTrafficSource {
  channel: GaTrafficChannel;
  sessions: number;
  totalUsers: number;
}

export interface GaTrafficEntity {
  generatedAt: string;
  range: GaRange;
  timeseries: GaTrafficPoint[];
  sources: GaTrafficSource[];
}

export interface GaPageEntity {
  pagePath: string;
  pageTitle: string;
  screenPageViews: number;
  totalUsers: number;
  /** Seconds. */
  avgEngagementTime: number;
}

export interface GaPagesEntity {
  generatedAt: string;
  range: GaRange;
  pages: GaPageEntity[];
}

export interface GaDeviceEntity {
  category: string;
  totalUsers: number;
  sessions: number;
}

export interface GaBrowserEntity {
  browser: string;
  totalUsers: number;
}

export interface GaCountryEntity {
  country: string;
  totalUsers: number;
  sessions: number;
}

export interface GaUsersEntity {
  generatedAt: string;
  range: GaRange;
  devices: GaDeviceEntity[];
  browsers: GaBrowserEntity[];
  countries: GaCountryEntity[];
}

export interface GaEventEntity {
  eventName: string;
  eventCount: number;
}

export interface GaEventsEntity {
  generatedAt: string;
  range: GaRange;
  events: GaEventEntity[];
}

/* ── Database control (Super Admin only) ──────────────────────────────────
   The five collections that had no admin-console CRUD until now. Field
   names mirror their Mongoose schemas, same convention as PropertyEntity
   above — see Backend/src/modules/{visits,scraper,properties}. */

export type VisitRequestStatus = 'otp_pending' | 'pending_owner' | 'confirmed' | 'declined' | 'expired';

/** A customer's "request a visit" ask — `visitrequests` collection. */
export interface VisitRequestEntity {
  id: string;
  listingId: string;
  propertyName: string;
  ownerName: string;
  ownerMobile: string;
  customer: { name: string; phone: string; email: string };
  preferredDate: string | null;
  preferredTime: string | null;
  status: VisitRequestStatus;
  createdAt: string | null;
  decidedAt: string | null;
  expiresAt: string | null;
}

export type ScriperUserRole = 'ADMIN' | 'EMPLOYEE';

/** A leads-panel account — `scriper_users` collection. Separate identity
 *  system from `admins`; the console can manage it but never signs in as it. */
export interface ScriperUserEntity {
  id: string;
  name: string;
  email: string;
  role: ScriperUserRole;
  avatar: string;
  createdAt: string | null;
}

export type ScrapeSource = 'GoogleMaps' | 'JustDial' | 'Web';
export type ScrapeJobStatus = 'started' | 'running' | 'completed' | 'stopped' | 'error';

/** A Google Maps / JustDial scrape run — `scriper_jobs` collection. */
export interface ScrapeJobEntity {
  id: string;
  name: string;
  source: ScrapeSource;
  query: string;
  location: string;
  landmark: string;
  depth: number;
  status: ScrapeJobStatus;
  progress: number;
  statusMessage: string;
  resultCount: number;
  error: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export type LeadStatus =
  | 'NEW'
  | 'CONTACTED'
  | 'INTERESTED'
  | 'QUALIFIED'
  | 'CALLBACK'
  | 'CLOSED_WON'
  | 'CLOSED_LOST';

/** A scraped business record — `scriper_leads` collection. */
export interface ScrapedLeadEntity {
  id: string;
  jobId: string;
  source: ScrapeSource;
  businessName: string;
  phone: string;
  email: string;
  website: string;
  hasWebsite: boolean;
  address: string;
  rating: string;
  reviewsCount: number;
  category: string;
  city: string;
  landmark: string;
  mapsUrl: string;
  leadStatus: LeadStatus;
  assignedTo: { userId: string | null; name: string | null; email: string | null };
  scrapedAt: string | null;
  createdAt: string | null;
}

/** Orphaned from the leads-backend merge — `products` collection, unused
 *  elsewhere but manageable here now that it has routes. */
export interface ProductEntity {
  id: string;
  name: string;
  description: string;
  price: number;
  inStock: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

/** One configured Twilio Content Template, as reported by GET
 *  /admin/whatsapp/templates. `key` is the env var name — what a send names
 *  in `templateKey`, never the SID itself. */
export interface WhatsAppTemplate {
  key: string;
  label: string;
  hint: string;
}

export interface WhatsAppSendStatus {
  configured: boolean;
  from: string;
  templates: WhatsAppTemplate[];
}

export type WhatsAppSendMode = 'text' | 'template';


/* ── Food partners ─────────────────────────────────────────────────────────
   The `food_restaurants` and `food_products` collections, as the approval
   queue reads them. Field names mirror the Mongoose schemas so nothing is
   invented on the way to the UI. */

export type FoodVerificationStatus = 'pending' | 'approved' | 'rejected';

export interface FoodImage {
  url: string;
  publicId?: string;
}

export interface FoodOpeningHour {
  day: string;
  openTime: string;
  closeTime: string;
}

export interface FoodDocument {
  kind: string;
  number?: string;
  expiry?: string | null;
  url?: string;
  fileName?: string;
  uploadedAt?: string | null;
}

/** A row in the queue. The list endpoint projects only these columns. */
export interface FoodRestaurantRow {
  restaurantId: string;
  restaurantName: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  description: string;
  cuisineTypes: string[];
  logoImage?: FoodImage | null;
  coverBannerImage?: FoodImage | null;
  address: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    /* The FoSCoS district, which is not always a revenue district — the
       portal's list carries municipal corporations too. Half of the pair a
       licence is looked up by; see the FSSAI block on the review drawer. */
    district?: string;
    pincode?: string;
    landmark?: string;
  };
  contactNumber: string;
  verificationStatus: FoodVerificationStatus;
  verificationNote: string;
  isActive: boolean;
  ratingAvg: number;
  ratingCount: number;
  avgPreparationTime: number;
  deliveryRadiusKm: number;
  minOrderValue: number;
  menuItemCount: number;
  createdAt: string | null;
  verifiedAt: string | null;
}

/** One dish, as the detail drawer renders it. */
export interface FoodProductRow {
  productId: string;
  productName: string;
  category: string;
  description: string;
  price: number;
  discountedPrice?: number | null;
  isVeg: 'veg' | 'non-veg' | 'egg';
  isAvailable: boolean;
  productImage?: FoodImage | null;
  variants?: { name: string; price: number }[];
  addOns?: { name: string; price: number }[];
  tags?: string[];
  allergenInfo?: string[];
  spiceLevel?: string | null;
  serves?: number | null;
  calories?: number | null;
  preparationTime?: number | null;
}

/** The full application: everything a decision is made on. */
export interface FoodRestaurantDetail {
  restaurant: FoodRestaurantRow & {
    fssaiLicenseNumber?: string;
    /* The name the licence is HELD in, which is not always `restaurantName`.
       Absent on applications filed before the field existed, and on every
       one from the Food-Partner app — the drawer falls back accordingly. */
    fssaiCompanyName?: string;
    fssaiExpiry?: string | null;
    gstNumber?: string;
    gstExempt?: boolean;
    panNumber?: string;
    openingHours?: FoodOpeningHour[];
    openState?: string;
    packagingCharge?: number;
    deliveryFee?: { type?: string; amount?: number; perKm?: number; freeAboveValue?: number };
    acceptsOnlinePayment?: boolean;
    acceptsCod?: boolean;
    payout?: {
      accountHolderName?: string;
      bankAccountNumber?: string;
      accountLast4?: string;
      ifscCode?: string;
      accountType?: string;
      upiId?: string;
    };
    verificationDocuments?: FoodDocument[];
    contract?: { accepted?: boolean; signature?: string; acceptedAt?: string | null };
    location?: { coordinates?: number[] };
  };
  menu: { category: string; items: FoodProductRow[] }[];
  menuItemCount: number;
}

export interface FoodQueueCounts {
  pending: number;
  approved: number;
  rejected: number;
}

/* ══════════════════════════════════════════════════════════════════════════
   Delivery riders — `app_drivers`, read through `/v1/admin/drivers`.

   Two levels of verdict, and they are not the same one. `DriverDocument.status`
   is one document, one decision, one reason — "photograph this again". `status`
   on the rider is the ACCOUNT: whether this person may work at all. The console
   surfaces both because the backend keeps both, and collapsing them is how one
   blurred PAN card rejects a whole application.
   ══════════════════════════════════════════════════════════════════════════ */

export type DriverStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

export type DriverDocumentKind = 'licence' | 'rc' | 'aadhaar' | 'pan' | 'insurance';

/** `missing` is the absence of a decision, never one that was made. */
export type DriverDocumentStatus = 'missing' | 'pending' | 'verified' | 'rejected';

export interface DriverDocument {
  kind: DriverDocumentKind;
  /** The human name, from the server — so app, console and log agree. */
  label: string;
  required: boolean;
  number: string;
  frontUrl: string;
  backUrl: string;
  expiresAt: string | null;
  status: DriverDocumentStatus;
  /** Shown to the rider verbatim. Required to reject. */
  reason: string;
  submittedAt: string | null;
  reviewedAt: string | null;
}

export interface DriverVehicle {
  type?: 'bike' | 'scooter' | 'cycle' | 'auto';
  model?: string;
  plate?: string;
}

/** The account number never leaves the backend — only its last four do. */
export interface DriverPayout {
  accountHolderName: string;
  accountLast4: string;
  ifscCode: string;
  bankName: string;
  accountType: string;
  upiId: string;
}

export interface DriverRow {
  driverId: string;
  name: string;
  phone: string;
  email: string;
  dateOfBirth: string | null;
  city: string;
  profilePhotoUrl: string;

  status: DriverStatus;
  statusReason: string;

  vehicle: DriverVehicle;
  documents: DriverDocument[];
  documentCounts: Partial<Record<DriverDocumentStatus, number>>;
  /** Everything required is on file and none of it is refused. */
  documentsReady: boolean;

  payout: DriverPayout;

  hasCompletedOnboarding: boolean;
  onboardingStep: string;
  /** What the rider still has to send, in the words their own app shows them. */
  onboardingMissing: string[];

  isOnline: boolean;
  isAvailable: boolean;
  currentOrderNumber: string | null;
  /** Whether the dispatcher can actually see them, by the rule it uses. */
  locationFresh: boolean;
  locationUpdatedAt: string | null;
  /** `[longitude, latitude]` — MongoDB's order, kept unswapped. */
  currentLocation: [number, number] | null;
  heading: number | null;
  onlineSince: string | null;
  deviceCount: number;

  phoneVerifiedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface DriverDelivery {
  orderNumber: string;
  status: string;
  restaurantId: string;
  placedAt: string | null;
  assignedAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  earnings: number;
  orderTotal: number;
  paymentMode: string;
}

export interface DriverDetail extends DriverRow {
  /** From the order ledger, not a counter on the rider. */
  lifetime: { assigned: number; delivered: number; cancelled: number; earnings: number };
  recentDeliveries: DriverDelivery[];
}

export interface DriverQueueCounts {
  pending?: number;
  approved?: number;
  rejected?: number;
  suspended?: number;
  online?: number;
}

/* ══════════════════════════════════════════════════════════════════════════
   Service zones — `service_zones`, read through `/v1/admin/zones`.

   A zone is a shape and a price: where Lampose operates, and what a delivery
   inside that area is multiplied by. Two geometries answer the same question —
   a CIRCLE (a centre and a radius) and a POLYGON (a closed ring of vertices).

   Every coordinate here is `[longitude, latitude]`, GeoJSON's order and
   MongoDB's, kept unswapped from the database to the map. Google Maps wants
   `{lat, lng}`, so the page converts at the point of use and nowhere else.
   ══════════════════════════════════════════════════════════════════════════ */

export type ZoneType = 'circle' | 'polygon';

/** Empty `allowedServices` means every service — see the backend model. */
export type ZoneService = 'food' | 'stay';

export interface ZoneRow {
  zoneId: string;
  name: string;
  description: string;
  type: ZoneType;
  /** `[longitude, latitude]`. Set for circles, null for polygons. */
  center: [number, number] | null;
  /** Metres. Set for circles. */
  radius: number | null;
  /** GeoJSON rings of `[longitude, latitude]`. Set for polygons. */
  boundary: [number, number][][] | null;
  pricingMultiplier: number;
  isActive: boolean;
  allowedServices: ZoneService[];
  /** "HH:MM", both empty when the zone has no time restriction. */
  activeHours: { start: string; end: string };
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ZoneCounts {
  total: number;
  active: number;
  circle: number;
  polygon: number;
}

/** What the console sends to create or redraw one. */
export interface ZoneInput {
  name?: string;
  description?: string;
  type?: ZoneType;
  /** `[longitude, latitude]`. */
  center?: { coordinates: [number, number] };
  radius?: number;
  /** A bare ring is accepted — the server wraps and closes it. */
  boundary?: [number, number][] | [number, number][][];
  pricingMultiplier?: number;
  isActive?: boolean;
  allowedServices?: ZoneService[];
  activeHours?: { start: string; end: string };
}

/* ══════════════════════════════════════════════════════════════════════════
   Food orders — `food_orders`, read through `/v1/admin/food-orders`.

   The restaurant and rider queues above answer "may this person trade with
   us". This one answers a different question, asked on a different day: an
   order has gone wrong, where is it, and where is the diner's money. So the
   shapes here are reconciliation shapes — every component of a total is named
   separately rather than collapsed into one figure that has to be trusted.

   ## Three nullable things, and each null means something

   `FoodOrderMoney.commissionAmount` and `lamposeNet` are `number | null`
   rather than `number`: an order written before `partnerPayout` settled onto
   the row has no answer to "what did the kitchen net", and a zero there would
   read as "nothing" — a different claim, and a false one. `restaurantName` is
   `''` when neither the order's snapshot nor the live row carries one, and the
   console draws `restaurantId` in that case rather than a name nobody wrote.

   `deliveryOtp` is absent from these shapes because it is absent from the
   payload. The console can see the kitchen's `pickupCode`; the code that
   proves a delivery happened belongs to the diner and stays with them.
   ══════════════════════════════════════════════════════════════════════════ */

export type FoodOrderStatus =
  | 'placed'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'picked_up'
  | 'delivered'
  | 'rejected'
  | 'cancelled';

export type FoodOrderPaymentStatus = 'pending' | 'paid' | 'refunded' | 'failed';

export type FoodOrderPaymentMode = 'online' | 'cod';

export type FoodOrderFulfilment = 'delivery' | 'pickup';

export type FoodDispatchState = 'idle' | 'searching' | 'assigned' | 'unassigned';

/**
 * The three faults the queue knows how to find, and their union.
 *
 * `refund`   — an online order that was cancelled or rejected, or already
 *              marked refunded, with no settled-refund line against it.
 * `dispatch` — still open, and the search for a rider gave up.
 * `stuck`    — still open and older than `stuckAfterMinutes`, excluding online
 *              orders still `pending`, which are abandoned checkouts.
 * `human`    — the DEDUPLICATED union: an order that is both stuck and owed a
 *              refund is one row of work, not two.
 */
export type FoodOrderNeeds = 'human' | 'refund' | 'dispatch' | 'stuck' | 'any';

export type FoodRefundState = 'owed' | 'settled' | 'none';

/**
 * What happened to the money, as far as the record shows.
 *
 * `channel` tells apart a refund this console sent through Razorpay from one
 * somebody made in the gateway's own dashboard and recorded afterwards. Both
 * are settled; only one of them was pressed here.
 */
export interface FoodRefundRecord {
  state: FoodRefundState;
  channel: 'razorpay' | 'manual' | '';
  /** The Razorpay refund id, or the bank reference. Empty unless settled. */
  reference: string;
  at: string | null;
  /** The administrator's name — who signed for it. */
  by: string;
}

export interface FoodOrderFlags {
  refundOwed: boolean;
  dispatchFailed: boolean;
  stuck: boolean;
  /** True when any of the three above is. */
  needsHuman: boolean;
}

/** As much of a rider as a queue row needs: who to ring. */
export interface FoodOrderRiderBrief {
  driverId: string;
  name: string;
  phone: string;
}

/** A row in the queue. The list endpoint projects only these columns. */
export interface FoodOrderRow {
  orderNumber: string;
  placedAt: string | null;
  /** Minutes since `placedAt`, measured server-side against its own clock. */
  ageMinutes: number;
  status: FoodOrderStatus;
  dispatchState: FoodDispatchState;
  dispatchFailureReason: string;
  fulfilment: FoodOrderFulfilment;
  restaurantId: string;
  /** '' when nothing was ever written down — draw `restaurantId` instead. */
  restaurantName: string;
  customerName: string;
  customerPhone: string;
  grandTotal: number;
  paymentMode: FoodOrderPaymentMode;
  paymentStatus: FoodOrderPaymentStatus;
  refund: FoodRefundRecord;
  rider: FoodOrderRiderBrief | null;
  flags: FoodOrderFlags;
}

export interface FoodOrderPage {
  rows: FoodOrderRow[];
  /** Rows on THIS page. `total` is the whole filtered set. */
  count: number;
  total: number;
  page: number;
  pages: number;
}

/**
 * The badge, and the strip of numbers above the queue.
 *
 * `needsHuman` is smaller than `refundOwed + dispatchFailed + stuck` whenever
 * one order carries two faults, which is normal. `byStatus` and
 * `byPaymentStatus` are zero-filled with every value in the model's enum, so
 * the chip row never changes width as orders arrive.
 */
export interface FoodOrderCounts {
  needsHuman: number;
  refundOwed: number;
  /** The summed grand totals of the refund-owed rows, in rupees. */
  refundOwedValue: number;
  dispatchFailed: number;
  stuck: number;
  /** How old an open order has to be before it counts as stuck. */
  stuckAfterMinutes: number;
  openOrders: number;
  byStatus: Record<FoodOrderStatus, number>;
  byPaymentStatus: Record<FoodOrderPaymentStatus, number>;
}

export interface FoodOrderCustomer {
  customerId: string;
  name: string;
  phone: string;
  deliveryAddress: string;
}

export interface FoodOrderRestaurant {
  restaurantId: string;
  name: string;
  address: string;
  phone: string;
  ownerName: string;
  ownerPhone: string;
}

export interface FoodOrderAddOn {
  name: string;
  price: number;
}

/** One line of the bill, snapshotted as it was when the order was placed. */
export interface FoodOrderLine {
  productId: string;
  productName: string;
  variantName: string;
  addOns: FoodOrderAddOn[];
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  isVeg: 'veg' | 'non-veg' | 'egg';
  note: string;
}

/**
 * Every component of the total, named.
 *
 * `commissionAmount` is `itemsTotal − partnerPayout` and `lamposeNet` is
 * `grandTotal − partnerPayout − riderEarnings`, both worked out server-side
 * from figures already on the order. They are null — never zero — when the
 * order never had a payout written; the console draws a dash for that.
 */
export interface FoodOrderMoney {
  itemsTotal: number;
  packagingCharge: number;
  deliveryFee: number;
  discount: number;
  grandTotal: number;
  partnerPayout: number;
  /** Percent, as stored on the order. */
  commissionRate: number;
  commissionAmount: number | null;
  riderEarnings: number;
  lamposeNet: number | null;
}

export interface FoodRefundDetail extends FoodRefundRecord {
  note: string;
}

/** A refund that was attempted and refused, in the gateway's own words. */
export interface FoodRefundFailure {
  note: string;
  at: string | null;
}

export interface FoodOrderPayment {
  mode: FoodOrderPaymentMode;
  status: FoodOrderPaymentStatus;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  /** What the gateway recorded taking, in paise. */
  amountPaise: number;
  paidAt: string | null;
  /** The refund button's enabled state. Decided by the server, not the page. */
  refundable: boolean;
  /** The sentence to show when `refundable` is false. Shown verbatim. */
  refundBlockedReason: string;
  refund: FoodRefundDetail;
  lastFailure: FoodRefundFailure | null;
}

export type FoodDispatchOfferOutcome =
  | 'offered'
  | 'accepted'
  | 'declined'
  | 'timeout'
  | 'cancelled';

/** One rider who was asked, and what they said. */
export interface FoodDispatchOffer {
  driverId: string;
  distanceMeters: number;
  offeredAt: string | null;
  respondedAt: string | null;
  outcome: FoodDispatchOfferOutcome;
  reason: string;
}

export interface FoodOrderDispatch {
  state: FoodDispatchState;
  candidateCount: number;
  attempts: number;
  startedAt: string | null;
  failureReason: string;
  /** The full shortlist. Shown to this console and to nobody else. */
  offers: FoodDispatchOffer[];
}

export interface FoodOrderRider extends FoodOrderRiderBrief {
  vehicle: { type?: string; model?: string; plate?: string };
  assignedAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  earnings: number;
  /** How far away they were when they accepted, in metres. */
  acceptedFromMeters: number;
}

export interface FoodOrderStatusEvent {
  status: FoodOrderStatus;
  at: string | null;
  /** 'system', 'admin', or whichever party moved it. */
  by: string;
  note: string;
}

/** One order, reconciled: the money, the dispatch, the history, the gateway. */
export interface FoodOrderDetail {
  orderNumber: string;
  placedAt: string | null;
  status: FoodOrderStatus;
  fulfilment: FoodOrderFulfilment;
  promisedMinutes: number;
  rejectionReason: string;
  ageMinutes: number;
  customer: FoodOrderCustomer;
  restaurant: FoodOrderRestaurant;
  lines: FoodOrderLine[];
  money: FoodOrderMoney;
  payment: FoodOrderPayment;
  dispatch: FoodOrderDispatch;
  rider: FoodOrderRider | null;
  /** The KITCHEN's hand-over code. The diner's delivery OTP is not sent here. */
  pickupCode: string;
  statusHistory: FoodOrderStatusEvent[];
  flags: FoodOrderFlags;
  /**
   * Where the order was placed. A 'web' order is delivered by whoever the
   * restaurant arranged, and only the diner or an admin says it arrived; an
   * 'app' order has a real driver who completes it in the driver app.
   */
  channel: 'web' | 'app';
  /** Who the restaurant said would deliver a website order: '' until chosen. */
  deliveryMethod: '' | 'self' | 'driver';
  /**
   * May an admin mark this order delivered right now? The SERVER decides — a
   * website delivery order that is ready or already taken by the delivery boy —
   * and the button is drawn from this alone. The role gate is separate.
   */
  canMarkDelivered: boolean;
}

/**
 * What the console asks the queue for.
 *
 * `status` and `paymentStatus` accept an array because the route accepts a
 * comma list — "everything still open" is five statuses, and the alternative
 * is five requests or a filter that cannot say it.
 */
export interface FoodOrderQuery {
  needs?: FoodOrderNeeds | '';
  status?: FoodOrderStatus | FoodOrderStatus[] | 'all' | '';
  paymentStatus?: FoodOrderPaymentStatus | FoodOrderPaymentStatus[] | 'all' | '';
  paymentMode?: FoodOrderPaymentMode | 'all' | '';
  dispatchState?: FoodDispatchState | 'all' | '';
  restaurantId?: string;
  /** 'YYYY-MM-DD' or a full ISO stamp. A bare `to` date covers its whole day. */
  from?: string;
  to?: string;
  /** An order-number prefix, a phone substring, or an exact gateway id. */
  q?: string;
  /** Left unset, the server sorts oldest-first when a `needs` filter is on. */
  sort?: 'oldest' | 'newest' | '';
  page?: number;
  limit?: number;
}

/**
 * Why a refund was refused, in the server's own vocabulary.
 *
 * The console branches on these rather than on the HTTP status, because three
 * different 409s mean three different next actions: one says the money already
 * went, one says it was never owed, and one says a click is still in the air.
 */
export type FoodRefundCode =
  | 'BAD_INPUT'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'ALREADY_REFUNDED'
  | 'NOT_OWED'
  | 'NO_PAYMENT_ID'
  | 'REFUND_IN_FLIGHT'
  | 'REFUND_FAILED'
  | 'PAYMENTS_NOT_CONFIGURED'
  | 'DB_DISCONNECTED';

/**
 * What came back from either refund route.
 *
 * `recorded` is the one field that must be read before anything else. It is
 * false in exactly one situation — the gateway sent the money and the order
 * could not be saved — and in that situation there is no `order`, only the
 * reference and a warning somebody has to act on by hand. That case arrives as
 * a 200 rather than a 500 on purpose: a 500 reads as "the refund failed", and
 * the one thing that must not happen next is somebody sending it again.
 */
export interface FoodRefundResult {
  recorded: boolean;
  orderNumber: string;
  /** The server's confirmation sentence, carrying the real figure. */
  message: string;
  /** Non-empty only in the `recorded: false` shape. */
  warning: string;
  refund: FoodRefundDetail;
  /** The whole order again, already updated. Null when `recorded` is false. */
  order: FoodOrderDetail | null;
}
