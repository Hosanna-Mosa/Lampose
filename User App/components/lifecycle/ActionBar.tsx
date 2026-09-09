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
  /**
   * BACHELOR, PG_HOSTEL and COLIVE only — see the note on `actionsFor`.
   * Every other category leaves this undefined and gets the switch below
   * unchanged.
   */
  category?: string | null;
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

/**
 * `CONFIRMED` and `CHECKED_IN`, for a bachelor room, PG/Hostel or Co-living,
 * offer nothing.
 *
 * From the moment any of the three is confirmed it is a direct arrangement
 * with the owner — rent, the code at the door, moving out, all of it,
 * exactly as the terms card on this screen already states ("Rent and
 * deposit are settled directly with the owner" / "Lampose does not hold
 * them" / "Lampose is not part of that arrangement"). Lampose facilitated
 * the introduction and, where one was charged, the bachelor assisted-visit
 * fee; it has no channel to message an owner through, no queue that "raise
 * an issue" would reach, and no record of a move-out notice to act on for
 * any of the three. Every button these two statuses used to offer named
 * something Lampose cannot actually do here, which is worse than offering
 * nothing — a "Message the owner" button with no owner-messaging behind it
 * is a promise the tap breaks. Co-living was added here alongside the other
 * two once its own payment step was removed — the same "nothing moves
 * through Lampose" fact the other two are gated on.
 *
 * Every OTHER status keeps its buttons, all three categories included: the
 * request stage and the assisted-visit payment are real Lampose processes
 * regardless of category, so "Cancel this request" and the payment retry
 * still mean something there.
 */
function actionsFor(booking: BookingSummary, category?: string | null): Actions {
  if ((category === 'BACHELOR' || category === 'PG_HOSTEL' || category === 'COLIVE')
    && (booking.status === 'CONFIRMED' || booking.status === 'CHECKED_IN')) {
    return {};
  }

  switch (booking.status) {
    case 'REQUESTED':
      return { secondary: actions.support, destructive: 'Cancel this request' };
    case 'ACCEPTED':
    case 'PAYMENT_PENDING':
      return { primary: 'Pay to confirm', destructive: 'Cancel this request' };
    case 'PAYMENT_FAILED':
      return { primary: 'Try the payment again', destructive: 'Cancel this request' };
    case 'CONFIRMED':
      /* No "Show move-in code" — the code is now shown directly at the top
         of the booking screen instead of behind a reveal tap, so there is
         nothing left for a primary action here to do. */
      return { secondary: 'Change my move-in date', destructive: 'Cancel this booking' };
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
  category,
  onPrimary,
  onSecondary,
  onDestructive,
  onSupport,
}: ActionBarProps) {
  const { space } = useTheme();
  const slots = actionsFor(booking, category);
  /* Support is "reachable from every one of the thirteen" — except these two
     for a bachelor room, PG/Hostel or Co-living, where it is exactly the
     button this whole gate is about: Lampose support has no ticket queue for
     a landlord dispute it was never told about. Kept as its own check
     because it is the one row that is not driven by `slots`. */
  const hideSupport = (category === 'BACHELOR' || category === 'PG_HOSTEL' || category === 'COLIVE')
    && (booking.status === 'CONFIRMED' || booking.status === 'CHECKED_IN');

  if (!slots.primary && !slots.secondary && !slots.destructive && hideSupport) return null;

  return (
    <View style={{ gap: space[2] }}>
      {slots.primary ? <Button label={slots.primary} onPress={onPrimary} fullWidth /> : null}
      {slots.secondary ? (
        <Button label={slots.secondary} variant="secondary" onPress={onSecondary} fullWidth />
      ) : null}

      {/* Support, from every one of the thirteen — bar the two above. */}
      {!hideSupport ? <Button label={actions.support} variant="ghost" onPress={onSupport} fullWidth /> : null}

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
              ? (booking.noticePeriodDays != null
                ? `You need to give ${booking.noticePeriodDays} days' notice.`
                : 'Talk to the owner about moving out — Lampose is not part of that arrangement.')
              : (booking.rent != null
                ? 'Anything you have paid is refunded according to the terms above.'
                : 'The bed goes back on the market straight away. Anything paid the owner directly is between the two of you.')}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  centred: { textAlign: 'center' },
});
