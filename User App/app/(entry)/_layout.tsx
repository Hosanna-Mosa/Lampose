import { Stack } from 'expo-router';
import React from 'react';

import { signature } from '@/constants/motion';
import { useReduceMotion, useTheme } from '@/context/ThemeContext';

/**
 * The entry flow.
 *
 * Signing in is two screens and a name — phone, code, profile — and it is
 * reached from an action that needs an account, never on the way into the app.
 * The one-time location screen lives here too, because it is first-run rather
 * than signup.
 *
 * The two blocking screens live in this group but opt out of the push
 * transition: they did not come from anywhere, and sliding them in would imply
 * a way back.
 */
export default function EntryLayout() {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
        animation: reduceMotion ? 'fade' : 'slide_from_right',
        animationDuration: reduceMotion
          ? signature.screenPush.reducedDuration
          : signature.screenPush.duration,
      }}
    >
      <Stack.Screen name="splash" options={{ animation: 'fade' }} />
      <Stack.Screen name="update" options={{ animation: 'fade', gestureEnabled: false }} />
      <Stack.Screen name="maintenance" options={{ animation: 'fade', gestureEnabled: false }} />
    </Stack>
  );
}
