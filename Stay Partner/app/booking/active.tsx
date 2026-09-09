import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
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
import { type Booking } from '@/lib/bookings';
import { useBooking } from '@/services/hooks/useBookings';
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
  /* Was `getBooking(id)` — the fixture array — so a real id landed on "Stay
     not found" and the only screen an owner sees during a stay was
     unreachable. See `services/hooks/useBookings.ts`. */
  const { booking, notFound, isPending, isRefetching, refetch } = useBooking(id);

  if (isPending && !booking) {
    return (
      <Screen scroll={false} padX={22} background="bg">
        <View style={styles.loading}>
          <ActivityIndicator color={c.accent} />
        </View>
      </Screen>
    );
  }

  if (!booking) {
    return (
      <Screen scroll={false} padX={22} background="bg">
        <EmptyState
          icon="search"
          title="Stay not found"
          body={notFound ? 'It may have been cancelled.' : 'We could not load this stay.'}
          actionLabel="Back"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  /*
   * Not for a bachelor room, PG/Hostel or Co-living, even reached directly.
   *
   * The three places that used to link here — `PrimaryAction` in
   * `booking/[id].tsx`, `booking/checked-in.tsx`, and this screen's own
   * fallback below — no longer offer the button that opens it for any of
   * these categories. Bachelor's reason: `booking.checkOut` is a fallback
   * value here, not a date anybody agreed to, since that tenancy is never
   * given a length or a move-out day. PG/Hostel and Co-living's checkout
   * dates are usually real, but the destination is withheld anyway — same
   * "direct arrangement, nothing on Lampose's side to track" reasoning as
   * the payout figure and owner-messaging already withheld on the booking
   * screen. This is the guard for whatever reaches the route some third
   * way — a stale notification, a saved deep link — rather than trusting
   * that nothing ever will.
   */
  if (booking.category === 'BACHELOR' || booking.category === 'PG_HOSTEL' || booking.category === 'COLIVE') {
    return (
      <Screen scroll={false} padX={22} background="bg">
        <EmptyState
          icon="search"
          title="Not available for this room"
          body={booking.category === 'BACHELOR'
            ? 'Bachelor stays have no fixed length, so there is no checkout to track here.'
            : 'This stay is a direct arrangement with the guest, so there is nothing to track here.'}
          actionLabel="Go back to home"
          onAction={() => router.replace('/')}
        />
      </Screen>
    );
  }

  const { currentDay, totalDays, ratio } = stayProgress(booking);
  const departsToday = isSameDay(booking.checkOut, new Date());

  /* The footer button and the shortcut are the same act, so they are the same
     function. The shortcut previously called an `openCheckout` that was never
     declared — a ReferenceError the first time anybody pressed it, which
     typechecking had been reporting and nothing was reading. */
  const openCheckout = () =>
    router.push({ pathname: '/booking/checkout', params: { id: booking.id } });

  return (
    <Screen
      padX={22}
            contentStyle={styles.container}
            refreshing={isRefetching}
            onRefresh={refetch}
            footer={
              departsToday ? (
                <Button
                  label="Confirm checkout"
                  onPress={openCheckout}
                />
              ) : (
                <Button
                  label={`Checkout available ${MONTHS[booking.checkOut.getMonth()]} ${booking.checkOut.getDate()}`}
                  disabled
                />
              )
            }
      stickyHeader={
        <>
          <View style={styles.backRow}>
            <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
          </View>
        </>
      }
    >

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
          <View style={[styles.trackFill, { width: `${ratio * 100}%`, backgroundColor: c.accent }]} />
        </View>
        <Text style={[styles.checkoutLine, { color: c.accentInk }]}>
          Checkout {formatDayDate(booking.checkOut)}{booking.checkOutBy ? ` · ${booking.checkOutBy}` : ''}
        </Text>
      </View>

      <View style={styles.shortcuts}>
        {/*
          "Message guest" implies in-app messaging with the guest, which does
          not exist — there is no guest-facing thread on the other end. This
          used to push `/support` with a `topic: 'guest'` param nothing ever
          read; it now opens the real place a guest issue actually goes
          (`support.audiences.js`'s `guest` category), which is at least
          honest about what happens next even though the label still
          overpromises a DM this does not open.
        */}
        <Shortcut
          icon="message"
          label="Report an issue"
          onPress={() => router.push('/support/dispute')}
        />
        <Shortcut icon="suitcase" label="Checkout" onPress={openCheckout} />
      </View>
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
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.shortcut,
        {
          borderColor: c.borderCard,
          backgroundColor: c.surface,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      <Icon name={icon} size={18} color={c.textPrimary} />
      <Text variant="badge" style={styles.shortcutLabel}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
  guestName: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 22 },
  roomType: { fontSize: 12, marginTop: 1 },
  badge: { marginBottom: 20 },

  progressCard: { borderRadius: radius.card, padding: 16, marginBottom: 16, gap: 8 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  trackFill: { height: '100%', borderRadius: 3 },
  checkoutLine: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 17 },

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
  shortcutLabel: { fontSize: 12 },
  spacer: { flex: 1 },
});
