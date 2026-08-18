import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button, Text } from '@/components/ui';
import { StandardHeader, StateTemplate } from '@/components/shell';
import { BookingTimeline, VerificationCodeDisplay } from '@/components/booking';
import { DirectionsButton } from '@/components/discovery';
import { ActionBar, StatusBlock } from '@/components/lifecycle';
import { errorStates } from '@/constants/copy';
import { useTheme } from '@/context/ThemeContext';
import { addressVisible, findBooking, timelineSteps, type BookingSummary } from '@/data/bookings';
import { confirmMovedIn, useStayRequest } from '@/services';
import { formatRupees } from '@/utils/money';
import type { BookingStatus } from '@/constants/tokens';
import { useDepositMark } from '@/components/ui/DepositMark';

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
  const { colors, space, layout, mode, radius } = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const stored = useMemo(() => (id ? findBooking(id) : undefined), [id]);

  /*
   * The real entry PIN, for a booking that came from an accepted request.
   *
   * Everything else on this screen is still local — the terms, the address,
   * the timeline labels — because none of it has a server equivalent yet. The
   * CODE does, and it is the one thing here that must not be invented: a
   * student reads it out at a door to an owner holding the server's value.
   *
   * The local booking id encodes the listing (`bkg-<listingId>`), which is
   * what lets this screen find the request behind it without a lookup
   * endpoint that does not exist yet.
   */
  const listingId = id?.startsWith('bkg-') ? id.slice(4) : null;
  const stay = useStayRequest(listingId);
  const entryPin = stay.request?.entryPin ?? null;

  /*
   * Moving in, which takes both of them.
   *
   * The owner marks it first — they check the PIN and open the door — and this
   * button unlocks only once they have. Before that it says what to do instead
   * of being greyed out for no stated reason: a disabled control with no
   * explanation is one people tap repeatedly.
   */
  const moveIn = stay.request?.moveIn;
  const [confirming, setConfirming] = useState(false);
  const [moveInError, setMoveInError] = useState<string | null>(null);

  const onConfirmMovedIn = async () => {
    if (!stay.request) return;
    setConfirming(true);
    setMoveInError(null);
    try {
      await confirmMovedIn(stay.request.id);
      /* Refetched rather than assumed — the booking is the server's, and this
         screen has just changed it. */
      await stay.refresh();
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

  if (!stored) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
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
          <Term label="Rent" value={`${formatRupees(booking.rent)} /mo`} />
          <Term label="Deposit" value={formatRupees(booking.deposit)} refundable />
          <Term label="Move-in date" value={booking.moveInLabel} />
          <Term label="Notice period" value={`${booking.noticePeriodDays} days`} />
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
                  ? `${booking.ownerName} has marked you in. Confirm from your side and the stay begins.`
                  : `Show your entry PIN to ${booking.ownerName} when you arrive. Once they mark you in, you confirm here.`}
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
              Both you and {booking.ownerName} confirmed it. Enjoy the room.
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
            router.push(booking.status === 'CHECKED_IN' ? '/bookings/notice' : '/bookings/cancel');
          }}
          onSupport={() => {}}
        />

        {__DEV__ ? (
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
