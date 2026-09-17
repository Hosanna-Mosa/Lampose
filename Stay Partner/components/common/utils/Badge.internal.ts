/* Private helpers and shared types from the old components/ui/Badge.tsx.
 * §4: utils holds style helpers, formatters and colour maps. */
import { StyleSheet } from 'react-native';
import { fonts } from '@/constants/typography';

export const PILL = {
  md: { padV: 5, padH: 12, font: 12, radius: 20 },
  sm: { padV: 3, padH: 9, font: 11, radius: 16 },
} as const;

export const RECT = {
  md: { padV: 5, padH: 10, font: 12, radius: 7, icon: 11 },
  sm: { padV: 3, padH: 8, font: 10.5, radius: 6, icon: 9 },
} as const;

/**
 * Two deliberately unmistakable badge families, per Booking Management.dc.html:
 *
 *   BookingStatusBadge — tint fill, pill shape, text only
 *   PaymentStatusBadge — solid fill, rounded rect, icon + text
 *
 * Different shape, fill, and typographic treatment, so booking state and money
 * state can never be confused. They appear side by side and are never merged.
 */

// ── Booking status ────────────────────────────────────────────────────────

/**
 * Where a booking is, from an OWNER's point of view.
 *
 * `arriving` and `departing` are the two an owner actually runs their day on
 * — who is turning up, who is leaving — and both used to be discarded: the
 * server's mapper folded `arriving` into `confirmed` and `departing` into
 * `inHouse`, so a list of ten bookings all read "Confirmed" and the one
 * arriving this afternoon looked identical to the one arriving in March.
 *
 * They are derived from the dates rather than stored, because they change at
 * midnight on their own — see `Backend/src/modules/partners/bookingStage.util.js`.
 */

export const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  pillText: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    lineHeight: 16,
  },
  rect: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 7,
  },
  rectText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    lineHeight: 16,
  },
});

export type BadgeSize = 'md' | 'sm';

// The design system page draws these larger than the list rows do; both exist.

export type BookingStatus =
  | 'confirmed'
  | 'arriving'
  /** Due before today, still not checked in. Was folded into `arriving` — see `bookingStage.util.js`. */
  | 'overdueArrival'
  | 'pending'
  | 'inHouse'
  | 'departing'
  /** In-house, past the day they were due to leave, not checked out. */
  | 'overdueDeparture'
  | 'completed'
  | 'cancelled'
  | 'declined'
  | 'expired'
  | 'draft';

export type PaymentStatus = 'paid' | 'pending' | 'failed' | 'refunded';

export type PayoutState = 'pending' | 'processing' | 'completed' | 'failed';

/**
 * A transfer's state. Deliberately the same solid-rect-plus-icon shape as
 * PaymentStatusBadge — both describe money moving, and the design system's
 * split is between *money* and *booking* state, not between these two.
 */
