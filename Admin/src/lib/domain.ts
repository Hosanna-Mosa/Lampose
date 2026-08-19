import {
  Building2,
  CalendarCheck,
  CheckCircle2,
  CircleDot,
  Clock,
  Hourglass,
  KeyRound,
  Lock,
  MailCheck,
  PhoneCall,
  PhoneOutgoing,
  Pencil,
  Send,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Star,
  TimerOff,
  Trash2,
  UserCheck,
  UserCog,
  XCircle,
} from 'lucide-react';
import type { ElementType } from 'react';
import type { BadgeTone } from '../components/ui';
import type {
  AdminRole,
  AdminStatus,
  LeadStatus,
  PermissionAction,
  PermissionStatus,
  ScrapeJobStatus,
  VerificationStatus,
  VisitRequestStatus,
} from '../api/types';

/** One place where a domain value becomes a tone + icon, so status reads the
 *  same on every page and never relies on colour alone. */

export const VERIFICATION_META: Record<
  VerificationStatus,
  { tone: BadgeTone; icon: ElementType; label: string; chartColor: string }
> = {
  verified: { tone: 'good', icon: ShieldCheck, label: 'Verified', chartColor: 'var(--chart-good)' },
  delivered: { tone: 'brand', icon: MailCheck, label: 'Delivered', chartColor: 'var(--chart-series)' },
  sent: { tone: 'brand', icon: Send, label: 'Sent', chartColor: 'var(--chart-series)' },
  pending: { tone: 'warn', icon: Hourglass, label: 'Pending', chartColor: 'var(--chart-warning)' },
  // The owner replied YES and a verifier was picked — waiting on that verifier now.
  owner_approved: { tone: 'brand', icon: UserCheck, label: 'Forwarded to verifier', chartColor: 'var(--chart-series)' },
  // The verifier replied NO — distinct from the owner rejecting their own listing.
  verifier_rejected: { tone: 'crit', icon: ShieldX, label: 'Verifier rejected', chartColor: 'var(--chart-critical)' },
  rejected: { tone: 'crit', icon: XCircle, label: 'Owner rejected', chartColor: 'var(--chart-critical)' },
  expired: { tone: 'neutral', icon: TimerOff, label: 'Expired', chartColor: 'var(--chart-serious)' },
  failed: { tone: 'crit', icon: ShieldX, label: 'Failed', chartColor: 'var(--chart-critical)' },
};

export const verificationMeta = (status: string) =>
  VERIFICATION_META[status as VerificationStatus] ?? {
    tone: 'neutral' as BadgeTone,
    icon: ShieldAlert,
    label: status || 'Unknown',
    chartColor: 'var(--chart-neutral)',
  };

/** Every status the `verificationrequests` model's enum accepts, in the order
 *  a request actually moves through them. */
export const VERIFICATION_STATUSES: VerificationStatus[] = [
  'pending',
  'sent',
  'delivered',
  'owner_approved',
  'verified',
  'verifier_rejected',
  'rejected',
  'failed',
  'expired',
];

export const PERMISSION_STATUS_META: Record<
  PermissionStatus,
  { tone: BadgeTone; icon: ElementType; label: string }
> = {
  pending: { tone: 'warn', icon: Hourglass, label: 'Awaiting decision' },
  granted: { tone: 'good', icon: KeyRound, label: 'Granted' },
  denied: { tone: 'crit', icon: ShieldX, label: 'Denied' },
  revoked: { tone: 'crit', icon: ShieldX, label: 'Revoked' },
  used: { tone: 'neutral', icon: Lock, label: 'Spent' },
};

export const permissionStatusMeta = (status: string) =>
  PERMISSION_STATUS_META[status as PermissionStatus] ?? {
    tone: 'neutral' as BadgeTone,
    icon: ShieldAlert,
    label: status || 'Unknown',
  };

export const PERMISSION_ACTION_META: Record<
  PermissionAction,
  { tone: BadgeTone; icon: ElementType; label: string }
> = {
  edit: { tone: 'brand', icon: Pencil, label: 'Edit listing' },
  delete: { tone: 'crit', icon: Trash2, label: 'Delete listing' },
};

export const PERMISSION_STATUSES: PermissionStatus[] = [
  'pending',
  'granted',
  'denied',
  'revoked',
  'used',
];

export const ADMIN_STATUS_META: Record<
  AdminStatus,
  { tone: BadgeTone; icon: ElementType }
> = {
  Active: { tone: 'good', icon: CheckCircle2 },
  Pending: { tone: 'warn', icon: Clock },
  Inactive: { tone: 'neutral', icon: XCircle },
};

export const adminStatusMeta = (status: string) =>
  ADMIN_STATUS_META[status as AdminStatus] ?? { tone: 'neutral' as BadgeTone, icon: XCircle };

export const ADMIN_ROLES: AdminRole[] = ['Super Admin', 'Admin', 'Editor', 'Viewer'];
export const ADMIN_STATUSES: AdminStatus[] = ['Active', 'Inactive', 'Pending'];

/**
 * Categories accepted by the Property schema's enum.
 *
 * Codes, not labels — see Backend/src/shared/constants/categories.js, which
 * is where the list is actually defined. `PROPERTY_CATEGORY_LABEL` below is
 * what a person reads; this is what goes over the wire and into the column.
 */
export const PROPERTY_CATEGORIES = ['PG_HOSTEL', 'BACHELOR', 'HOTEL', 'COLIVE'];

/** Code → what the console shows. Unknown codes render as themselves. */
export const PROPERTY_CATEGORY_LABEL: Record<string, string> = {
  PG_HOSTEL: 'PG / Hostel',
  BACHELOR: 'Bachelor',
  HOTEL: 'Hotels',
  COLIVE: 'House / Co-live',
};

export const propertyCategoryLabel = (code: string): string =>
  PROPERTY_CATEGORY_LABEL[code] ?? code;
export const STAY_TYPES = ['Short Stay', 'Long Stay', 'Both Short & Long Stay'];

/** Categorical slots in the fixed validated order — assigned, never cycled. */
const SERIES_HUES = [
  'var(--chart-series)',
  'var(--chart-serious)',
  'var(--chart-good)',
  'var(--chart-warning)',
];

/**
 * Colour follows the entity, not its rank: a category keeps the same hue on
 * every chart even when a filter or a tie reorders the buckets.
 */
const hueByIdentity = (order: string[]) => (label: string, fallbackIndex: number): string => {
  const i = order.indexOf(label);
  return SERIES_HUES[(i === -1 ? order.length + fallbackIndex : i) % SERIES_HUES.length];
};

export const categoryHue = hueByIdentity(PROPERTY_CATEGORIES);
export const stayTypeHue = hueByIdentity(['Long Stay', 'Short Stay', 'Both Short & Long Stay']);

export const ACTIVITY_ICON = {
  property: Building2,
  verification: ShieldCheck,
  admin: UserCog,
} as const;

export const ACTIVITY_TONE: Record<string, BadgeTone> = {
  good: 'good',
  warning: 'warn',
  critical: 'crit',
  info: 'brand',
};

/* ── Database control pages ──────────────────────────────────────────── */

export const VISIT_STATUS_META: Record<
  VisitRequestStatus,
  { tone: BadgeTone; icon: ElementType; label: string }
> = {
  otp_pending: { tone: 'neutral', icon: Clock, label: 'OTP pending' },
  pending_owner: { tone: 'warn', icon: Hourglass, label: 'Awaiting owner' },
  confirmed: { tone: 'good', icon: CalendarCheck, label: 'Confirmed' },
  declined: { tone: 'crit', icon: ShieldX, label: 'Declined' },
  expired: { tone: 'neutral', icon: TimerOff, label: 'Expired' },
};

export const visitStatusMeta = (status: string) =>
  VISIT_STATUS_META[status as VisitRequestStatus] ?? {
    tone: 'neutral' as BadgeTone,
    icon: ShieldAlert,
    label: status || 'Unknown',
  };

export const VISIT_STATUSES: VisitRequestStatus[] = [
  'otp_pending',
  'pending_owner',
  'confirmed',
  'declined',
  'expired',
];

export const SCRAPE_JOB_STATUS_META: Record<ScrapeJobStatus, { tone: BadgeTone; icon: ElementType }> = {
  started: { tone: 'brand', icon: Clock },
  running: { tone: 'brand', icon: Hourglass },
  completed: { tone: 'good', icon: CheckCircle2 },
  stopped: { tone: 'neutral', icon: XCircle },
  error: { tone: 'crit', icon: ShieldAlert },
};

export const scrapeJobStatusMeta = (status: string) =>
  SCRAPE_JOB_STATUS_META[status as ScrapeJobStatus] ?? { tone: 'neutral' as BadgeTone, icon: ShieldAlert };

export const SCRAPE_JOB_STATUSES: ScrapeJobStatus[] = ['started', 'running', 'completed', 'stopped', 'error'];
export const SCRAPE_SOURCES = ['GoogleMaps', 'JustDial', 'Web'];

export const LEAD_STATUS_META: Record<LeadStatus, { tone: BadgeTone; icon: ElementType; label: string }> = {
  NEW: { tone: 'neutral', icon: CircleDot, label: 'New' },
  CONTACTED: { tone: 'brand', icon: PhoneOutgoing, label: 'Contacted' },
  INTERESTED: { tone: 'warn', icon: Star, label: 'Interested' },
  QUALIFIED: { tone: 'brand', icon: CheckCircle2, label: 'Qualified' },
  CALLBACK: { tone: 'warn', icon: PhoneCall, label: 'Callback' },
  CLOSED_WON: { tone: 'good', icon: CheckCircle2, label: 'Closed — won' },
  CLOSED_LOST: { tone: 'crit', icon: XCircle, label: 'Closed — lost' },
};

export const leadStatusMeta = (status: string) =>
  LEAD_STATUS_META[status as LeadStatus] ?? { tone: 'neutral' as BadgeTone, icon: ShieldAlert, label: status || 'Unknown' };

export const LEAD_STATUSES: LeadStatus[] = [
  'NEW',
  'CONTACTED',
  'INTERESTED',
  'QUALIFIED',
  'CALLBACK',
  'CLOSED_WON',
  'CLOSED_LOST',
];
