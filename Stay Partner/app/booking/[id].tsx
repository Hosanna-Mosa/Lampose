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
import { logWarn } from '@/lib/log';

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
            /*
             * Derived, not asserted.
             *
             * This said `payment: 'paid'` and `gross: b.totalAmount || 8000`,
             * so a booking with no money against it rendered as "Paid" with a
             * ₹7,520 payout — an invented ₹8,000 minus the platform fee. On a
             * payout screen that is the worst possible default: an owner
             * reading a figure they are owed that nobody agreed to.
             *
             * Nothing is charged anywhere in this flow yet, so a
             * request-sourced booking is honestly ₹0 and unpaid.
             */
            payment: (b.totalAmount || 0) > 0 && (b.paidAmount || 0) >= (b.totalAmount || 0)
              ? 'paid'
              : 'pending',
            gross: b.totalAmount || 0,
            /* The server's PIN. This was hardcoded `'1234'` — every booking
               showed the same code, and none of them matched what the student
               was holding. */
            checkInCode: b.entryPin || undefined,
            movedInByOwnerAt: b.movedInByOwnerAt ? new Date(b.movedInByOwnerAt) : undefined,
            movedInByStudentAt: b.movedInByStudentAt ? new Date(b.movedInByStudentAt) : undefined,
            checkOutBy: '11:00 AM',
          });
        }
      })
      .catch((err) => logWarn('Error fetching booking detail:', err))
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

      {/*
        The entry PIN, above the money.

        This is the screen an owner opens standing in a doorway, so the one
        thing they need to READ ALOUD comes before the one thing they need to
        know later. Same rendering as the request screen and the student's:
        the digits large, the full `LV-` form beneath, so three screens across
        two apps show one code the same way.
      */}
      {booking.checkInCode ? (
        <Card>
          <Text variant="label" style={{ color: c.textCaption }}>ENTRY PIN</Text>
          <Text tabular style={[styles.pin, { color: c.textPrimary }]}>
            {booking.checkInCode.replace(/\D/g, '')}
          </Text>
          <Text tabular variant="label" style={{ color: c.textCaption }}>
            {booking.checkInCode}
          </Text>
          <Text variant="body" style={{ color: c.textSecondary, marginTop: 6 }}>
            {booking.guest} shows the same digits. Check they match before you mark them in.
          </Text>
        </Card>
      ) : null}

      {/*
        Where moving in has got to.

        Shown only between the owner's confirmation and the student's, which is
        the one state that would otherwise look like nothing happened: the
        owner taps "mark as moved in", the status stays `upcoming`, and without
        this they would reasonably think it failed.
      */}
      {booking.movedInByOwnerAt && !booking.movedInByStudentAt ? (
        <Card>
          <Text variant="cardTitle">Waiting for {booking.guest} to confirm</Text>
          <Text variant="body" style={{ color: c.textSecondary, marginTop: 4 }}>
            You marked them in. The stay starts once they confirm from their own app — ask them to
            open Bookings and tap "I have moved in".
          </Text>
        </Card>
      ) : null}

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
  /* Large and tabular: read out loud, at a door, from arm's length. */
  pin: { fontFamily: fonts.bold, fontSize: 30, lineHeight: 38, letterSpacing: 1.5, marginVertical: 4 },
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
