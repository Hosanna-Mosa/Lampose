import { View, type ViewStyle } from 'react-native';
import { Text } from '@/components/common/atoms/Text';
import { Icon } from '@/components/common/atoms/Icon';
import { type IconName } from '@/components/common/atoms/Icon';
import { useColors } from '@/hooks/useColors';
import { RECT, styles, BadgeSize, PaymentStatus } from '@/components/common/utils/Badge.internal';

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
