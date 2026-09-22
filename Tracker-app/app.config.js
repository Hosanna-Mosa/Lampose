/**
 * Brand colours for the NATIVE chrome — keep in sync with `theme/index.ts`.
 * No custom icon/splash image yet: this app has no design assets of its own
 * so far, and Expo's own defaults are a fine placeholder until it does.
 */
const BRAND = {
  background: '#FFFFFF',
};

export default {
  expo: {
    name: 'Lampose Tracker',
    slug: 'lampose-tracker',
    version: '1.0.0',
    orientation: 'portrait',
    scheme: 'lamposetracker',
    userInterfaceStyle: 'light',
    newArchEnabled: true,
    splash: {
      resizeMode: 'contain',
      backgroundColor: BRAND.background,
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: 'com.lampose.tracker',
    },
    android: {
      package: 'com.lampose.tracker',
      versionCode: 1,
      adaptiveIcon: {
        backgroundColor: BRAND.background,
      },
      permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION'],
    },
    web: {
      bundler: 'metro',
    },
    plugins: [
      'expo-router',
      [
        'expo-location',
        {
          locationWhenInUsePermission:
            'Lampose Tracker uses your location, while the app is open and you are online, so the admin panel can see where you are visiting clients.',
        },
      ],
    ],
    experiments: {
      typedRoutes: false,
      reactCompiler: true,
    },
    extra: {
      apiUrl: process.env.EXPO_PUBLIC_API_URL,
      eas: {
        projectId: '605c3358-a6d9-465c-aedc-eee17f349728',
      },
    },
  },
};
