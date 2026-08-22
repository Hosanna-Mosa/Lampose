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

export type AdminRole = 'Super Admin' | 'Admin' | 'Editor' | 'Viewer';
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

export type PropertyCategory = 'PG_HOSTEL' | 'BACHELOR' | 'HOTEL' | 'COLIVE';

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
