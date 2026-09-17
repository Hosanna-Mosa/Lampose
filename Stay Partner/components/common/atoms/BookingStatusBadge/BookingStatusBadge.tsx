import { View, type ViewStyle } from 'react-native';
import { Text } from '@/components/common/atoms/Text';
import { useColors } from '@/hooks/useColors';
import { PILL, styles, BadgeSize, BookingStatus } from '@/components/common/utils/Badge.internal';

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
