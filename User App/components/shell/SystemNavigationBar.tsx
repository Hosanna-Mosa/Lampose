import * as NavigationBar from 'expo-navigation-bar';
import React, { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/context/ThemeContext';

/**
 * An opaque ground behind the Android system navigation, buttons or gesture.
 *
 * Android 15 made edge-to-edge compulsory for anything targeting SDK 35 or
 * above, and this app targets 36. That is not a setting we opted into and not
 * one we can opt out of: `android:navigationBarColor`, `androidNavigationBar`
 * in the Expo config and `NavigationBar.setBackgroundColorAsync` are all
 * ignored now. The window simply extends under the navigation bar and the bar
 * itself is transparent.
 *
 * So the app draws whatever is behind it. On a screen ending in a white card
 * that is invisible and fine; on the Food home feed, whose cards carry
 * full-bleed photography, the system's marks land on somebody's photograph.
 *
 * Both navigation modes have the problem and both get the same strip:
 *
 * - THREE BUTTONS claim 48dp, and the recents/home/back glyphs vanish into a
 *   dark image.
 * - The GESTURE PILL claims 16-24dp, and a white pill over a bright photo is
 *   just as unreadable — which is what this app looked like on the feed.
 *
 * The fix is the one every app that still looks like it has a navigation bar
 * uses: paint the inset ourselves, on top of everything, and tell the OS which
 * way to tint its marks. Content still scrolls the full height of the window
 * — nothing is clipped or re-laid-out — it just passes behind an opaque band
 * on its way off-screen, which is exactly what it used to do when the OS still
 * painted that band itself.
 *
 * Deliberately a sibling of the navigator rather than something each screen
 * opts into: the strip has to outlive route changes. Mounted per screen it
 * would unmount and remount on every transition, and the transparent frames in
 * between are the flicker this exists to remove.
 */
export function SystemNavigationBar() {
  const { colors, mode } = useTheme();
  const insets = useSafeAreaInsets();

  /*
   * The tint of the system's own marks, which only the OS can set. It covers
   * the three glyphs and the gesture pill alike.
   *
   * Keyed to `mode` — the resolved theme — and not to the OS night setting,
   * because `ThemeProvider` lets a student pin the app to light or dark
   * regardless of what the phone is doing. A night-qualified Android resource
   * (`values-night/styles.xml`) would read the phone and get it backwards for
   * exactly those users.
   *
   * `dark` means dark marks for a light bar, which is the light-theme case.
   *
   * Swallowed rather than surfaced: this is cosmetic, it is Android-only, and
   * on a build made before `expo-navigation-bar` was added the native module
   * is absent and the call rejects. A missing tint is a worse-looking bar, not
   * a broken screen.
   */
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    NavigationBar.setButtonStyleAsync(mode === 'dark' ? 'light' : 'dark').catch(() => {});
  }, [mode]);

  if (Platform.OS !== 'android') return null;
  /* Nothing claimed at the bottom edge — a navigation bar hidden outright, or
     a phone in a mode that has none. There is no band to paint and a zero
     height view would still cost a node on every screen. */
  if (insets.bottom <= 0) return null;

  return (
    <View
      /* The bar belongs to the OS and is hit-tested outside our window.
         Without this the strip would still swallow touches meant for whatever
         sits under it during the frames a screen animates past. */
      pointerEvents="none"
      style={[styles.ground, { height: insets.bottom, backgroundColor: colors.bg }]}
    />
  );
}

const styles = StyleSheet.create({
  ground: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
});
