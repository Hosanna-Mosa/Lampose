/* ══════════════════════════════════════════════════════════════════════════
   Monitor — the two filter rows each tab offers.

   Each table shape answers its own questions, so each gets its own filters:

     Hotel       Payout (our settlement state) · Payment (the guest's)
     Bachelor    Payment (the visit fee) · Request (where the ask stands)
     PG / Co-live  Owner answer · Commission

   A dimension is just "which bucket is this row in". The page counts every
   bucket over the rows that pass the search and the OTHER dimension, so the
   number on a chip is what pressing it would show.
   ══════════════════════════════════════════════════════════════════════════ */
import type { BadgeTone } from '../../common/atoms/Badge';
import type { MonitorRow } from '../../../api/services/monitorService';
import { PAYMENT_TONE, SETTLEMENT_TONE } from './index';

export type MonitorShape = 'hotel' | 'bachelor' | 'free';

export type MonitorOption = { id: string; label: string; tone?: BadgeTone };

export type MonitorDimension = {
  label: string;
  key: (row: MonitorRow) => string;
  /** Fixed buckets. Absent means "whatever values the rows carry". */
  options?: MonitorOption[];
  /** How a value found in the rows reads, for dimensions without `options`. */
  describe?: (id: string) => MonitorOption;
};

const PAYMENT: MonitorDimension = {
  label: 'Payment',
  key: (r) => r.paymentStatus || 'not_required',
  options: [
    { id: 'paid', label: 'Paid', tone: PAYMENT_TONE.paid },
    { id: 'pending', label: 'Pending', tone: PAYMENT_TONE.pending },
    { id: 'failed', label: 'Failed', tone: PAYMENT_TONE.failed },
    { id: 'expired', label: 'Expired', tone: PAYMENT_TONE.expired },
    { id: 'not_required', label: 'Not required', tone: PAYMENT_TONE.not_required },
  ],
};

/** The server's own words for a request, made readable. Unknown ones pass through. */
const humanise = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ') : 'Unknown');

export const MONITOR_FILTERS: Record<MonitorShape, [MonitorDimension, MonitorDimension]> = {
  hotel: [
    {
      label: 'Payout',
      /* No settlement is its own bucket — a paid booking without one is a
         fault the table already calls out, and it needs finding. */
      key: (r) => r.settlement?.status ?? 'none',
      options: [
        ...(Object.keys(SETTLEMENT_TONE) as Array<keyof typeof SETTLEMENT_TONE>).map((id) => ({
          id,
          label: SETTLEMENT_TONE[id].label,
          tone: SETTLEMENT_TONE[id].tone,
        })),
        { id: 'none', label: 'No settlement', tone: 'warn' },
      ],
    },
    PAYMENT,
  ],
  bachelor: [
    PAYMENT,
    {
      label: 'Request',
      key: (r) => r.requestStatus || 'unknown',
      describe: (id) => ({
        id,
        label: humanise(id),
        tone: id === 'pending_owner' ? 'warn' : id === 'confirmed' || id === 'accepted' ? 'good' : 'neutral',
      }),
    },
  ],
  free: [
    {
      label: 'Owner answer',
      key: (r) => (r.ownerAccepted ? 'accepted' : r.ownerAnswered ? 'declined' : 'waiting'),
      options: [
        { id: 'waiting', label: 'Waiting', tone: 'warn' },
        { id: 'accepted', label: 'Accepted', tone: 'good' },
        { id: 'declined', label: 'Declined', tone: 'crit' },
      ],
    },
    {
      label: 'Commission',
      key: (r) => (r.commissionCollected ? 'collected' : r.ownerAccepted ? 'owed' : 'not_due'),
      options: [
        { id: 'owed', label: 'Not collected', tone: 'warn' },
        { id: 'collected', label: 'Collected', tone: 'good' },
        { id: 'not_due', label: 'Not due' },
      ],
    },
  ],
};
