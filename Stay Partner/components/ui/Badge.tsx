import { StyleSheet, View, type ViewStyle } from 'react-native';
import { Text } from './Text';
import { Icon, type IconName } from './Icon';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';

export type BadgeSize = 'md' | 'sm';

// The design system page draws these larger than the list rows do; both exist.
const PILL = {
  md: { padV: 5, padH: 12, font: 12, radius: 20 },
  sm: { padV: 3, padH: 9, font: 11, radius: 16 },
} as const;
const RECT = {
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

export function BookingStatusBadge({
  status,
  size = 'md',
  style,
}: {
  status: BookingStatus;
  /** `sm` is the list-row size; `md` matches the design system page. */
  size?: BadgeSize;
  style?: ViewStyle;
}) {
  const c = useColors();

  /*
   * The LABEL is the carrier, not the colour.
   *
   * This family is deliberately text-only — shape and the absence of an icon
   * are what stop it being confused with the money badges beside it — so the
   * words have to do the whole job. "Arriving today" says something
   * "Confirmed" never could, and it still says it in greyscale, in sunlight,
   * and to somebody who cannot tell the green pill from the amber one.
   *
   * Two states carry today's date in the word because they are today by
   * definition: nothing is `arriving` tomorrow.
   */
  const map: Record<BookingStatus, { label: string; fg: string; bg: string }> = {
    arriving: { label: 'Arriving today', fg: c.warningOnTint, bg: c.warningTint },
    /* Red, not amber — this one used to say "Arriving today" for a guest due
       two months ago, which read as the app being wrong rather than the
       guest being late. */
    overdueArrival: { label: 'Overdue arrival', fg: c.error, bg: c.errorTint },
    confirmed: { label: 'Confirmed', fg: c.successOnTint, bg: c.successTint },
    pending: { label: 'Pending', fg: c.warningOnTint, bg: c.warningTint },
    inHouse: { label: 'In-house', fg: c.accent, bg: c.accentTint },
    departing: { label: 'Checking out today', fg: c.accent, bg: c.accentTint },
    overdueDeparture: { label: 'Overdue checkout', fg: c.error, bg: c.errorTint },
    completed: { label: 'Completed', fg: c.info, bg: c.infoTint },
    cancelled: { label: 'Cancelled', fg: c.error, bg: c.errorTint },
    declined: { label: 'Declined', fg: c.textSecondary, bg: c.borderSubtle },
    expired: { label: 'Expired', fg: c.textSecondary, bg: c.borderSubtle },
    draft: { label: 'Draft', fg: c.textSecondary, bg: c.borderSubtle },
  };
  const s = map[status] ?? map.confirmed;

  const d = PILL[size];
  return (
    <View
      style={[
        styles.pill,
        { backgroundColor: s.bg, paddingVertical: d.padV, paddingHorizontal: d.padH, borderRadius: d.radius },
        style,
      ]}
    >
      <Text style={[styles.pillText, { color: s.fg, fontSize: d.font, lineHeight: d.font + 4 }]}>
        {s.label}
      </Text>
    </View>
  );
}

// ── Payment status ────────────────────────────────────────────────────────

export type PaymentStatus = 'paid' | 'pending' | 'failed' | 'refunded';

export function PaymentStatusBadge({
  status,
  size = 'md',
  style,
}: {
  status: PaymentStatus;
  size?: BadgeSize;
  style?: ViewStyle;
}) {
  const c = useColors();

  const map: Record<PaymentStatus, { label: string; bg: string; icon: IconName }> = {
    paid: { label: 'Paid', bg: c.success, icon: 'check' },
    pending: { label: 'Pending', bg: c.warningFill, icon: 'clock' },
    failed: { label: 'Failed', bg: c.error, icon: 'alert-circle' },
    refunded: { label: 'Refunded', bg: c.info, icon: 'refresh' },
  };
  /* Every other badge family in this file falls back rather than indexing
     straight into the map — this one did not, so a status this map has no
     entry for (a stale build's older `PaymentStatus`, a value some other
     screen's data never actually guaranteed) crashed on `s.bg` below instead
     of drawing something. */
  const s = map[status] ?? map.pending;

  const d = RECT[size];
  return (
    <View
      style={[
        styles.rect,
        { backgroundColor: s.bg, paddingVertical: d.padV, paddingHorizontal: d.padH, borderRadius: d.radius },
        style,
      ]}
    >
      <Icon name={s.icon} size={d.icon} color={c.white} strokeWidth={2.5} />
      <Text style={[styles.rectText, { color: c.white, fontSize: d.font, lineHeight: d.font + 4 }]}>
        {s.label}
      </Text>
    </View>
  );
}

// ── Payout status ─────────────────────────────────────────────────────────

export type PayoutState = 'pending' | 'processing' | 'completed' | 'failed';

/**
 * A transfer's state. Deliberately the same solid-rect-plus-icon shape as
 * PaymentStatusBadge — both describe money moving, and the design system's
 * split is between *money* and *booking* state, not between these two.
 */
export function PayoutStatusBadge({
  status,
  size = 'md',
  style,
}: {
  status: PayoutState;
  size?: BadgeSize;
  style?: ViewStyle;
}) {
  const c = useColors();

  /* `pending` is a payout the owner has asked for and nobody has sent yet;
     `processing` is one that has left us and is with the bank. Two different
     answers to "where is my money", and collapsing them told an owner their
     transfer was under way before anyone had touched it. */
  const map: Record<PayoutState, { label: string; bg: string; icon: IconName }> = {
    pending: { label: 'Requested', bg: c.warningFill, icon: 'clock' },
    processing: { label: 'With the bank', bg: c.info, icon: 'refresh' },
    completed: { label: 'Paid', bg: c.success, icon: 'check' },
    failed: { label: 'Failed', bg: c.error, icon: 'alert-circle' },
  };
  const s = map[status] ?? map.pending;
  const d = RECT[size];

  return (
    <View
      style={[
        styles.rect,
        { backgroundColor: s.bg, paddingVertical: d.padV, paddingHorizontal: d.padH, borderRadius: d.radius },
        style,
      ]}
    >
      <Icon name={s.icon} size={d.icon} color={c.white} strokeWidth={2.5} />
      <Text style={[styles.rectText, { color: c.white, fontSize: d.font, lineHeight: d.font + 4 }]}>
        {s.label}
      </Text>
    </View>
  );
}

// ── Generic ───────────────────────────────────────────────────────────────

/** Neutral tint pill for anything outside the two status families — ticket state, staff state. */
export function Badge({
  label,
  tone = 'neutral',
  style,
}: {
  label: string;
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'error' | 'info';
  style?: ViewStyle;
}) {
  const c = useColors();
  const map = {
    neutral: { fg: c.textSecondary, bg: c.borderSubtle },
    accent: { fg: c.accent, bg: c.accentTint },
    success: { fg: c.successOnTint, bg: c.successTint },
    warning: { fg: c.warningOnTint, bg: c.warningTint },
    error: { fg: c.error, bg: c.errorTint },
    info: { fg: c.info, bg: c.infoTint },
  } as const;
  const s = map[tone];

  return (
    <View style={[styles.pill, { backgroundColor: s.bg }, style]}>
      <Text style={[styles.pillText, { color: s.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
