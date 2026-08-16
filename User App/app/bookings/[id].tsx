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

        {codeOpen && booking.verificationCode ? (
          <View
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderWidth: StyleSheet.hairlineWidth,
              borderRadius: radius.card,
              padding: space[4],
            }}
          >
            <VerificationCodeDisplay
              code={booking.verificationCode}
              bookingReference={booking.reference}
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
