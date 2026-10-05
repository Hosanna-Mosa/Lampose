import { useRouter, Redirect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';

import { SplashSequence } from '@/components/auth';
import { useAuth } from '@/context/AuthContext';
import { usePreviewControls } from '@/hooks/useAppEnv';

/**
 * Screen 01 — Splash.
 *
 * The token check and the server-time offset fetch run during the hold. If the
 * check fails we do not block: the app opens as a guest and the offline banner
 * explains itself. Browsing does not require auth, and it never will.
 */
function SplashScreen() {
  const router = useRouter();
  const { status } = useAuth();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (status !== 'hydrating') setChecked(true);
  }, [status]);

  const handleFinish = () => {
    router.replace('/home');
  };

  return (
    <>
      <StatusBar style="light" />
      <SplashSequence waiting={!checked} onFinish={handleFinish} />
    </>
  );
}

/**
 * A design prototype, not a product screen: it runs on fixtures and several of
 * its buttons do nothing. Nothing in the live app links here, but expo-router
 * still registers the route, so a typed or stale `lampose://` link would open
 * it. Outside preview builds it redirects home, like `/preview` does.
 */
export default function SplashScreenRoute() {
  const previewControls = usePreviewControls();
  if (!previewControls) return <Redirect href="/home" />;
  return <SplashScreen />;
}
