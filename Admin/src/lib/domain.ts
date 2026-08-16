import {
  Building2,
  CheckCircle2,
  Clock,
  Hourglass,
  KeyRound,
  Lock,
  MailCheck,
  Pencil,
  Send,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  TimerOff,
  Trash2,
  UserCog,
  XCircle,
} from 'lucide-react';
import type { ElementType } from 'react';
import type { BadgeTone } from '../components/ui';
import type {
  AdminRole,
  AdminStatus,
  PermissionAction,
  PermissionStatus,
  VerificationStatus,
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

/** Categories accepted by the Property schema's enum. */
export const PROPERTY_CATEGORIES = ['PG', 'Hostel', 'Dormitory', 'Bachelor Room'];
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
