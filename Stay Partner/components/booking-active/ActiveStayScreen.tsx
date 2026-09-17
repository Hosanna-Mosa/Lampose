import { Box, Spinner, Tappable } from '@/components/common';
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
} from '@/components/common';
import { formatDayDate, initials, isSameDay } from '@/lib/format';
import { type Booking } from '@/lib/bookings';
import { useBooking } from '@/services/hooks/useBookings';
import { radius } from '@/constants/layout';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';
import { Shortcut } from '@/components/booking-active/molecules/Shortcut/Shortcut';
import { styles } from '@/components/booking-active/styles';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 86_400_000;

/**
 * Which day of the stay today is, and how far through it that puts them.
 *
 * Takes the two ends rather than the booking, because an open-ended stay has
 * no second one and this cannot be computed for it — the caller has to have
 * established that before it gets here.
 */
function stayProgress(checkIn: Date, checkOut: Date, now = new Date()) {
  const midnight = (d: Date) => new Date(d).setHours(0, 0, 0, 0);
  const start = midnight(checkIn);
  const end = midnight(checkOut);
  const today = midnight(now);

  const totalDays = Math.max(1, Math.round((end - start) / DAY_MS) + 1);
  const currentDay = Math.min(Math.max(Math.round((today - start) / DAY_MS) + 1, 1), totalDays);
  return { currentDay, totalDays, ratio: currentDay / totalDays };
}

export function ActiveStayScreen() {
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
        <Box style={styles.loading}>
          <Spinner color={c.accent} />
        </Box>
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
  /* Destructured so the check below narrows it: past this guard there are
     two ends, and everything here counts between them. */
  const { checkOut } = booking;

  if (!checkOut
    || booking.category === 'BACHELOR' || booking.category === 'PG_HOSTEL' || booking.category === 'COLIVE') {
    return (
      <Screen scroll={false} padX={22} background="bg">
        <EmptyState
          icon="search"
          title="Not available for this room"
          body={!checkOut
            ? 'This stay has no agreed end date, so there is no checkout to track here.'
            : 'This stay is a direct arrangement with the guest, so there is nothing to track here.'}
          actionLabel="Go back to home"
          onAction={() => router.replace('/')}
        />
      </Screen>
    );
  }

  const { currentDay, totalDays, ratio } = stayProgress(booking.checkIn, checkOut);
  const departsToday = isSameDay(checkOut, new Date());

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
                  label={`Checkout available ${MONTHS[checkOut.getMonth()]} ${checkOut.getDate()}`}
                  disabled
                />
              )
            }
      stickyHeader={
        <>
          <Box style={styles.backRow}>
            <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
          </Box>
        </>
      }
    >

      <Box style={styles.guestRow}>
        <Box style={[styles.avatar, { backgroundColor: c.accentTint }]}>
          <Text style={[styles.avatarText, { color: c.accentInk }]}>{initials(booking.guest)}</Text>
        </Box>
        <Box>
          <Text style={styles.guestName}>{booking.guest}</Text>
          <Text variant="badge" color="textSecondary" style={styles.roomType}>
            {booking.roomType}
          </Text>
        </Box>
      </Box>

      <BookingStatusBadge status="inHouse" style={styles.badge} />

      <Box style={[styles.progressCard, { backgroundColor: c.accentTint }]}>
        <Text variant="label" style={{ color: c.accentInk }}>
          Day {currentDay} of {totalDays}
        </Text>
        <Box
          style={[styles.track, { backgroundColor: c.surface }]}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: totalDays, now: currentDay }}
        >
          <Box style={[styles.trackFill, { width: `${ratio * 100}%`, backgroundColor: c.accent }]} />
        </Box>
        <Text style={[styles.checkoutLine, { color: c.accentInk }]}>
          Checkout {formatDayDate(checkOut)}{booking.checkOutBy ? ` · ${booking.checkOutBy}` : ''}
        </Text>
      </Box>

      <Box style={styles.shortcuts}>
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
      </Box>
    </Screen>
  );
}

