import type { ViewStyle } from 'react-native';

/**
 * The home screen without card chrome — a trial.
 *
 * `true`: the Bookings and Payouts cards, the Rent & Residents banner and
 * tiles, Manage Rooms, Quick Actions and Refer & Earn lose their fill, border
 * and shadow and sit straight on the page. Icons, text and colours stay.
 *
 * `false` puts every card back exactly as it was. This one switch is the
 * whole change; nothing else needs touching to revert it.
 *
 * The green "Good morning" hero is not affected: its white text sits on its
 * photograph and would be unreadable on the bare page.
 */
export const FLAT_HOME_CARDS = false;

/** Laid over a card's own style when `FLAT_HOME_CARDS` is on. */
export const flatCard: ViewStyle | null = FLAT_HOME_CARDS
  ? {
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderColor: 'transparent',
    shadowOpacity: 0,
    elevation: 0,
  }
  : null;
