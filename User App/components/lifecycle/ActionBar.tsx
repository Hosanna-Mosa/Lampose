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
 * `CONFIRMED` and `CHECKED_IN` offer nothing, on every category.
 *
 * From the moment a booking is confirmed it is a direct arrangement with the
 * owner — rent, the code at the door, moving out, all of it, exactly as the
 * terms card on this screen already states ("Rent and deposit are settled
 * directly with the owner" / "Lampose does not hold them" / "Lampose is not
 * part of that arrangement"). Lampose facilitated the introduction and, where
 * one was charged, the payment; it has no channel to message an owner
 * through, no queue that "raise an issue" would reach, and no record of a
 * move-out notice to act on. Every button these two statuses used to offer
 * named something Lampose cannot actually do, which is worse than offering
 * nothing — a "Message the owner" button with no owner-messaging behind it is
 * a promise the tap breaks.
 *
 * ## It used to name three categories, and the fourth was the exception
 *
 * Bachelor, PG/Hostel and Co-living were listed; HOTEL was not, so a guest in
 * a capsule pod was still shown "Message the owner", "Raise an issue" and
 * "Give notice to move out" — four controls with nothing behind any of them.
 * Paying Lampose for the stay does not create an owner-messaging channel or a
 * notice period; it settles the room, and everything after that is between
 * the guest and the building.
 *
 * With the fourth added the list said nothing the status did not, so it is
 * gone: the STATUS is the rule. That also covers a booking whose category is
 * blank — written before the field existed, or whose property could not be
 * read — which the old list quietly excluded and handed a full set of dead
 * buttons to.
 *
 * Every OTHER status keeps its buttons, on every category: the request stage
 * and the payment are real Lampose processes, so "Cancel this request", the
 * payment retry and "Track my refund" still mean something there.
 */
function actionsFor(booking: BookingSummary, category?: string | null): Actions {
  if (booking.status === 'CONFIRMED' || booking.status === 'CHECKED_IN') {
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
    /* CONFIRMED and CHECKED_IN are not here. The guard above returns for both
       on every category, so TypeScript proves these two cases unreachable —
       which is the check that the guard really is total rather than a list of
       categories somebody has to remember to extend. What they used to offer
       ("Message the owner", "Raise an issue", "Change my move-in date",
       "Give notice to move out") is the set of things Lampose cannot do once
       a booking is a direct arrangement. */
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

/* Support is "reachable from every one of the thirteen" — except these two,
   where it is exactly the button the gate above is about: Lampose support has
   no ticket queue for a landlord dispute it was never told about. Its own
   function because it is the one row `actionsFor` does not describe, and it
   follows the same rule for the same reason. */
function supportHidden(booking: BookingSummary): boolean {
  return booking.status === 'CONFIRMED' || booking.status === 'CHECKED_IN';
}

/**
 * Whether this bar renders anything at all.
 *
 * Exported because a screen whose only footer is this bar needs to know when
 * it has none: on a confirmed bachelor, PG or co-living booking every slot is
 * empty by design, and the page then ended on a paragraph with no way off it.
 * The caller offers its own way out rather than this file inventing an action
 * the gate above exists to withhold.
 */
export function hasActions(booking: BookingSummary, category?: string | null): boolean {
  const slots = actionsFor(booking, category);
  return Boolean(slots.primary || slots.secondary || slots.destructive)
    || !supportHidden(booking);
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
  const hideSupport = supportHidden(booking);

  if (!hasActions(booking, category)) return null;

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
