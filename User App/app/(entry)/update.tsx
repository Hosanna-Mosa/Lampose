import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';

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
export default function ForceUpdateScreen() {
  const previewControls = usePreviewControls();
  const { mode } = useTheme();
  const router = useRouter();

  return (
    <>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <BlockingScreen
        headline="Update LAMPOSE to keep booking"
        body="Payments and owner replies changed in this version. The one you have cannot show them correctly, so we have stopped it rather than risk a wrong price."
        actionLabel="Update from Play Store"
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
