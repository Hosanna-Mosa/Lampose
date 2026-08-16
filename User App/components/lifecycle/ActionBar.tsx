import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';
import type { BookingSummary } from '@/data/bookings';
import { actions } from '@/constants/actions';

/**
 * The other slot that changes by status.
 *
 * Four rules, and they hold for all thirteen:
 *
 *  1. **At most one primary action**, always in the bottom third — thumb
 *     territory.
 *  2. **A destructive action is never primary and never adjacent to it.** Cancel
 *     sits below, ghost, full width, with a gap — so the thumb travelling to the
 *     primary never passes over it.
 *  3. **A terminal status still offers something forward-looking.** Rebook,
 *     rebook, find similar. A dead end is a design bug.
 *  4. **Support is reachable from every one of the thirteen.**
 */

export type ActionBarProps = {
  booking: BookingSummary;
  onPrimary?: () => void;
  onSecondary?: () => void;
  onDestructive?: () => void;
  onSupport?: () => void;
};

type Actions = {
  primary?: string;
  secondary?: string;
  destructive?: string;
};

function actionsFor(booking: BookingSummary): Actions {
  switch (booking.status) {
    case 'REQUESTED':
      return { secondary: actions.support, destructive: 'Cancel this request' };
    case 'ACCEPTED':
    case 'PAYMENT_PENDING':
      return { primary: 'Pay to confirm', destructive: 'Cancel this request' };
    case 'PAYMENT_FAILED':
      return { primary: 'Try the payment again', destructive: 'Cancel this request' };
    case 'CONFIRMED':
      return { primary: 'Show move-in code', secondary: 'Change my move-in date', destructive: 'Cancel this booking' };
    case 'CHECKED_IN':
      return {
        primary: 'Message the owner',
        secondary: 'Raise an issue',
        destructive: actions.giveNotice,
      };
    case 'CHECKED_OUT':
      return { primary: 'Track my deposit', secondary: 'Book here again' };
    case 'COMPLETED':
      return { primary: 'Book here again', secondary: 'Find similar places' };
    case 'REJECTED':
    case 'EXPIRED':
      // Terminal, but never a dead end.
      return { primary: 'Find similar places', secondary: 'Send the request again' };
    case 'CANCELLED_BY_CUSTOMER':
    case 'CANCELLED_BY_OWNER':
      return { primary: 'Find somewhere else', secondary: 'Track my refund' };
    case 'DISPUTED':
      return { primary: actions.support, secondary: 'See what we have asked the owner' };
  }
}

export function ActionBar({
  booking,
  onPrimary,
  onSecondary,
  onDestructive,
  onSupport,
}: ActionBarProps) {
  const { space } = useTheme();
  const slots = actionsFor(booking);

  return (
    <View style={{ gap: space[2] }}>
      {slots.primary ? <Button label={slots.primary} onPress={onPrimary} fullWidth /> : null}
      {slots.secondary ? (
        <Button label={slots.secondary} variant="secondary" onPress={onSecondary} fullWidth />
      ) : null}

      {/* Support, from every one of the thirteen. */}
      <Button label={actions.support} variant="ghost" onPress={onSupport} fullWidth />

      {slots.destructive ? (
        // Separated by a real gap, so the thumb reaching the primary never
        // passes over it.
        <View style={{ marginTop: space[4] }}>
          <Button
            label={slots.destructive}
            variant="destructive"
            onPress={onDestructive}
            fullWidth
          />
          <Text variant="caption" color="tertiary" style={[styles.centred, { marginTop: space[2] }]}>
            {booking.status === 'CHECKED_IN'
              ? `You need to give ${booking.noticePeriodDays} days' notice.`
              : 'Anything you have paid is refunded according to the terms above.'}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  centred: { textAlign: 'center' },
});
