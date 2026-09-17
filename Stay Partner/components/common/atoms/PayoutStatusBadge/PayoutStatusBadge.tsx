import { View, type ViewStyle } from 'react-native';
import { Text } from '@/components/common/atoms/Text';
import { Icon } from '@/components/common/atoms/Icon';
import { type IconName } from '@/components/common/atoms/Icon';
import { useColors } from '@/hooks/useColors';
import { RECT, styles, BadgeSize, PayoutState } from '@/components/common/utils/Badge.internal';

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
