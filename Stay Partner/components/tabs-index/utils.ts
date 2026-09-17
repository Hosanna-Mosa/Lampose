/*
 * Helpers and types belonging to app/(tabs)/index.tsx, used by the components
 * extracted from it. §4: "shared helpers to its utils".
 */


export const HERO_WIPE_MS = 900;

/**
 * Replaces the old bare greeting line + floating availability pill with one
 * anchored surface. The gradient wash of the brand green is only earned while
 * the owner is actually accepting bookings — the one place on this screen
 * allowed to be loud, since everything below it goes back to the neutral
 * surface. While the switch in the header is off, the card goes back to that
 * same neutral surface too, rather than staying green and claiming an
 * availability that isn't true.
 *
 * Crossfades between the two rather than snapping — see the note inside the
 * function for why it's a fade and not the wipe originally asked for.
 */
