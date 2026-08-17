import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Screen,
  Text,
  Button,
  IconButton,
  Icon,
  Card,
  DetailRow,
  BookingStatusBadge,
  PaymentStatusBadge,
  EmptyState,
} from '@/components/ui';
import { formatDayDate, formatINR, initials, isSameDay } from '@/lib/format';
import { type Booking, payoutOf } from '@/lib/bookings';
import { fetchBookingById } from '@/services/api/domain.api';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function BookingDetailScreen() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetchBookingById(id)
      .then((b) => {
        if (b) {
          const checkIn = new Date(b.checkInDate || Date.now());
          const checkOut = new Date(b.checkOutDate || Date.now() + 86400000);
          const statusMap: Record<string, any> = {
            in_house: 'inHouse',
            arriving: 'confirmed',
            departing: 'inHouse',
            upcoming: 'confirmed',
            completed: 'completed',
            cancelled: 'cancelled',
          };
          setBooking({
            id: b.id || b._id || id,
            guest: b.guestName || 'Guest',
            roomType: b.shareType || b.roomNumber || 'Standard Room',
            checkIn,
            checkOut,
            guests: '1 guest',
            nights: Math.max(1, Math.round((checkOut.getTime() - checkIn.getTime()) / (1000 * 3600 * 24))),
            status: statusMap[b.status] || 'inHouse',
            payment: 'paid',
            gross: b.totalAmount || 8000,
            checkInCode: '1234',
            checkOutBy: '11:00 AM',
          });
        }
      })
      .catch((err) => console.warn('Error fetching booking detail:', err))
      .finally(() => setLoading(false));
  }, [id]);

  if (!loading && !booking) {
    return (
      <Screen scroll={false} padX={22} background="bg">
        <EmptyState
          icon="search"
          title="Booking not found"
          body="It may have been cancelled."
          actionLabel="Back to bookings"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  if (!booking) return null;

  // A finished stay offers no action, so it gets no footer bar at all.
  const hasAction = booking.status !== 'completed' && booking.status !== 'cancelled';

  // The avatar tint follows booking state, matching the badge beside it.
  const avatar = {
    confirmed: { bg: c.successTint, fg: c.successInk },
    inHouse: { bg: c.accentTint, fg: c.accentInk },
    completed: { bg: c.infoTint, fg: c.info },
    cancelled: { bg: c.errorTint, fg: c.errorInk },
    pending: { bg: c.warningTint, fg: c.warningInk },
    declined: { bg: c.borderSubtle, fg: c.textTertiary },
    expired: { bg: c.borderSubtle, fg: c.textTertiary },
    draft: { bg: c.borderSubtle, fg: c.textTertiary },
  }[booking.status];

  return (
    <Screen
      padX={22}
            contentStyle={styles.stack}
            footer={hasAction ? <PrimaryAction booking={booking} /> : undefined}
      stickyHeader={
        <>
          <View style={styles.backRow}>
            <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
          </View>
        </>
      }
    >

      <View style={styles.guestRow}>
        <View style={[styles.avatar, { backgroundColor: avatar.bg }]}>
          <Text style={[styles.avatarText, { color: avatar.fg }]}>{initials(booking.guest)}</Text>
        </View>
        <View style={styles.guestBody}>
          <Text style={styles.guestName}>{booking.guest}</Text>
          <Text variant="badge" color="textSecondary" style={styles.bookingId}>
            Booking #{booking.id}
          </Text>
        </View>
      </View>

      {/* Always two badges, never one merged status. */}
      <View style={styles.badges}>
        <BookingStatusBadge status={booking.status} />
        <PaymentStatusBadge status={booking.payment} />
      </View>

      <Card>
        <DetailRow label="Check-in" value={formatDayDate(booking.checkIn)} />
        <DetailRow label="Check-out" value={formatDayDate(booking.checkOut)} />
        <DetailRow label="Room" value={booking.roomType} />
        <DetailRow label="Guests" value={booking.guests} last />
      </Card>

      <Card>
        <DetailRow label="Total payout" value={formatINR(payoutOf(booking))} strong last />
      </Card>

      {booking.status === 'confirmed' || booking.status === 'inHouse' ? (
        <Pressable
          onPress={() => router.push({ pathname: '/booking/cancel', params: { id: booking.id } })}
          accessibilityRole="button"
          style={({ pressed }) => [styles.cancel, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Icon name="trash" size={14} color={c.error} strokeWidth={2} />
          <Text variant="link" style={{ color: c.error }}>
            Cancel booking
          </Text>
        </Pressable>
      ) : null}
    </Screen>
  );
}

/**
 * The design draws only the "not yet" case. What this button offers depends on
 * where the stay actually is: waiting, ready to check in, or under way.
 */
function PrimaryAction({ booking }: { booking: Booking }) {
  const router = useRouter();
  const now = new Date();

  // A finished or called-off stay has nothing left to do. Falling through to
  // "Check-in available Jul 20" would offer an action against the past.
  if (booking.status === 'completed' || booking.status === 'cancelled') return null;

  if (booking.status === 'inHouse') {
    return (
      <Button
        label="View active stay"
        onPress={() => router.push({ pathname: '/booking/active', params: { id: booking.id } })}
      />
    );
  }

  const arrivesToday = isSameDay(booking.checkIn, now);
  const arrived = arrivesToday || booking.checkIn < now;

  if (arrived && booking.status === 'confirmed') {
    return (
      <Button
        label="Start check-in"
        onPress={() => router.push({ pathname: '/booking/checkin', params: { id: booking.id } })}
      />
    );
  }

  return (
    <Button
      label={`Check-in available ${MONTHS[booking.checkIn.getMonth()]} ${booking.checkIn.getDate()}`}
      disabled
    />
  );
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
  backRow: { height: 44, justifyContent: 'center', marginLeft: -10, marginBottom: -6 },
  guestRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 20 },
  guestBody: { flex: 1 },
  guestName: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 22 },
  bookingId: { fontSize: 12, marginTop: 1 },
  badges: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: -4, marginBottom: 2 },
  cancel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
  },
});
