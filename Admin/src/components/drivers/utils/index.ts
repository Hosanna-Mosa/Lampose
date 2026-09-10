import type { BadgeTone } from '../../common/atoms/Badge';
import type {
  DriverDocumentStatus,
} from '../../../api/types';


export const DOC_TONE: Record<DriverDocumentStatus, BadgeTone> = {
  verified: 'good',
  pending: 'warn',
  rejected: 'crit',
  missing: 'neutral',
};

export const DOC_LABEL: Record<DriverDocumentStatus, string> = {
  verified: 'Verified',
  pending: 'Awaiting review',
  rejected: 'Rejected',
  missing: 'Not sent',
};

export const day = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : '—';

/** How long ago, for a position whose age is the whole of its meaning. */
export const ago = (iso: string | null | undefined): string => {
  if (!iso) return 'never';
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (!Number.isFinite(seconds) || seconds < 0) return 'just now';
  if (seconds < 90) return `${seconds}s ago`;
  if (seconds < 5400) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 172800) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
};
