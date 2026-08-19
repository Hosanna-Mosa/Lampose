import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';

import { BlockingScreen } from '@/components/auth';
import { useTheme } from '@/context/ThemeContext';
import { usePreviewControls } from '@/hooks/useAppEnv';

/**
 * Screen 02b — Maintenance.
 *
 * Maintenance during a live payment window is the nightmare case, so the
 * screen answers it before it is asked: deadlines pause. The headline is a
 * real clock time from the config's `returnsAt`, never "shortly" and never
 * "we'll be back soon".
 *
 * OPEN QUESTION for the backend — can payment and owner-response deadlines
 * genuinely be paused? If not, the honest copy is "your deadline is still
 * running, and we have extended it by the length of the outage", and that
 * extension has to be real. The current copy promises a pause.
 */
export default function MaintenanceScreen() {
  const previewControls = usePreviewControls();
  const { mode } = useTheme();
  const router = useRouter();

  return (
    <>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <BlockingScreen
        headline="We're back at 6:30 am"
        body="We're moving payments to a faster system. Bookings you already have are safe and no timer is running against you — every deadline is paused until we return."
        notice="Your payment deadline for LAM-4192 is paused with 1 h 12 m left."
        actionLabel="Check again"
        onAction={() => {}}
        cooldownOnAction
        secondaryLabel={previewControls ? 'Leave (preview only)' : 'Message support on WhatsApp'}
        onSecondary={previewControls ? () => router.replace('/preview') : () => {}}
      />
    </>
  );
}
