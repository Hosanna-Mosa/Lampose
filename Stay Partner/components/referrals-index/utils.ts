/*
 * Helpers and types belonging to app/referrals/index.tsx, used by the components
 * extracted from it. §4: "shared helpers to its utils".
 */
import { type } from '@/constants/typography';

export type ReferralEntry = {
  id: string;
  name: string;
  propertyName: string;
  /* 'invited' — code generated, not yet used. 'expired' — the 7-day window
     closed unused. 'joined' — redeemed, and the ONLY status that ever earned
     points; an invited or expired row is worth 0 until (if ever) it flips. */
  status: 'invited' | 'expired' | 'joined';
  date: Date;
  rewardPoints: number;
  kind: 'owner' | 'customer';
};

export const STATUS_META: Record<ReferralEntry['status'], { label: string; tone: 'success' | 'warning' | 'neutral' }> = {
  joined: { label: 'Joined', tone: 'success' },
  invited: { label: 'Invited', tone: 'warning' },
  expired: { label: 'Expired', tone: 'neutral' },
};
