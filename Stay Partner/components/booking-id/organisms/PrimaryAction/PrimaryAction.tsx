import { Box } from '@/components/common';
import { useRouter } from 'expo-router';
import { Text, Button } from '@/components/common';
import { isSameDay } from '@/lib/format';
import { type Booking } from '@/lib/bookings';
import { PREVIEW_CONTROLS } from '@/constants/env';
import { MONTHS } from '@/components/booking-id/utils';

export function PrimaryAction({ booking }: { booking: Booking }) {
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
    <Box style={{ gap: 8 }}>
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
    </Box>
  );
}
