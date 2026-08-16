import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { BookingStatusChip, CountdownTimer } from '@/components/booking';
import { bookingStatus, type BookingStatus } from '@/constants/tokens';
import { useTheme } from '@/context/ThemeContext';
import type { BookingSummary } from '@/data/bookings';

/**
 * One of exactly two slots that change by status.
 *
 * It holds the chip, the timer if this state runs one, and **one sentence about
 * what is happening now**. Everything else on the booking-detail screen is
 * constant across all thirteen statuses — that is a hard constraint, not a
 * preference: thirteen bespoke screens would drift, and the drift always lands
 * on the states people reach when something has gone wrong, which are the
 * least-tested and most emotionally loaded ones.
 */

export type StatusBlockProps = { booking: BookingSummary };

/** The sentence. One per status, in the second person, saying what is true now. */
function sentenceFor(booking: BookingSummary): string {
  const owner = booking.ownerName ?? 'The owner';
  switch (booking.status) {
    case 'REQUESTED':
      return `${owner} has your request. Nothing has been charged, and nothing will be until she accepts.`;
    case 'ACCEPTED':
      return `${owner} said yes. Pay to confirm the bed — nothing has been charged yet.`;
    case 'PAYMENT_PENDING':
      return 'Your bed is held while you pay. Nobody else can request it until the window closes.';
    case 'PAYMENT_FAILED':
      return 'The payment did not go through, but your bed is still held. You can try again.';
    case 'CONFIRMED':
      return `The bed is yours from ${booking.moveInLabel}. Show your move-in code to ${owner} on the day.`;
    case 'CHECKED_IN':
      return `You have been living here since ${booking.livingSinceLabel ?? booking.moveInLabel}. Rent goes straight to ${owner} now.`;
    case 'CHECKED_OUT':
      return 'You have moved out. Your deposit is being settled.';
    case 'COMPLETED':
      return 'This stay is finished and your deposit has been settled.';
    case 'REJECTED':
      return `${owner} declined the request. Nothing was charged, and it does not affect any future request.`;
    case 'EXPIRED':
      return 'The request ended by itself when the window closed. Nothing was charged.';
    case 'CANCELLED_BY_CUSTOMER':
      return 'You cancelled this booking. Anything refundable is on its way back to you.';
    case 'CANCELLED_BY_OWNER':
      return `${owner} cancelled this booking. Everything you paid is being refunded in full.`;
    case 'DISPUTED':
      return 'Someone from LAMPOSE is looking at this. Your deposit is not released while it is open.';
  }
}

export function StatusBlock({ booking }: StatusBlockProps) {
  const { colors, space, radius } = useTheme();
  const descriptor = bookingStatus[booking.status];

  const runsTimer = Boolean(descriptor.timer) && Boolean(booking.deadline);
  const context = descriptor.timer === 'payment' ? 'payment' : 'ownerResponse';

  return (
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
      {/* The chip drops its own timer here, because the block below runs one.
          One timer per screen — two means an impossible state. */}
      <BookingStatusChip status={booking.status} timerSuppressed />

      <Text variant="bodyLg" color="secondary">
        {sentenceFor(booking)}
      </Text>

      {runsTimer ? (
        <CountdownTimer
          context={context}
          deadline={booking.deadline!}
          totalSeconds={context === 'payment' ? 7200 : 1800}
        />
      ) : null}

      {booking.status === 'CONFIRMED' ? (
        <View
          style={[
            styles.note,
            { backgroundColor: colors.success.tint, borderRadius: radius.chip, padding: space[3], gap: space[2] },
          ]}
        >
          <Icon name="check" size={20} color={colors.success.base} />
          <Text variant="caption" style={{ color: colors.success.ink, flex: 1 }}>
            Nothing to pay on arrival. Rent and deposit are already paid — say so if you are asked.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  note: { flexDirection: 'row', alignItems: 'flex-start' },
});

/**
 * Which segment a status belongs to is data, not display — see `segmentOf` in
 * `data/bookings.ts`. This helper is only for the list row's one-line summary.
 */
export function summaryLineFor(status: BookingStatus, booking: BookingSummary): string {
  if (status === 'CHECKED_IN') return booking.roomLabel ?? booking.sharingLabel;
  if (booking.endedLabel) return booking.endedLabel;
  return `${booking.sharingLabel} · move in ${booking.moveInLabel}`;
}
