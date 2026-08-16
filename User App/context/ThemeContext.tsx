import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, useColorScheme } from 'react-native';

import {
  elevation,
  icon,
  layout,
  money,
  palettes,
  radius,
  space,
  touch,
  type ThemeColors,
} from '@/constants/tokens';

/** What the user picked. `system` follows the OS appearance setting. */
export type ThemePreference = 'light' | 'dark' | 'system';

/** What actually got rendered once `system` is resolved. */
export type ThemeMode = 'light' | 'dark';

export type Theme = {
  mode: ThemeMode;
  colors: ThemeColors;
  space: typeof space;
  radius: typeof radius;
  elevation: typeof elevation;
  touch: typeof touch;
  icon: typeof icon;
  layout: typeof layout;
  money: typeof money;
  /**
   * The OS "reduce motion" setting. Read it before starting any animation —
   * it removes movement, but never legibility motion.
   */
  reduceMotion: boolean;
};

type ThemeContextValue = Theme & {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
};

const PREFERENCE_KEY = '@lampose/theme-preference';

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;

    AsyncStorage.getItem(PREFERENCE_KEY).then((stored) => {
      if (active && (stored === 'light' || stored === 'dark' || stored === 'system')) {
        setPreferenceState(stored);
      }
    });

    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setReduceMotion(enabled);
    });

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    AsyncStorage.setItem(PREFERENCE_KEY, next);
  }, []);

  const mode: ThemeMode =
    preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      colors: palettes[mode],
      space,
      radius,
      elevation,
      touch,
      icon,
      layout,
      money,
      reduceMotion,
      preference,
      setPreference,
    }),
    [mode, reduceMotion, preference, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside ThemeProvider');
  return context;
}

/** Shorthand for the common case of needing colours and nothing else. */
export function useColors(): ThemeColors {
  return useTheme().colors;
}

/**
 * True when the OS asks for less motion.
 *
 * Use it to drop movement — translate, scale, stagger, loops — while leaving
 * colour and opacity changes in place.
 */
export function useReduceMotion(): boolean {
  return useTheme().reduceMotion;
}
