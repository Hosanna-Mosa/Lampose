import { Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Screen,
  Text,
  Button,
  IconButton,
  Icon,
  BookingStatusBadge,
  EmptyState,
  type IconName,
} from '@/components/ui';
import { formatDayDate, initials, isSameDay } from '@/lib/format';
import { getBooking, type Booking } from '@/lib/bookings';
import { radius } from '@/constants/layout';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 86_400_000;

/** Which day of the stay today is, and how far through it that puts them. */
function stayProgress(booking: Booking, now = new Date()) {
  const midnight = (d: Date) => new Date(d).setHours(0, 0, 0, 0);
  const start = midnight(booking.checkIn);
  const end = midnight(booking.checkOut);
  const today = midnight(now);

  const totalDays = Math.max(1, Math.round((end - start) / DAY_MS) + 1);
  const currentDay = Math.min(Math.max(Math.round((today - start) / DAY_MS) + 1, 1), totalDays);
  return { currentDay, totalDays, ratio: currentDay / totalDays };
}

export default function ActiveStayScreen() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const booking = getBooking(id);

  if (!booking) {
    return (
      <Screen scroll={false} padX={22} background="bg">
        <EmptyState
          icon="search"
          title="Stay not found"
          actionLabel="Back"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  const { currentDay, totalDays, ratio } = stayProgress(booking);
  const departsToday = isSameDay(booking.checkOut, new Date());

  return (
    <Screen
      padX={22}
      contentStyle={styles.fill}
      footer={
        departsToday ? (
          <Button
            label="Confirm checkout"
            onPress={() =>
              router.push({ pathname: '/booking/checkout', params: { id: booking.id } })
            }
          />
        ) : (
          <Button
            label={`Checkout available ${MONTHS[booking.checkOut.getMonth()]} ${booking.checkOut.getDate()}`}
            disabled
          />
        )
      }
    >
      <View style={styles.backRow}>
        <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
      </View>

      <View style={styles.guestRow}>
        <View style={[styles.avatar, { backgroundColor: c.accentTint }]}>
          <Text style={[styles.avatarText, { color: c.accentInk }]}>{initials(booking.guest)}</Text>
        </View>
        <View>
          <Text style={styles.guestName}>{booking.guest}</Text>
          <Text variant="badge" color="textSecondary" style={styles.roomType}>
            {booking.roomType}
          </Text>
        </View>
      </View>

      <BookingStatusBadge status="inHouse" style={styles.badge} />

      <View style={[styles.progressCard, { backgroundColor: c.accentTint }]}>
        <Text variant="label" style={{ color: c.accentInk }}>
          Day {currentDay} of {totalDays}
        </Text>
        <View
          style={[styles.track, { backgroundColor: c.surface }]}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: totalDays, now: currentDay }}
        >
          <View style={[styles.fill, { width: `${ratio * 100}%`, backgroundColor: c.accent }]} />
        </View>
        <Text style={[styles.checkoutLine, { color: c.accentInk }]}>
          Checkout {formatDayDate(booking.checkOut)} · {booking.checkOutBy}
        </Text>
      </View>

      <View style={styles.shortcuts}>
        {/* No message thread exists in the design set; this stays inert. */}
        <Shortcut icon="message" label="Message" onPress={() => {}} />
        <Shortcut
          icon="calendar"
          label="Booking"
          onPress={() => router.push({ pathname: '/booking/[id]', params: { id: booking.id } })}
        />
      </View>

      <View style={styles.spacer} />
    </Screen>
  );
}

function Shortcut({
  icon,
  label,
  onPress,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.shortcut,
        { borderColor: c.borderCard, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Icon name={icon} size={17} color={c.accent} />
      <Text variant="badge" style={styles.shortcutLabel}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backRow: { height: 44, justifyContent: 'center', marginLeft: -10, marginBottom: 6 },
  guestRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 20 },
  guestName: { fontFamily: fonts.bold, fontSize: 17, lineHeight: 22 },
  roomType: { fontSize: 12, marginTop: 1 },
  badge: { marginBottom: 20 },

  progressCard: { borderRadius: radius.card, padding: 16, marginBottom: 16, gap: 8 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  checkoutLine: { fontFamily: fonts.medium, fontSize: 12.5, lineHeight: 17 },

  shortcuts: { flexDirection: 'row', gap: 10 },
  shortcut: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.chip,
    padding: 12,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  shortcutLabel: { fontSize: 11.5 },
  spacer: { flex: 1 },
});
