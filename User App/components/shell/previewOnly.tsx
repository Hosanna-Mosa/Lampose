import { Redirect } from 'expo-router';
import React from 'react';

import { previewControls } from '@/services/runtimeEnv';

/**
 * A screen that exists for design review or as a flow simulator, never for a
 * real student.
 *
 * These routes are files under `app/`, and Expo Router makes every file a deep
 * link — so a production build shipped fixture payment screens with invented
 * discounts, a "payment processing" timer and a local "owner rejects"
 * simulator to anybody who typed the URL. Wrapped in this, a production build
 * sends the link home instead; a preview or development build still opens it.
 * The same rule `app/preview.tsx` already follows.
 */
export function previewOnly<P extends object>(Screen: React.ComponentType<P>) {
  function PreviewOnly(props: P) {
    if (!previewControls()) return <Redirect href="/home" />;
    return <Screen {...props} />;
  }
  PreviewOnly.displayName = `previewOnly(${Screen.displayName || Screen.name || 'Screen'})`;
  return PreviewOnly;
}
