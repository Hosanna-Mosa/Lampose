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

export type BookingStatus =
  | 'confirmed'
  | 'pending'
  | 'inHouse'
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

  const map: Record<BookingStatus, { label: string; fg: string; bg: string }> = {
    confirmed: { label: 'Confirmed', fg: c.successOnTint, bg: c.successTint },
    pending: { label: 'Pending', fg: c.warningOnTint, bg: c.warningTint },
    inHouse: { label: 'In-house', fg: c.accent, bg: c.accentTint },
    completed: { label: 'Completed', fg: c.info, bg: c.infoTint },
    cancelled: { label: 'Cancelled', fg: c.error, bg: c.errorTint },
    declined: { label: 'Declined', fg: c.textSecondary, bg: c.borderSubtle },
    expired: { label: 'Expired', fg: c.textSecondary, bg: c.borderSubtle },
    draft: { label: 'Draft', fg: c.textSecondary, bg: c.borderSubtle },
  };
  const s = map[status];

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
  const s = map[status];

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

export type PayoutState = 'processing' | 'completed' | 'failed';

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

  const map: Record<PayoutState, { label: string; bg: string; icon: IconName }> = {
    processing: { label: 'Processing', bg: c.warningFill, icon: 'clock' },
    completed: { label: 'Completed', bg: c.success, icon: 'check' },
    failed: { label: 'Failed', bg: c.error, icon: 'alert-circle' },
  };
  const s = map[status];
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
