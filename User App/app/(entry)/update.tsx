import { useRouter, Redirect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { Platform } from 'react-native';

import { BlockingScreen } from '@/components/auth';
import { useTheme } from '@/context/ThemeContext';
import { usePreviewControls } from '@/hooks/useAppEnv';

/**
 * Screen 02a — Force update.
 *
 * The reason is stated in terms of the user's risk — a wrong price — not ours.
 * The download size is named because data costs money here, and the sentence
 * about saved places exists because "will I lose my shortlist?" is the actual
 * question behind hesitating to update.
 *
 * No "later", no ✕, no back handler.
 */
function ForceUpdateScreen() {
  const previewControls = usePreviewControls();
  const { mode } = useTheme();
  const router = useRouter();

  return (
    <>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <BlockingScreen
        headline="Update LAMPOSE to keep booking"
        body="Payments and owner replies changed in this version. The one you have cannot show them correctly, so we have stopped it rather than risk a wrong price."
        actionLabel={Platform.OS === 'ios' ? 'Update from the App Store' : 'Update from Play Store'}
        onAction={() => {}}
        footnote="About 18 MB. Your saved places and bookings stay where they are."
        // Dev only. In a real build this screen renders above the navigator
        // with no way past it — a blocking screen with an escape hatch is not
        // a blocking screen. The exit exists so the preview is navigable.
        secondaryLabel={previewControls ? 'Leave (preview only)' : undefined}
        onSecondary={previewControls ? () => router.replace('/preview') : undefined}
      />
    </>
  );
}

/**
 * A design prototype, not a product screen: it runs on fixtures and several of
 * its buttons do nothing. Nothing in the live app links here, but expo-router
 * still registers the route, so a typed or stale `lampose://` link would open
 * it. Outside preview builds it redirects home, like `/preview` does.
 */
export default function ForceUpdateScreenRoute() {
  const previewControls = usePreviewControls();
  if (!previewControls) return <Redirect href="/home" />;
  return <ForceUpdateScreen />;
}
