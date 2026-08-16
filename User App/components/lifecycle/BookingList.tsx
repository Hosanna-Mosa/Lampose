import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, SegmentedControl, Text } from '@/components/ui';
import { BookingStatusChip } from '@/components/booking';
import { useTheme } from '@/context/ThemeContext';
import { formatRupees } from '@/utils/money';
import type { BookingSegment, BookingSummary } from '@/data/bookings';
import { useDepositMark } from '@/components/ui/DepositMark';

/**
 * A booking in the list.
 *
 * The chip drops its timer here and the row keeps it — one timer slot per
 * screen, and in a list the row is the better place for it because it sits
 * beside the money it constrains.
 */

export type BookingRowProps = {
  booking: BookingSummary;
  onPress: () => void;
};

export function BookingRow({ booking, onPress }: BookingRowProps) {
  const { colors, space, radius } = useTheme();
  const depositMark = useDepositMark();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${booking.propertyName}, ${booking.reference}`}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: pressed ? colors.surfaceSunken : colors.surface,
          borderColor: colors.border,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: radius.card,
          padding: space[4],
          gap: space[3],
        },
      ]}
    >
      <View style={[styles.head, { gap: space[3] }]}>
        <View style={styles.flex}>
          <Text variant="title3" numberOfLines={1}>
            {booking.propertyName}
          </Text>
          <Text variant="numMeta" color="secondary">
            {booking.reference} · {booking.sharingLabel.toLowerCase()}
          </Text>
        </View>
        <Icon name="chevronRight" size={20} color={colors.textSecondary} />
      </View>

      {/* The chip without its clock — the row below carries the deadline. */}
      <BookingStatusChip status={booking.status} size="sm" timerSuppressed />

      <View style={[styles.money, { gap: space[3] }]}>
        <Text variant="priceSm">{formatRupees(booking.rent)} /mo</Text>
        <Text
          variant="numMeta"
          style={depositMark}
        >
          + {formatRupees(booking.deposit)} deposit
        </Text>
      </View>

      <Text variant="numMeta" color="tertiary">
        {booking.endedLabel ??
          (booking.livingSinceLabel
            ? `Living here since ${booking.livingSinceLabel}`
            : `Move in ${booking.moveInLabel}`)}
      </Text>
    </Pressable>
  );
}

const SEGMENTS = ['Active', 'Requests', 'Past'] as const;
export type SegmentLabel = (typeof SEGMENTS)[number];

const TO_SEGMENT: Record<SegmentLabel, BookingSegment> = {
  Active: 'active',
  Requests: 'requests',
  Past: 'past',
};

export function BookingSegments({
  value,
  onChange,
}: {
  value: BookingSegment;
  onChange: (segment: BookingSegment) => void;
}) {
  const label = (Object.keys(TO_SEGMENT) as SegmentLabel[]).find(
    (key) => TO_SEGMENT[key] === value,
  )!;

  return (
    <SegmentedControl
      options={SEGMENTS}
      value={label}
      onChange={(next) => onChange(TO_SEGMENT[next])}
      accessibilityLabel="Which bookings"
    />
  );
}

const styles = StyleSheet.create({
  row: {},
  head: { flexDirection: 'row', alignItems: 'flex-start' },
  flex: { flex: 1 },
  money: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap' },
});
