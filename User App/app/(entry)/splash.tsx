import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';

import { SplashSequence } from '@/components/auth';
import { useAuth } from '@/context/AuthContext';

/**
 * Screen 01 — Splash.
 *
 * The token check and the server-time offset fetch run during the hold. If the
 * check fails we do not block: the app opens as a guest and the offline banner
 * explains itself. Browsing does not require auth, and it never will.
 */
export default function SplashScreen() {
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
