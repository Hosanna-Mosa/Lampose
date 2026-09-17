import { Box, Tappable } from '@/components/common';
import { Text, BookingStatusBadge, PaymentStatusBadge,  } from '@/components/common';
import { formatINR, formatStayRange } from '@/lib/format';
import { type Booking, hasPlatformMoney, payoutOf } from '@/lib/bookings';
import { useColors } from '@/hooks/useColors';
import { styles } from '@/components/tabs-bookings/styles';

export function BookingRow({ booking, onPress }: { booking: Booking; onPress: () => void }) {
  const c = useColors();
  // A cancelled stay is still a record, but it isn't live — the design dims it.
  const dimmed = booking.status === 'cancelled';
  /*
   * The figure, when there is one — tested on the AMOUNT, not the category.
   *
   * "₹0" was printing on every PG, bachelor and co-living row, which is the
   * same non-answer the detail screen's payout card was giving. But a
   * category test would go too far the other way: a walk-in the owner logged
   * by hand carries a rent they typed themselves (`add-customer`), whatever
   * kind of place it is, and that is their figure to see.
   *
   * The payment BADGE below is a separate question and keeps its own test:
   * an amount somebody wrote down is not money we collected, so a row can
   * honestly show a figure and no payment status at all.
   */
  const payout = payoutOf(booking);

  return (
    <Tappable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[booking.guest, booking.roomType, payout > 0 ? formatINR(payout) : null]
        .filter(Boolean).join(', ')}
      style={({ pressed }) => [
        styles.card,
        {
          borderColor: c.borderCard,
          backgroundColor: c.surface,
          opacity: pressed ? 0.75 : dimmed ? 0.7 : 1,
        },
      ]}
    >
      <Box style={styles.topRow}>
        <Box style={styles.identity}>
          <Text style={styles.guest}>{booking.guest}</Text>
          <Text variant="caption" color="textSecondary" style={styles.meta}>
            {formatStayRange(booking.checkIn, booking.checkOut)} · {booking.roomType}
          </Text>
        </Box>
        {payout > 0 ? (
          <Text tabular style={styles.amount}>
            {formatINR(payout)}
          </Text>
        ) : null}
      </Box>

      <Box style={styles.badges}>
        <BookingStatusBadge status={booking.status} size="sm" />
        {/* Only where money moved through Lampose — see `hasPlatformMoney`.
            Everywhere else the payment figure is 0/0, so the badge read
            "Pending" regardless of how the stay was actually going. */}
        {hasPlatformMoney(booking) ? (
          <PaymentStatusBadge status={booking.payment} size="sm" />
        ) : null}
      </Box>
    </Tappable>
  );
}
