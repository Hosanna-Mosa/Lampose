const fs = require('fs');
const path = require('path');

// Firebase config is per-installation and is not committed. Drop your own
// google-services.json next to this file to enable Android push notifications.
const googleServicesPath = path.join(__dirname, 'google-services.json');
const googleServicesFile = fs.existsSync(googleServicesPath)
  ? './google-services.json'
  : undefined;

/** Brand colours — keep in sync with `theme/index.ts`. */
const BRAND = {
  ink: '#201f1d',
  accent: '#b68235',
  background: '#f3f2f2',
};

export default {
  expo: {
    name: 'Lampose Driver',
    slug: 'driver',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.jpeg',
    scheme: 'driver',
    userInterfaceStyle: 'light',
    newArchEnabled: true,
    splash: {
      image: './assets/images/splash-icon.jpeg',
      resizeMode: 'contain',
      backgroundColor: BRAND.background,
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: 'com.driver.app',
      config: {
        googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
      },
      infoPlist: {
        UIBackgroundModes: ['location', 'remote-notification'],
      },
    },
    android: {
      package: 'com.driver.app',
      ...(googleServicesFile ? { googleServicesFile } : {}),
      adaptiveIcon: {
        foregroundImage: './assets/images/adaptive-icon.jpeg',
        backgroundColor: BRAND.background,
      },
      config: {
        googleMaps: {
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
        },
      },
      permissions: [
        'ACCESS_COARSE_LOCATION',
        'ACCESS_FINE_LOCATION',
        'ACCESS_BACKGROUND_LOCATION',
        'android.permission.POST_NOTIFICATIONS',
        'android.permission.RECEIVE_BOOT_COMPLETED',
      ],
    },
    notification: {
      icon: './assets/images/notification-icon.jpeg',
      color: BRAND.ink,
    },
    web: {
      favicon: './assets/images/icon.jpeg',
      bundler: 'metro',
    },
    plugins: [
      'expo-router',
      [
        'expo-location',
        {
          locationAlwaysAndWhenInUsePermission:
            'Driver uses your location to match you with nearby jobs and to share live trip progress with customers, including while the app is in the background.',
          locationWhenInUsePermission:
            'Driver uses your location to match you with nearby jobs and to navigate to pickup and drop points.',
          isAndroidBackgroundLocationEnabled: true,
        },
      ],
      'expo-font',
      'expo-web-browser',
      [
        'expo-notifications',
        {
          icon: './assets/images/notification-icon.jpeg',
          color: BRAND.ink,
        },
      ],
    ],
    experiments: {
      // Disabled: expo-router's typed-route generator strips a trailing
      // "/index" before normalising Windows backslashes, so `(tabs)/index.tsx`
      // is typed as `/index` instead of `/`, and files outside app/ leak in as
      // routes. The generated .d.ts then fails `npm run typecheck` even though
      // the routes resolve correctly at runtime. Re-enable once that is fixed.
      typedRoutes: false,
      reactCompiler: true,
    },
    extra: {
      apiUrl: process.env.EXPO_PUBLIC_API_URL,
      // Run `eas init` to create a project and populate `extra.eas.projectId`.
    },
  },
};
