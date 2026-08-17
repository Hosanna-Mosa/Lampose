import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { BookingStatusBadge, type BookingStatus } from './Badge';
import { CountdownChip, urgencyOf } from './CountdownChip';
import { radius } from '@/constants/layout';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';

export type BookingRequest = {
  id: string;
  guest: string;
  /** Pre-formatted for display, e.g. "Aug 20 – 22". */
  dates: string;
  roomType: string;
  amount: string;
  status: BookingStatus;
  /** Epoch ms. Already past for expired requests. */
  expiresAt: number;
};

/**
 * One request in the inbox. The border tracks urgency — a critical request gets
 * a red outline so the row itself reads as urgent, not just the chip inside it.
 */
export function RequestCard({
  request,
  onPress,
}: {
  request: BookingRequest;
  onPress?: () => void;
}) {
  const c = useColors();
  const urgency = urgencyOf(request.expiresAt - Date.now());
  const expired = urgency === 'expired';

  const border = expired
    ? { width: 1, color: c.borderSubtle }
    : urgency === 'critical'
      ? { width: 1.5, color: `${c.error}4D` } // 30% — an outline, not a second badge
      : { width: 1, color: c.borderCard };

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${request.guest}, ${request.dates}, ${request.roomType}, ${request.amount}`}
      style={({ pressed }) => [
        styles.card,
        {
          borderWidth: border.width,
          borderColor: border.color,
          backgroundColor: c.surface,
          opacity: expired ? 0.55 : pressed ? 0.75 : 1,
        },
      ]}
    >
      <View style={styles.topRow}>
        <View style={styles.identity}>
          <Text variant="bodyMedium" style={styles.guest}>
            {request.guest}
          </Text>
          <Text variant="caption" color="textSecondary" style={styles.meta}>
            {request.dates} · {request.roomType}
          </Text>
        </View>
        <Text variant="bodyMedium" tabular style={styles.amount}>
          {request.amount}
        </Text>
      </View>

      <View style={styles.bottomRow}>
        <BookingStatusBadge status={request.status} />
        <CountdownChip expiresAt={request.expiresAt} bare={expired} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.chip + 2,
    padding: 14,
    gap: 8,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  identity: { flex: 1 },
  guest: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 20 },
  meta: { fontSize: 13, marginTop: 1 },
  amount: { fontFamily: fonts.extrabold, fontSize: 15, lineHeight: 20 },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
});
