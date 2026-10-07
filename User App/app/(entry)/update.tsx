import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { Linking, Platform } from 'react-native';

import { updateStoreUrl } from '@/services/appVersion';

import { BlockingScreen } from '@/components/auth';
import { useTheme } from '@/context/ThemeContext';

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
  const { mode } = useTheme();

  return (
    <>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <BlockingScreen
        headline="Update LAMPOSE to keep booking"
        body="Payments and owner replies changed in this version. The one you have cannot show them correctly, so we have stopped it rather than risk a wrong price."
        actionLabel={Platform.OS === 'ios' ? 'Update from the App Store' : 'Update from Play Store'}
        /* It did nothing. Now the store page this server named (or the Play
           listing). */
        onAction={() => { Linking.openURL(updateStoreUrl()).catch(() => {}); }}
        /* No download size: nobody measured one, and "18 MB" was a guess. */
        footnote="Your saved places and bookings stay where they are."
      />
    </>
  );
}
