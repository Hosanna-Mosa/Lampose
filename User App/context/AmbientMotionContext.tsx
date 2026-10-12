import React, { createContext, useContext } from 'react';

/**
 * Whether decorative, forever-looping animation should stop.
 *
 * Home carries a lot of it — the street scene behind the hero (cars, walkers,
 * visitors, a cloud, sparkles, lit windows), the drifting glows, the Food
 * door's pulse and the ongoing strip's clock and radar. Each is a Reanimated
 * loop that updates a view every frame, forever.
 *
 * Nothing stopped them. Home stays mounted under every screen pushed on top of
 * it, so a student reading a listing, paying, or chatting with support was
 * still running twenty-odd animations behind the screen they were on — and on
 * the New Architecture every one of those frames is a shadow-tree commit that
 * the next React update (the tap, the navigation, the tab change) has to wait
 * its turn behind. That queue was the lag on every button in the app.
 *
 * So the screen that owns the loops says when nobody can see them — it is
 * covered, or the part they live in has scrolled away — and each loop freezes
 * where it is until it is visible again. Unlike reduced motion (which puts
 * everything in a still pose), pausing only stops the clock.
 *
 * Defaults to `false`, so a component used outside a provider animates as it
 * always did.
 */
const AmbientMotionContext = createContext(false);

export function AmbientMotionProvider({ paused, children }: { paused: boolean; children: React.ReactNode }) {
  /* A pause anywhere above wins: a scrolled-away hero on a covered screen is
     still paused when the screen comes back, until it scrolls back too. */
  const outer = useContext(AmbientMotionContext);
  return (
    <AmbientMotionContext.Provider value={outer || paused}>{children}</AmbientMotionContext.Provider>
  );
}

export function useAmbientPaused(): boolean {
  return useContext(AmbientMotionContext);
}
