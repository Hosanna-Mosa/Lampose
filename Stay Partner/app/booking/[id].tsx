import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
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
import { type Booking, hasPlatformMoney, payoutOf } from '@/lib/bookings';
import { useBooking } from '@/services/hooks/useBookings';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';
/* DEVELOPMENT ONLY — gates the check-in bypass below. False in any production
   build, so the block it guards is dead code there. */
import { PREVIEW_CONTROLS } from '@/constants/env';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function BookingDetailScreen() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  /*
   * One hook, one mapping.
   *
   * This screen used to fetch and map inline while the four screens BEHIND it
   * (check-in, active stay, checkout, cancel) read the fixture array in
   * `lib/bookings.ts` instead — which is why every one of them said "Booking
   * not found" and the Cancel button appeared to do nothing. They all share
   * `useBooking` now, and the mapping lives once in `toBooking`.
   */
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
          title="Booking not found"
          body={notFound ? 'It may have been cancelled.' : 'We could not load this booking.'}
          actionLabel="Back to bookings"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  // A finished stay offers no action, so it gets no footer bar at all.
  const hasAction = booking.status !== 'completed' && booking.status !== 'cancelled';

  /* The avatar tint follows booking state, matching the badge beside it.
     Falls back rather than indexing to undefined — this map is a second copy
     of the badge's and a new state reaching it first is exactly how a screen
     ends up rendering a blank circle. */
  const AVATAR_TINT: Record<string, { bg: string; fg: string }> = {
    arriving: { bg: c.warningTint, fg: c.warningInk },
    /* Red, matching `BookingStatusBadge` — an overdue arrival/checkout is
       not the same amber-and-fine "arriving today"/"in-house" this used to
       silently fall back to before these two stages existed. */
    overdueArrival: { bg: c.errorTint, fg: c.errorInk },
    overdueDeparture: { bg: c.errorTint, fg: c.errorInk },
    confirmed: { bg: c.successTint, fg: c.successInk },
    inHouse: { bg: c.accentTint, fg: c.accentInk },
    departing: { bg: c.accentTint, fg: c.accentInk },
    completed: { bg: c.infoTint, fg: c.info },
    cancelled: { bg: c.errorTint, fg: c.errorInk },
    pending: { bg: c.warningTint, fg: c.warningInk },
    declined: { bg: c.borderSubtle, fg: c.textTertiary },
    expired: { bg: c.borderSubtle, fg: c.textTertiary },
    draft: { bg: c.borderSubtle, fg: c.textTertiary },
  };
  const avatar = AVATAR_TINT[booking.status] ?? AVATAR_TINT.confirmed;

  /* Built rather than written inline so the LAST row present carries the
     divider, whichever of the four that turns out to be. */
  const guestRows = [
    { label: 'Name', value: booking.guest },
    { label: 'Phone', value: booking.guestPhone },
    { label: 'Email', value: booking.guestEmail },
    { label: 'Address', value: booking.guestAddress },
  ].filter((row): row is { label: string; value: string } => Boolean(row.value));

  return (
    <Screen
      padX={22}
      contentStyle={styles.stack}
      footer={hasAction ? <PrimaryAction booking={booking} /> : undefined}
      refreshing={isRefetching}
      onRefresh={refetch}
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

      {/* Two badges where there are two facts, one where there is one.
          `booking.payment` is derived from `totalAmount`/`paidAmount`, which
          only a hotel booking actually carries — see `hasPlatformMoney`. On
          the rest they are 0/0, so the badge read "Pending" forever: a
          bachelor tenant who has moved in and is living there, permanently
          flagged as though money were owed. Nothing is pending; the figure
          never applied. */}
      <View style={styles.badges}>
        <BookingStatusBadge status={booking.status} />
        {hasPlatformMoney(booking) ? <PaymentStatusBadge status={booking.payment} /> : null}
      </View>

      <Card>
        <DetailRow label="Check-in" value={formatDayDate(booking.checkIn)} />
        {/* Only where the stay has an agreed end. A bachelor tenancy has
            none — the request has no move-out field — and this row was
            printing the mapper's old "day after move-in" fallback as though
            the tenant were leaving tomorrow. */}
        {booking.checkOut ? (
          <DetailRow label="Check-out" value={formatDayDate(booking.checkOut)} />
        ) : null}
        <DetailRow label="Room" value={booking.roomType} last={!booking.guests} />
        {/* Only where somebody actually recorded one — which is the walk-in
            form alone. See `guests` in `lib/bookings.ts`. */}
        {booking.guests ? <DetailRow label="Guests" value={booking.guests} last /> : null}
      </Card>

      {/*
        Who the room was let to.

        Everything a landlord holds about a tenant, on the screen they open to
        check it: the full name as the student gave it, their number, their
        email, and where they live. The Add Customer form makes an owner type
        all four for a walk-in, so the app has always treated them as theirs
        to see — a booking made through the app just never showed them.

        Each row appears only where there is something to show. A detail
        nobody recorded gets no row rather than a row reading "not set", and
        the last one present carries the divider.
      */}
      {guestRows.length ? (
        <Card>
          {guestRows.map((row, i) => (
            <DetailRow
              key={row.label}
              label={row.label}
              value={row.value}
              last={i === guestRows.length - 1}
            />
          ))}
        </Card>
      ) : null}

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

      {/* Only where money actually moved through Lampose — see
          `hasPlatformMoney`. `payoutOf` reads `booking.gross`, and everywhere
          else that figure is structurally zero: "Total payout ₹0" was not a
          placeholder waiting to be filled in, it was the honest answer to a
          question these categories never have one for, and it reads as the
          app being broken rather than the figure being inapplicable. */}
      {hasPlatformMoney(booking) ? (
        <Card>
          <DetailRow label="Total payout" value={formatINR(payoutOf(booking))} strong last />
        </Card>
      ) : null}

      {/* Not for a bachelor room, PG/Hostel or Co-living. From confirmation
          on, all three are a direct arrangement with the guest — the same
          reason the User App's booking screen stopped offering Cancel,
          Message the owner and the rest for these categories
          (`components/lifecycle/ActionBar.tsx`), and the same reason none
          of them has a payout above. Cancelling it here is not a button
          Lampose can offer either: there is nothing on this side for it to
          undo that the two of them have not already arranged between
          themselves. */}
      {booking.category !== 'BACHELOR' && booking.category !== 'PG_HOSTEL' && booking.category !== 'COLIVE'
        && (booking.status === 'confirmed' || booking.status === 'inHouse'
        || booking.status === 'arriving' || booking.status === 'departing'
        || booking.status === 'overdueArrival' || booking.status === 'overdueDeparture') ? (
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

  if (booking.status === 'inHouse' || booking.status === 'departing' || booking.status === 'overdueDeparture') {
    /*
     * Not for a bachelor room, PG/Hostel or Co-living.
     *
     * "View active stay" opens `booking/active`, which draws a "Day 1 of 2"
     * progress bar and a fixed checkout date. For a bachelor room that date
     * is never real to begin with — the student never names a length or a
     * move-out date (there is no field for one on that request), so
     * `toBooking()` fills `checkOutDate` in with a fallback of "the day
     * after move-in" to keep the type non-null, which put an invented date
     * on screen for a tenancy that is actually open-ended.
     *
     * PG/Hostel and Co-living usually DO carry a real checkout date, so that
     * particular problem does not apply here — this is withheld for the
     * same reason none of these three has a payout figure, owner-messaging
     * or cancel-via-app on this same screen: once confirmed, it is a direct
     * arrangement between owner and guest, with nothing on Lampose's side
     * for a progress screen to track or a button on it to do.
     *
     * Not left empty, either — a status with nothing offered reads as the
     * screen having broken, on exactly the card an owner opens most often.
     * Home is the honest destination: there is nowhere else on this booking
     * for the tap to go.
     */
    if (booking.category === 'BACHELOR' || booking.category === 'PG_HOSTEL' || booking.category === 'COLIVE') {
      return <Button label="Go back to home" variant="secondary" onPress={() => router.replace('/')} />;
    }

    return (
      <Button
        label="View active stay"
        onPress={() => router.push({ pathname: '/booking/active', params: { id: booking.id } })}
      />
    );
  }

  /*
   * Half-way through moving in.
   *
   * The owner has marked them in and the student has not confirmed yet, so
   * the row is still `upcoming` and "Start check-in" would send them back
   * through a PIN they have already checked. This is the state
   * `booking/checked-in` exists for.
   */
  if (booking.movedInByOwnerAt && !booking.movedInByStudentAt) {
    return (
      <Button
        label="Waiting for guest to confirm"
        variant="secondary"
        onPress={() => router.push({ pathname: '/booking/checked-in', params: { id: booking.id } })}
      />
    );
  }

  const arrivesToday = isSameDay(booking.checkIn, now);
  const arrived = arrivesToday || booking.checkIn < now;

  if (arrived && (booking.status === 'confirmed' || booking.status === 'overdueArrival')) {
    return (
      <Button
        label="Start check-in"
        onPress={() => router.push({ pathname: '/booking/checkin', params: { id: booking.id } })}
      />
    );
  }

  /*
   * Not their arrival day yet.
   *
   * The disabled button is the real answer and stays exactly as it was — an
   * owner must not be able to check somebody in a fortnight early.
   *
   * Underneath it, on a build that allows preview controls, is a link to the
   * real check-in screen, which has its own dev-only bypass now
   * (`devForceIn` in `checkin.tsx`) — this button used to claim the date
   * gate was client-side only and that reaching that screen was the whole
   * bypass, which stopped being true the moment `checkInBooking` grew a real
   * server-side `TOO_EARLY` check: typing even the correct code there still
   * got refused. This just gets a developer to where that bypass lives.
   *
   * It exists because the hotel settlement chain cannot be walked otherwise:
   * a settlement stays `held` until check-in, so Withdraw in the admin
   * Monitor is unreachable until a real arrival date comes round.
   *
   * Delete this block when the flow no longer needs walking through by hand.
   */
  return (
    <View style={{ gap: 8 }}>
      <Button
        label={`Check-in available ${MONTHS[booking.checkIn.getMonth()]} ${booking.checkIn.getDate()}`}
        disabled
      />
      {PREVIEW_CONTROLS ? (
        <>
          <Button
            label="🛠 DEV: open check-in (bypass on the next screen)"
            variant="secondary"
            onPress={() => router.push({ pathname: '/booking/checkin', params: { id: booking.id } })}
          />
          <Text variant="caption" color="textTertiary" center>
            Development only — the real bypass is the button on that screen
          </Text>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
