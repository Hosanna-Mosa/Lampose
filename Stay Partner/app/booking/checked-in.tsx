import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Screen,
  Text,
  Button,
  Card,
  DetailRow,
  Icon,
  IconButton,
  EmptyState,
} from '@/components/ui';
import { useBooking } from '@/services/hooks/useBookings';
import { formatDayDate } from '@/lib/format';
import { radius } from '@/constants/layout';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';

/**
 * The step between "the owner let them in" and "the stay is under way".
 *
 * ## Why this screen had to exist
 *
 * Moving in takes TWO confirmations and the backend has always modelled it
 * that way: `movedInByOwnerAt` then `movedInByStudentAt`, and only both
 * together flip `status` to `in_house` (`partnerDomains.model.js`). The app
 * had no screen for the gap between them. Check-in went straight to
 * `booking/active`, which draws "Day 1 of 3" and an in-house badge for a stay
 * the server still calls `upcoming` — so the owner was shown a stay in
 * progress that, as far as every other screen was concerned, had not started.
 *
 * This is that gap, said plainly: you have marked them in, the student has not
 * confirmed yet, and here is what to ask them to do.
 *
 * ## It waits rather than asserting
 *
 * `useBooking` refetches on focus, so coming back to this screen is what
 * catches the student's confirmation. Nothing here writes: the owner's half is
 * already recorded, and the other half is not this app's to claim.
 */
export default function CheckedInScreen() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { booking, notFound, isPending, refetch, isRefetching } = useBooking(id);

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
          onAction={() => router.replace('/bookings')}
        />
      </Screen>
    );
  }

  const firstName = booking.guest.split(' ')[0];
  /* The server's own answer, not an assumption about what our own write did.
     `status` only reaches `inHouse` when both sides have confirmed. */
  const bothIn = booking.status === 'inHouse' || Boolean(booking.movedInByStudentAt);
  /* Bachelor's checkout date on `booking/active` is fabricated — see the
     note on `PrimaryAction` in `booking/[id].tsx`. Keeps its own flag
     because that reason genuinely does not apply to the Check-out row
     below, which stays shown for PG/Hostel. */
  const bachelor = booking.category === 'BACHELOR';
  /* PG/Hostel and Co-living don't fabricate their checkout date, but the
     destination itself is withheld for them too now — same "direct
     arrangement, nothing on Lampose's side to track" reasoning as the
     payout figure and owner-messaging already withheld elsewhere on this
     booking. None of these three should still reach `booking/active`
     through this button just because it was skipped on the detail
     screen's own. */
  const noActiveStay = bachelor || booking.category === 'PG_HOSTEL' || booking.category === 'COLIVE';

  return (
    <Screen
      padX={22}
      contentStyle={styles.stack}
      refreshing={isRefetching}
      onRefresh={refetch}
      footer={
        bothIn ? (
          <Button
            label={noActiveStay ? 'Go back to home' : 'View active stay'}
            onPress={() => (noActiveStay
              ? router.replace('/')
              : router.replace({ pathname: '/booking/active', params: { id: booking.id } }))}
          />
        ) : (
          <View style={styles.actions}>
            <Button
              label="Back to bookings"
              variant="secondary"
              onPress={() => router.replace('/bookings')}
              style={styles.action}
            />
            <Button
              label={isRefetching ? 'Checking…' : 'Check again'}
              onPress={() => refetch()}
              loading={isRefetching}
              style={styles.action}
            />
          </View>
        )
      }
      stickyHeader={
        <View style={styles.backRow}>
          <IconButton
            name="chevron-left"
            label="Back to bookings"
            /* `replace`, not `back`: the screen behind this one is the code
               entry, and returning to it would ask for a PIN that has already
               been accepted. */
            onPress={() => router.replace({ pathname: '/booking/[id]', params: { id: booking.id } })}
          />
        </View>
      }
    >
      <View style={[styles.hero, { backgroundColor: bothIn ? c.successTint : c.accentTint }]}>
        <View style={[styles.heroIcon, { backgroundColor: bothIn ? c.success : c.accent }]}>
          <Icon name={bothIn ? 'check' : 'clock'} size={22} color="#FFFFFF" strokeWidth={2.4} />
        </View>
        <Text style={[styles.heroTitle, { color: bothIn ? c.successInk : c.accentInk }]}>
          {bothIn ? `${firstName} has moved in` : `${firstName} is marked in`}
        </Text>
        <Text style={[styles.heroBody, { color: bothIn ? c.successInk : c.accentInk }]}>
          {bothIn
            ? 'Both of you have confirmed, so the stay is under way.'
            : `You have confirmed your side. The stay starts once ${firstName} confirms from their own app.`}
        </Text>
      </View>

      {!bothIn ? (
        <Card>
          <Text variant="cardTitle">Ask {firstName} to confirm</Text>
          <View style={styles.steps}>
            <Step n={1} text="Open the Lampose app" />
            <Step n={2} text="Go to Bookings and open this stay" />
            <Step n={3} text='Tap "I have moved in"' />
          </View>
          <Text variant="bodySm" color="textSecondary" style={styles.note}>
            Until they do, this stay stays in Upcoming. Nothing is lost if they confirm later —
            come back here or open the booking again.
          </Text>
        </Card>
      ) : null}

      <Card>
        <DetailRow label="Guest" value={booking.guest} />
        <DetailRow label="Room" value={booking.roomType || 'Not set'} />
        <DetailRow label="Check-in" value={formatDayDate(booking.checkIn)} last={bachelor} />
        {/* A bachelor tenancy has no move-out date to show — the student was
            never asked for one, so `booking.checkOut` here is a fallback
            value (`toBooking()`, "the day after move-in"), never a real
            answer. Showing it would print an invented date as this tenant's
            move-out day. */}
        {!bachelor ? (
          <DetailRow label="Check-out" value={formatDayDate(booking.checkOut)} last />
        ) : null}
      </Card>
    </Screen>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  const c = useColors();
  return (
    <View style={styles.step}>
      <View style={[styles.stepNum, { backgroundColor: c.surfaceSunken }]}>
        <Text style={[styles.stepNumText, { color: c.textSecondary }]}>{n}</Text>
      </View>
      <Text variant="bodySm" style={[styles.stepText, { color: c.textPrimary }]}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  backRow: { height: 44, justifyContent: 'center', marginLeft: -10, marginBottom: -6 },
  hero: { borderRadius: radius.card, padding: 18, alignItems: 'center', gap: 8 },
  heroIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  heroTitle: { fontFamily: fonts.extrabold, fontSize: 18, lineHeight: 24, textAlign: 'center' },
  heroBody: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18.5, textAlign: 'center' },
  steps: { gap: 10, marginTop: 12 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepNum: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { fontFamily: fonts.bold, fontSize: 11 },
  stepText: { flex: 1, lineHeight: 19 },
  note: { lineHeight: 18, marginTop: 12 },
  actions: { flexDirection: 'row', gap: 10 },
  action: { flex: 1 },
});
