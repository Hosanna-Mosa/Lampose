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
     * But the owner DOES need one thing here: to say the tenant has left.
     * Check-out is what gives the bed back (`freeBookingBed`), and these
     * three used to have no way to reach it — so their free-bed count only
     * ever went down, and a property ended up shown as full to students
     * while rooms stood empty. "Mark moved out" goes straight to the
     * check-out sheet, skipping the progress screen and its invented date.
     */
    if (booking.category === 'BACHELOR' || booking.category === 'PG_HOSTEL' || booking.category === 'COLIVE') {
      return (
        <Button
          label="Mark moved out"
          onPress={() => router.push({ pathname: '/booking/checkout', params: { id: booking.id } })}
        />
      );
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

  if (arrived && (booking.status === 'confirmed' || booking.status === 'arriving' || booking.status === 'overdueArrival')) {
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
