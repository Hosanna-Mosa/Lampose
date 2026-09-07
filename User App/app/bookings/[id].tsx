import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Text } from '@/components/ui';
import { StandardHeader, StateTemplate } from '@/components/shell';
import { BookingTimeline, VerificationCodeDisplay } from '@/components/booking';
import { DirectionsButton } from '@/components/discovery';
import { ActionBar, StatusBlock } from '@/components/lifecycle';
import { errorStates } from '@/constants/copy';
import { useTheme } from '@/context/ThemeContext';
import {
  addressVisible, findBooking, fromRealBooking, longDateLabel, timelineSteps, type BookingSummary,
} from '@/data/bookings';
import { confirmMovedIn, useBooking, useStayRequest } from '@/services';
import { formatRupees } from '@/utils/money';
import type { BookingStatus } from '@/constants/tokens';
import { useDepositMark } from '@/components/ui/DepositMark';
import { usePreviewControls } from '@/hooks/useAppEnv';

/**
 * One template, thirteen statuses.
 *
 * CONSTANT — never re-arranges, never disappears:
 *   · the header: name, booking id, sharing type
 *   · the timeline, always present and always in the same place
 *   · the terms: sharing, rent, deposit, move-in date, notice period
 *
 * A student in a dispute must find those in the SAME spot regardless of what
 * state the booking is in. Thirteen bespoke screens would drift, and the drift
 * lands on exactly the states people reach when something has gone wrong.
 *
 * SWAPS — exactly two slots: the status block, and the action bar.
 */
export default function BookingDetail() {
  const previewControls = usePreviewControls();
  const { colors, space, layout, mode, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  /*
   * Two id shapes reach this screen, and REAL is the primary one now.
   *
   *   a real booking id     the Mongo `_id` `GET /customers/bookings` hands
   *                         back — what `home.tsx`'s Bookings tab and a
   *                         push notification both link with. Fetched
   *                         directly, no detour through a stay request.
   *
   *   `bkg-<listingId>`     the legacy shape `booked/[id].tsx` still mints
   *                         at the moment of confirmation, kept working here
   *                         as a fallback by resolving the stay request
   *                         behind it — `stay.request.bookingId` is the real
   *                         id, stamped server-side the moment the owner
   *                         accepts (`acceptAndBook`).
   *
   * Either way, once a real booking resolves, `fromRealBooking` is what this
   * whole template actually renders — the fixture lookup (`findBooking`)
   * only fires as a fallback for ids that resolve to neither.
   */
  const isLegacyId = id?.startsWith('bkg-') ?? false;
  const listingId = isLegacyId ? (id as string).slice(4) : null;
  const stay = useStayRequest(listingId);

  const realBookingId = isLegacyId ? (stay.request?.bookingId ?? null) : (id ?? null);
  const real = useBooking(realBookingId);

  const fixture = useMemo(() => (id ? findBooking(id) : undefined), [id]);
  const stored = real.booking ? fromRealBooking(real.booking) : fixture;

  /* Still trying — a real fetch in flight, or (on the legacy path) the stay
     request it depends on not yet hydrated. Neither is "not found" yet. */
  const resolving = real.loading || (isLegacyId && (stay.isHydrating || (!stay.request && !fixture)));

  const entryPin = real.booking?.entryPin ?? stay.request?.entryPin ?? null;
  const canReview = real.booking?.status === 'completed' && real.booking?.reviewed === false;

  /*
   * Moving in, which takes both of them.
   *
   * The owner marks it first — they check the PIN and open the door — and this
   * button unlocks only once they have. Before that it says what to do instead
   * of being greyed out for no stated reason: a disabled control with no
   * explanation is one people tap repeatedly.
   *
   * `stay.request.moveIn` only exists on the legacy path (it needs the stay
   * request, which the real-id path never fetches) — a real booking carries
   * the same two facts directly (`movedInByOwnerAt`/`movedInByStudentAt`),
   * so this is built from whichever of the two actually resolved.
   */
  const moveIn = real.booking
    ? {
      ownerConfirmedAt: real.booking.movedInByOwnerAt,
      studentConfirmedAt: real.booking.movedInByStudentAt,
      awaitingStudent: Boolean(real.booking.movedInByOwnerAt) && !real.booking.movedInByStudentAt,
      complete: Boolean(real.booking.movedInByOwnerAt && real.booking.movedInByStudentAt),
    }
    : stay.request?.moveIn;
  const [confirming, setConfirming] = useState(false);
  const [moveInError, setMoveInError] = useState<string | null>(null);

  /* `POST /customers/stay-requests/:id/moved-in` is keyed by the REQUEST id,
     never the booking id — `CustomerBooking.requestId` is what carries it on
     the real path; the legacy path already has the request itself. */
  const confirmMoveInId = real.booking?.requestId ?? stay.request?.id ?? null;

  const onConfirmMovedIn = async () => {
    if (!confirmMoveInId) return;
    setConfirming(true);
    setMoveInError(null);
    try {
      await confirmMovedIn(confirmMoveInId);
      /* Refetched rather than assumed — the booking is the server's, and this
         screen has just changed it. */
      if (real.booking) await real.refetch();
      else await stay.refresh();
    } catch (error) {
      setMoveInError((error as { displayMessage?: string }).displayMessage
        ?? 'We could not confirm that. Try again in a moment.');
    } finally {
      setConfirming(false);
    }
  };
  /** Dev-only status override, so all thirteen are reachable without a server. */
  const [override, setOverride] = useState<BookingStatus | null>(null);
  const [codeOpen, setCodeOpen] = useState(false);

  if (!stored && resolving) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingBottom: insets.bottom }}>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        <StandardHeader title="Booking" onBack={() => router.back()} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text variant="body" color="tertiary">Loading…</Text>
        </View>
      </View>
    );
  }

  if (!stored) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingBottom: insets.bottom }}>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        <StateTemplate copy={errorStates.notFound()} onPrimary={() => router.replace('/home')} />
      </View>
    );
  }

  const booking: BookingSummary = override ? { ...stored, status: override } : stored;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <StandardHeader
        title={booking.propertyName}
        subtitle={`${booking.reference} · ${booking.sharingLabel.toLowerCase()}`}
        onBack={() => router.back()}
      />

      <ScrollView contentContainerStyle={{ padding: layout.gutter, gap: space[5], paddingBottom: space[8] }}>
        {/* SLOT 1 — swaps by status. */}
        <StatusBlock booking={booking} />

        {/* Shown only when the SERVER has issued one — see the note above.
            A locally minted code here is a number a student reads out to an
            owner holding a different one, and both believe it. */}
        {codeOpen && entryPin ? (
          <View
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderWidth: StyleSheet.hairlineWidth,
              borderRadius: radius.card,
              padding: space[4],
            }}
          >
            {/* Six digit tiles with the full `LV-` form beneath — the same
                two things, in the same order, as both owner screens. */}
            <VerificationCodeDisplay
              code={entryPin.replace(/\D/g, '')}
              bookingReference={entryPin}
              ownerName={booking.ownerName}
              validLabel={booking.codeValidLabel ?? 'Valid on your move-in day'}
            />
          </View>
        ) : null}

        {/* CONSTANT — always present, always here. */}
        <View style={{ gap: space[3] }}>
          <Text variant="title3">Where this booking is</Text>
          <BookingTimeline status={booking.status} steps={timelineSteps} />
        </View>

        {/* The address, revealed by payment.
            The public listing shows the locality only; the exact address, the
            landmark and the pin arrive with a paid booking and live on the
            booking itself rather than the listing. `addressVisible()` is the
            one place that decides which states may see it — a privacy rule
            written at three call sites is a privacy rule that will disagree
            with itself. */}
        {addressVisible(booking.status) && booking.address ? (
          <View style={{ gap: space[3] }}>
            <Text variant="title3">Where to go</Text>
            <DirectionsButton
              place={{
                coords: booking.coords,
                address: booking.address,
                label: booking.propertyName,
              }}
              address={booking.address}
              landmark={booking.landmark}
              variant="secondary"
            />
          </View>
        ) : null}

        {/* CONSTANT — a student in a dispute finds these in the same place
            whatever state the booking is in. */}
        <View
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderWidth: StyleSheet.hairlineWidth,
            borderRadius: radius.card,
            padding: space[4],
            gap: space[3],
          }}
        >
          <Text variant="title3">Your terms</Text>
          <Term label="Sharing" value={booking.sharingLabel} />
          {/*
            Two money shapes, never both — see the note in `BookingList.tsx`.
            A real booking (`booking.rent` unset) has no rent, deposit or
            notice period to show: Lampose was never told one, because the
            money moves between the student and the owner directly.
          */}
          {booking.rent != null ? (
            <>
              <Term label="Rent" value={`${formatRupees(booking.rent)} /mo`} />
              <Term label="Deposit" value={formatRupees(booking.deposit ?? 0)} refundable />
            </>
          ) : booking.totalAmount != null ? (
            <>
              <Term label="Total amount" value={formatRupees(booking.totalAmount)} />
              <Term label="Paid so far" value={formatRupees(booking.paidAmount ?? 0)} />
            </>
          ) : null}
          <Term label="Move-in date" value={booking.moveInLabel} />
          {booking.checkOutDate ? (
            <Term label="Move-out date" value={longDateLabel(booking.checkOutDate)} />
          ) : null}
          {booking.noticePeriodDays != null ? (
            <Term label="Notice period" value={`${booking.noticePeriodDays} days`} />
          ) : null}
          {booking.lockInEndsLabel ? (
            <Term label="Lock-in ends" value={booking.lockInEndsLabel} />
          ) : null}
        </View>

        {/*
          Moving in — the second half of it.

          Shown once there is a booking and until both sides have confirmed.
          Before the owner marks it, this is a SENTENCE rather than a greyed
          button: "waiting for the owner" tells somebody standing in a room
          what to do next, and a disabled control with no explanation is one
          people tap over and over.
        */}
        {moveIn && !moveIn.complete ? (
          <View
            style={{
              backgroundColor: colors.surface,
              borderColor: moveIn.awaitingStudent ? colors.success.border : colors.border,
              borderWidth: StyleSheet.hairlineWidth,
              borderRadius: radius.card,
              padding: space[4],
              gap: space[3],
            }}
          >
            <View style={{ gap: space[1] }}>
              <Text variant="bodyStrong">
                {moveIn.awaitingStudent ? 'Confirm you have moved in' : 'Moving in'}
              </Text>
              <Text variant="caption" color="secondary">
                {moveIn.awaitingStudent
                  ? `${booking.ownerName ?? 'The owner'} has marked you in. Confirm from your side and the stay begins.`
                  : `Show your entry PIN to ${booking.ownerName ?? 'the owner'} when you arrive. Once they mark you in, you confirm here.`}
              </Text>
            </View>

            {moveInError ? (
              <Text variant="caption" style={{ color: colors.danger.ink }}>
                {moveInError}
              </Text>
            ) : null}

            <Button
              label={confirming ? 'Confirming…' : 'I have moved in'}
              onPress={onConfirmMovedIn}
              /* Locked until the owner goes first — the server refuses it
                 anyway, and a button that can only fail is worse than one
                 that plainly waits. */
              disabled={!moveIn.awaitingStudent || confirming}
              fullWidth
            />
          </View>
        ) : moveIn?.complete ? (
          <View
            style={{
              backgroundColor: colors.success.tint,
              borderRadius: radius.card,
              padding: space[4],
              gap: space[1],
            }}
          >
            <Text variant="bodyStrong" style={{ color: colors.success.ink }}>
              You have moved in
            </Text>
            <Text variant="caption" style={{ color: colors.success.ink }}>
              Both you and {booking.ownerName ?? 'the owner'} confirmed it. Enjoy the room.
            </Text>
          </View>
        ) : null}

        {/* SLOT 2 — swaps by status. */}
        <ActionBar
          booking={booking}
          onPrimary={() => {
            if (booking.status === 'CONFIRMED') setCodeOpen((open) => !open);
            else if (booking.status === 'ACCEPTED' || booking.status === 'PAYMENT_PENDING') {
              router.push(`/pay/lst-pg-0143` as never);
            } else if (booking.status === 'CHECKED_OUT') router.push('/bookings/refund');
            else router.push('/home');
          }}
          onSecondary={() => {
            // "Track my refund", on both cancelled states.
            if (booking.status.startsWith('CANCELLED')) router.push('/bookings/refund');
            else router.push('/home');
          }}
          onDestructive={() => {
            // Leaving a stay is notice; leaving a booking is cancellation.
            // They are different screens because they are different amounts of
            // someone's money.
            if (booking.status === 'CHECKED_IN') {
              router.push('/bookings/notice');
              return;
            }
            router.push(
              (realBookingId ? `/bookings/cancel?id=${realBookingId}` : '/bookings/cancel') as never,
            );
          }}
          onSupport={() => router.push('/support/new')}
        />

        {/* "Rate your stay" — additive, and independent of the fixture status
            above. Shown only once the REAL booking behind this one says the
            stay is complete and unreviewed; see `real` above. */}
        {canReview ? (
          <View
            style={{
              backgroundColor: colors.surfaceSunken,
              borderRadius: radius.card,
              padding: space[4],
              gap: space[3],
            }}
          >
            <Text variant="title3">How was your stay?</Text>
            <Text variant="body" color="secondary">
              A quick review helps other students, and it reaches {booking.propertyName} directly.
            </Text>
            <Button
              label="Rate your stay"
              variant="secondary"
              onPress={() => router.push(`/bookings/review?id=${realBookingId}` as never)}
            />
          </View>
        ) : null}

        {previewControls ? (
          <View style={{ gap: space[2], paddingTop: space[4] }}>
            <Text variant="numMeta" color="tertiary">
              status — preview only · the template is the same for all thirteen
            </Text>
            <View style={[styles.wrap, { gap: space[2] }]}>
              {(
                [
                  'REQUESTED',
                  'ACCEPTED',
                  'PAYMENT_PENDING',
                  'PAYMENT_FAILED',
                  'CONFIRMED',
                  'CHECKED_IN',
                  'CHECKED_OUT',
                  'COMPLETED',
                  'REJECTED',
                  'EXPIRED',
                  'CANCELLED_BY_CUSTOMER',
                  'CANCELLED_BY_OWNER',
                  'DISPUTED',
                ] as const
              ).map((status) => (
                <Button
                  key={status}
                  label={status.toLowerCase().replace(/_/g, ' ')}
                  size="sm"
                  variant={booking.status === status ? 'primary' : 'secondary'}
                  onPress={() => setOverride(status)}
                />
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Term({
  label,
  value,
  refundable = false,
}: {
  label: string;
  value: string;
  refundable?: boolean;
}) {
  const { colors } = useTheme();
  const depositMark = useDepositMark();
  return (
    <View style={styles.termRow}>
      {/* The label flexes, the value does not. "Lock-in ends" beside
          "5 December 2026" had no give at all — and a truncated date in the
          terms block is exactly the thing a student would be arguing about. */}
      <Text variant="caption" color="secondary" style={styles.flex}>
        {label}
      </Text>
      <Text
        variant="priceSm"
        style={
          refundable
            ? depositMark
            : undefined
        }
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  termRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  flex: { flex: 1 },
  wrap: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
});
