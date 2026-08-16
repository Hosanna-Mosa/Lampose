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

export type PropertyCategory = 'PG' | 'Hostel' | 'Dormitory' | 'Bachelor Room';

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
  ownerMobile: string;
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
  categoryDetails: Record<string, unknown>;
  createdAt: string | null;
  updatedAt: string | null;
}

export type VerificationStatus =
  | 'pending'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'verified'
  | 'expired';

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
